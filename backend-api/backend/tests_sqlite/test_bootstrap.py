# ruff: noqa: S101, PLR0914
"""Prove the isolation boundary and original mapped storage on SQLite."""

import gzip
import json
import socket
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from conftest import DENIED_READS, DOTENV_CONSTRUCTIONS, SANDBOX, file_engine
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from api import models
from tests_sqlite import fixtures
from utilities.config import settings


def test_bootstrap_isolation():
    assert Path.cwd() == SANDBOX
    assert str(SANDBOX / "settings.db") == settings.DB_PATH
    assert settings.STORAGE_PROVIDER == "folder"
    assert any(str(path).endswith("envs/.env") for path in DOTENV_CONSTRUCTIONS)
    assert not DENIED_READS
    with pytest.raises(PermissionError, match="Network"):
        socket.getaddrinfo("example.com", 443)
    with socket.socket() as connection, pytest.raises(PermissionError, match="Network"):
        connection.connect(("127.0.0.1", 9))


async def test_real_fixture_roundtrip(sqlite_store):
    path, engine, sessions = sqlite_store
    assert path.resolve().is_relative_to(SANDBOX.resolve())
    payload = {
        "name": "Risk dashboard",
        "widgets": {"risk": {"parameters": {"symbol": "SPY"}, "layout": [1, 2, 3], "chart": {"state": [None, 0, -12.5]}}},
    }
    async with sessions() as session:
        kind = fixtures.entity_type()
        session.add(kind)
        await session.flush()
        organization = fixtures.entity(kind)
        session.add(organization)
        await session.flush()
        role = fixtures.permissions(organization)
        session.add(role)
        await session.flush()
        owner, creator, recipient, unrelated = [fixtures.user(role) for _ in range(4)]
        session.add_all([owner, creator, recipient, unrelated])
        await session.flush()
        item = fixtures.dashboard(owner, creator, organization, content=payload)
        application = fixtures.app(owner, content=payload)
        session.add_all([item, application])
        await session.flush()
        session.add_all([fixtures.dashboard_share(item, recipient), fixtures.app_share(application, recipient)])
        await session.commit()
        identity, owner_id, creator_id = item.uuid, owner.uuid, creator.uuid
        assert isinstance(identity, UUID) and item.created_date is not None
        assert (await session.execute(text("PRAGMA foreign_keys"))).scalar_one() == 1
        raw = (await session.execute(text("SELECT content FROM dashboard_item"))).scalar_one()
        assert isinstance(raw, bytes) and raw.startswith(b"\x1f\x8b")
        assert json.loads(gzip.decompress(raw)) == payload
        invalid = fixtures.dashboard(owner, creator, owner_uuid=uuid4())
        session.add(invalid)
        with pytest.raises(IntegrityError, match="FOREIGN KEY"):
            await session.flush()
        await session.rollback()
    await engine.dispose()
    reopened = file_engine(path)
    try:
        async with async_sessionmaker(reopened, expire_on_commit=False)() as session:
            stored = (await session.execute(select(models.DashboardItem))).scalar_one()
            assert (stored.uuid, stored.owner_uuid, stored.creator_uuid) == (identity, owner_id, creator_id)
            assert stored.content == payload
            assert (await session.execute(select(models.UserApp))).scalar_one().content == payload
            assert len((await session.execute(select(models.DashboardShare))).scalars().all()) == 1
            assert len((await session.execute(select(models.UserAppShare))).scalars().all()) == 1
    finally:
        await reopened.dispose()
