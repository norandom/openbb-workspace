# ruff: noqa: S101, PLR0914, PLR0915
"""Exercise app owner identity and existing recipient projection filters."""

import warnings
from uuid import uuid4

import pytest
from sqlalchemy.exc import SAWarning

from api import base, crud
from tests_sqlite import fixtures
from tests_sqlite.read_support import NAMES, CapturedReads, assert_projection, display, people


@pytest.mark.parametrize("path", ["owned", "shared"])
@pytest.mark.parametrize("names", NAMES)
async def test_app_names(sqlite_store, path, names):
    async with sqlite_store[2]() as session:
        _, _, (owner, creator, recipient, unrelated) = await people(session)
        owner.first_name, owner.last_name = names
        item = fixtures.app(
            owner, is_shared=True, content={"name": "Read app", "widgets": [], "nested": {"units": "USD"}}
        )
        session.add(item)
        await session.flush()
        session.add(fixtures.app_share(item, recipient))
        await session.flush()
        capture = CapturedReads(session)
        user = owner if path == "owned" else recipient
        with warnings.catch_warnings():
            warnings.simplefilter("error", SAWarning)
            result = await getattr(crud, "get_user_apps_" + path)(capture, user.uuid)
        assert set(result) == {item.uuid}
        value = result[item.uuid]
        assert value.created_by == display(owner)
        assert value.creator is (path == "owned")
        assert value.is_shared is (path == "owned")
        assert value.content.model_dump()["nested"] == {"units": "USD"}
        assert value.content.name == "Read app"
        assert value.created_date == item.created_date and value.updated_date == item.updated_date
        expected = [{"name": display(recipient), "email": recipient.email}] if path == "owned" else []
        assert value.sharedWith == expected
        assert_projection(capture, 1)


async def test_app_membership(sqlite_store):
    async with sqlite_store[2]() as session:
        _, _, (owner, creator, recipient, unrelated) = await people(session)
        items = [
            fixtures.app(user, content={"name": "Membership", "widgets": []})
            for user in (owner, owner, owner, recipient, unrelated)
        ]
        session.add_all(items)
        await session.flush()
        session.add_all(
            [
                fixtures.app_share(items[0], recipient),
                fixtures.app_share(items[0], owner),
                fixtures.app_share(items[0], creator, active=False),
                fixtures.app_share(items[0], unrelated, permissions=base.PermissionEnum.edit),
                fixtures.app_share(items[1], recipient, active=False),
                fixtures.app_share(items[2], unrelated),
                fixtures.app_share(items[3], recipient),
                fixtures.app_share(items[4], recipient, permissions=base.PermissionEnum.edit),
            ]
        )
        await session.flush()
        capture = CapturedReads(session)
        with warnings.catch_warnings():
            warnings.simplefilter("error", SAWarning)
            shared = await crud.get_user_apps_shared(capture, recipient.uuid)
            assert set(shared) == {items[0].uuid, items[4].uuid}
            assert shared[items[4].uuid].created_by == display(unrelated)
            owned = await crud.get_user_apps_owned(capture, owner.uuid)
            assert set(owned) == {item.uuid for item in items[:3]}
            assert owned[items[0].uuid].sharedWith == [{"name": display(recipient), "email": recipient.email}]
            assert owned[items[1].uuid].sharedWith == []
            assert owned[items[2].uuid].sharedWith == [{"name": display(unrelated), "email": unrelated.email}]
            assert await crud.get_user_apps_shared(capture, uuid4()) == {}
            assert await crud.get_user_apps_owned(capture, uuid4()) == {}
