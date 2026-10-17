"""Real mapped fixture builders; callers add and flush in dependency order."""

from uuid import uuid4

from api import base, models
from api.models.model_helpers import Base


def dependency_tables():
    roots = (
        models.EntityType,
        models.Entity,
        models.PermissionsEntityMap,
        models.User,
        models.DashboardItem,
        models.DashboardShare,
        models.UserApp,
        models.UserAppShare,
    )
    tables = {model.__table__ for model in roots}
    while missing := {fk.column.table for table in tables for fk in table.foreign_keys} - tables:
        tables.update(missing)
    return Base.metadata, [table for table in Base.metadata.sorted_tables if table in tables]


def entity_type(**overrides):
    return models.EntityType(**{"uuid": uuid4(), "entity_type": "SQLite test", "code": "TST", **overrides})


def entity(kind, **overrides):
    return models.Entity(**{"uuid": uuid4(), "name": str(uuid4()), "entity_type_uuid": kind.uuid, **overrides})


def permissions(organization, **overrides):
    return models.PermissionsEntityMap(
        **{"uuid": uuid4(), "entity_uuid": organization.uuid, "name": "test-role", **overrides}
    )


def user(role, **overrides):
    identity = uuid4()
    email = f"sqlite-{identity}@example.com"
    return models.User(
        **{
            "uuid": identity,
            "email": email,
            "clean_email": email,
            "password": "synthetic-password",
            "permissions_uuid": role.uuid,
            "first_name": "Ada",
            "last_name": "Lovelace",
            **overrides,
        }
    )


def dashboard(owner, creator=None, organization=None, **overrides):
    return models.DashboardItem(
        **{
            "uuid": uuid4(),
            "owner_uuid": owner.uuid,
            "creator_uuid": (creator or owner).uuid,
            "entity_uuid": organization.uuid if organization else None,
            "content": {"name": "SQLite dashboard", "widgets": {}},
            **overrides,
        }
    )


def app(owner, **overrides):
    return models.UserApp(
        **{"uuid": uuid4(), "user_uuid": owner.uuid, "content": {"name": "SQLite app", "widgets": {}}, **overrides}
    )


def dashboard_share(item, recipient, **overrides):
    return models.DashboardShare(
        **{
            "uuid": uuid4(),
            "dashboard_item_uuid": item.uuid,
            "shared_user_uuid": recipient.uuid,
            "active": True,
            "permissions": base.PermissionEnum.view,
            **overrides,
        }
    )


def app_share(item, recipient, **overrides):
    return models.UserAppShare(
        **{
            "uuid": uuid4(),
            "user_app_uuid": item.uuid,
            "shared_user_uuid": recipient.uuid,
            "active": True,
            "permissions": base.PermissionEnum.view,
            **overrides,
        }
    )
