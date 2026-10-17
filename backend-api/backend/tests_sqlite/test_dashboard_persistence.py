# ruff: noqa: S101, PLR0914, PLR0915, PLR2004
"""Verify real bulk-save storage and its existing failure boundaries."""

import gzip
import json
import sqlite3
from uuid import UUID, uuid4

import pytest
from conftest import SANDBOX, file_engine
from fastapi import HTTPException
from rq.timeouts import JobTimeoutException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from api import crud, helpers, models, schemas
from tests_sqlite.read_support import display, people
from utilities.config import settings


def content(version):
    return {
        "name": "Portfolio risk",
        "layout": [{"i": "prices", "x": version, "y": 0, "w": 8, "h": 5}],
        "widgets": {
            "prices": {
                "parameters": {"symbol": "SPY", "provider": "fmp", "start_date": "2025-01-01"},
                "chart": {"series": [{"name": "USD", "data": [None, -12.5, version]}], "logScale": False},
            }
        },
    }


async def save(session, owner_id, role_id, items):
    await crud.bulk_dashboard_insert_update(session, schemas.DashboardsCreate(items=items), owner_id, role_id)


async def assert_stored(session, identity, owner_id, entity_id, payload):
    row = (await session.execute(select(models.DashboardItem).where(models.DashboardItem.uuid == identity))).scalar_one()
    assert isinstance(row.uuid, UUID)
    assert (row.uuid, row.owner_uuid, row.creator_uuid, row.entity_uuid) == (identity, owner_id, owner_id, entity_id)
    assert row.content == payload
    raw = (
        await session.execute(text("SELECT content FROM dashboard_item WHERE uuid = :uuid"), {"uuid": identity.bytes})
    ).scalar_one()
    assert isinstance(raw, bytes) and raw.startswith(b"\x1f\x8b")
    assert json.loads(gzip.decompress(raw)) == payload
    return row.created_date, row.updated_date


async def test_bulk_insert_update_engine_reopen(sqlite_store, monkeypatch):
    path, engine, sessions = sqlite_store
    assert path.resolve().is_relative_to(SANDBOX.resolve())
    calls = []
    monkeypatch.setattr(helpers.rq_results.rq_que, "enqueue", lambda *args, **kwargs: calls.append((args, kwargs)))
    identity = uuid4()
    async with sessions() as session:
        entities, roles, users = await people(session)
        owner_id, role_id, entity_id = users[0].uuid, roles[0].uuid, entities[0].uuid
        owner_name = display(users[0])
        await save(session, owner_id, role_id, {identity: content(1)})
        inserted_dates = await assert_stored(session, identity, owner_id, entity_id, content(1))
        assert inserted_dates[0] is not None and inserted_dates[1] >= inserted_dates[0]
        assert not calls
        await save(session, owner_id, role_id, {identity: content(2)})
        updated_dates = await assert_stored(session, identity, owner_id, entity_id, content(2))
        assert updated_dates[0] == inserted_dates[0] and updated_dates[1] >= inserted_dates[1]
        result = (await crud.get_user_dashboards_owned(session, owner_id))[identity]
        assert result.content == content(2) and result.creator is True and result.created_by == owner_name
        assert (result.created_date, result.updated_date) == updated_dates
    await engine.dispose()
    reopened = file_engine(path)
    try:
        async with async_sessionmaker(reopened, expire_on_commit=False)() as session:
            assert (await session.execute(text("PRAGMA foreign_keys"))).scalar_one() == 1
            assert await assert_stored(session, identity, owner_id, entity_id, content(2)) == updated_dates
            result = await crud.get_user_dashboards_owned(session, owner_id)
            assert set(result) == {identity}
            assert result[identity].content == content(2)
            assert result[identity].creator is True and result[identity].created_by == owner_name
            assert (result[identity].created_date, result[identity].updated_date) == updated_dates
    finally:
        await reopened.dispose()
    assert calls == [
        (
            (helpers.worker_tasks.update_share_files, str(owner_id), str(identity), None),
            {"job_timeout": settings.RQ_TIMEOUT},
        )
    ]


@pytest.mark.parametrize("failure", [None, JobTimeoutException, RuntimeError])
async def test_real_share_helper_commit_before_enqueue(sqlite_store, monkeypatch, failure):
    path, _engine, sessions = sqlite_store
    identity, calls = uuid4(), []
    async with sessions() as session:
        entities, roles, users = await people(session)
        owner_id, role_id, entity_id = users[0].uuid, roles[0].uuid, entities[0].uuid
        await save(session, owner_id, role_id, {identity: content(1)})

        def enqueue(*args, **kwargs):
            # A separate connection can see only committed bytes, including at failure time.
            with sqlite3.connect(path) as connection:
                raw = connection.execute(
                    "SELECT content FROM dashboard_item WHERE uuid = ?", (identity.bytes,)
                ).fetchone()[0]
            assert json.loads(gzip.decompress(raw)) == content(2)
            calls.append((args, kwargs))
            if failure:
                raise failure("deterministic queue failure")

        monkeypatch.setattr(helpers.rq_results.rq_que, "enqueue", enqueue)
        if failure is RuntimeError:
            with pytest.raises(RuntimeError, match="deterministic queue failure"):
                await save(session, owner_id, role_id, {identity: content(2)})
            await session.rollback()
        else:
            await save(session, owner_id, role_id, {identity: content(2)})
        assert calls == [
            (
                (helpers.worker_tasks.update_share_files, str(owner_id), str(identity), None),
                {"job_timeout": settings.RQ_TIMEOUT},
            )
        ]
    async with sessions() as session:
        await assert_stored(session, identity, owner_id, entity_id, content(2))
        assert (await crud.get_user_dashboards_owned(session, owner_id))[identity].content == content(2)


@pytest.mark.parametrize("operation", ["foreign_update", "foreign_delete", "duplicate_id"])
async def test_failed_bulk_save_preserves_other_owner(sqlite_store, operation):
    _path, _engine, sessions = sqlite_store
    identity = uuid4()
    async with sessions() as session:
        entities, roles, users = await people(session)
        owner_id, role_id, entity_id = users[0].uuid, roles[0].uuid, entities[0].uuid
        attacker_id, attacker_role = users[3].uuid, roles[2].uuid
        recipient_id = users[2].uuid
        await save(session, owner_id, role_id, {identity: content(1)})
        original_dates = await assert_stored(session, identity, owner_id, entity_id, content(1))
        await session.rollback()
        if operation == "foreign_delete":
            with pytest.raises(HTTPException) as error:
                await save(session, attacker_id, attacker_role, {identity: "DELETE"})
            assert error.value.status_code == 400 and error.value.detail == "User does not own dashboard"
        else:
            # Existing foreign updates enter INSERT and collide; this is not a new HTTP authorization contract.
            target_id, target_role = (owner_id, role_id) if operation == "duplicate_id" else (attacker_id, attacker_role)
            if operation == "duplicate_id":
                # Omit the owner's row from the owned set using a real, distinct owner.
                target_id, target_role = recipient_id, role_id
            with pytest.raises(IntegrityError, match="UNIQUE constraint failed: dashboard_item.uuid"):
                await save(session, target_id, target_role, {identity: content(99)})
        await session.rollback()
        assert await crud.get_user_dashboards_owned(session, attacker_id) == {}
    async with sessions() as session:
        assert await assert_stored(session, identity, owner_id, entity_id, content(1)) == original_dates
        result = await crud.get_user_dashboards_owned(session, owner_id)
        assert set(result) == {identity} and result[identity].content == content(1)
