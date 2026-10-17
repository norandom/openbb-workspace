# ruff: noqa: S101, PLR0914, PLR0915
"""Exercise dashboard identity, membership and raw projection cardinality."""

import warnings
from uuid import uuid4

import pytest
from sqlalchemy.exc import SAWarning

from api import base, crud
from tests_sqlite import fixtures
from tests_sqlite.read_support import NAMES, CapturedReads, assert_projection, display, people

PATHS = ["owned", "shared", "entity_shared_noex", "entity_shared"]


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("names", NAMES)
async def test_dashboard_names(sqlite_store, path, names):
    async with sqlite_store[2]() as session:
        entities, roles, (owner, creator, recipient, unrelated) = await people(session)
        named = owner if path == "entity_shared_noex" else creator
        named.first_name, named.last_name = names
        content = {"name": "Read identity", "widgets": {}, "nested": {"currency": "USD", "values": [-1, None, 3]}}
        item = fixtures.dashboard(owner, creator, entities[0], entity_share=True, is_shared=True, content=content)
        session.add(item)
        await session.flush()
        session.add(fixtures.dashboard_share(item, recipient))
        await session.flush()
        capture = CapturedReads(session)
        user = owner if path == "owned" else recipient
        args = [capture, user.uuid]
        if path.startswith("entity"):
            args.append(roles[0].uuid)
        with warnings.catch_warnings():
            warnings.simplefilter("error", SAWarning)
            result = await getattr(crud, "get_user_dashboards_" + path)(*args)
        assert set(result) == {item.uuid}
        value = result[item.uuid]
        assert value.created_by == display(named)
        assert value.creator is False
        assert value.is_shared is (path == "owned")
        assert value.content == content
        assert value.created_date == item.created_date and value.updated_date == item.updated_date
        assert_projection(capture, 1)


async def test_entity_raw_cardinality(sqlite_store):
    async with sqlite_store[2]() as session:
        entities, roles, (owner, creator, recipient, unrelated) = await people(session)
        item = fixtures.dashboard(owner, creator, entities[0], entity_share=True)
        session.add(item)
        await session.flush()
        capture = CapturedReads(session)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", SAWarning)
            result = await crud.get_user_dashboards_entity_shared(capture, recipient.uuid, roles[0].uuid)
        query, rows = capture.projection()
        assert len(rows) == 1, (
            f"one creator per dashboard; got {len(rows)} rows; warnings={[str(w.message) for w in caught]}"
        )
        assert not caught
        assert rows[0].creator_uuid == creator.uuid
        assert result[item.uuid].created_by == display(creator)


async def test_dashboard_membership(sqlite_store):
    async with sqlite_store[2]() as session:
        entities, roles, (owner, creator, recipient, unrelated) = await people(session)
        common = dict(entity_share=True)
        items = [
            fixtures.dashboard(owner, creator, entities[0], **common),
            fixtures.dashboard(creator, owner, entities[0], **common),
            fixtures.dashboard(unrelated, creator, entities[1], **common),
            fixtures.dashboard(recipient, creator, entities[0], **common),
            fixtures.dashboard(owner, owner, entities[0]),
            fixtures.dashboard(owner, creator, entities[0]),
            fixtures.dashboard(owner, creator, entities[0]),
        ]
        session.add_all(items)
        await session.flush()
        session.add_all(
            [
                fixtures.dashboard_share(items[0], recipient),
                fixtures.dashboard_share(items[1], recipient, active=False),
                fixtures.dashboard_share(items[2], unrelated),
                fixtures.dashboard_share(items[3], recipient),
                fixtures.dashboard_share(items[4], recipient, active=False),
                fixtures.dashboard_share(items[5], unrelated),
                fixtures.dashboard_share(items[6], recipient, permissions=base.PermissionEnum.edit),
            ]
        )
        await session.flush()
        with warnings.catch_warnings():
            warnings.simplefilter("error", SAWarning)
            capture = CapturedReads(session)
            owned = await crud.get_user_dashboards_owned(capture, owner.uuid)
            assert set(owned) == {items[i].uuid for i in (0, 4, 5, 6)}
            assert owned[items[4].uuid].creator is True
            assert owned[items[0].uuid].creator is False
            assert set(await crud.get_user_dashboards_shared(capture, recipient.uuid)) == {items[0].uuid, items[6].uuid}
            assert set(await crud.get_user_dashboards_entity_shared_noex(capture, recipient.uuid, roles[0].uuid)) == {
                items[0].uuid
            }
            noex = await crud.get_user_dashboards_entity_shared_noex(capture, recipient.uuid, roles[1].uuid)
            assert set(noex) == {items[1].uuid}
            assert noex[items[1].uuid].created_by == display(creator)
            entity = await crud.get_user_dashboards_entity_shared(capture, recipient.uuid, roles[0].uuid)
            assert set(entity) == {items[0].uuid, items[1].uuid}
            assert entity[items[0].uuid].created_by == display(creator)
            assert entity[items[1].uuid].created_by == display(owner)
            assert_projection(capture, 2)
            assert set(
                await crud.get_user_dashboards_entity_shared(capture, recipient.uuid, roles[0].uuid, [items[0].uuid])
            ) == {items[1].uuid}
            assert (
                await crud.get_user_dashboards_entity_shared(
                    capture, recipient.uuid, roles[0].uuid, [items[0].uuid, items[1].uuid]
                )
                == {}
            )
            assert set(await crud.get_user_dashboards_entity_shared(capture, recipient.uuid, roles[2].uuid)) == {
                items[2].uuid
            }
            for path in PATHS:
                args = [capture, uuid4()]
                if path.startswith("entity"):
                    args.append(uuid4())
                assert await getattr(crud, "get_user_dashboards_" + path)(*args) == {}
