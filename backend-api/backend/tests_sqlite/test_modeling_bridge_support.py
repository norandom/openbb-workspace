"""Build disposable Workspace sessions for the modeling bridge tests."""

from datetime import timedelta
from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI
from sqlalchemy import delete

from api import auth_helpers, database, models
from routers import modeling
from tests_sqlite import fixtures

PREFIX = "/modeling/v1"
UPSTREAM_ORIGIN = "http://modeling:6901"
KEY_ID = "workspace-test-current"
KEY = "synthetic-workspace-signing-key-123456789"
PREVIOUS_KEY_ID = "workspace-test-previous"
PREVIOUS_KEY = "synthetic-workspace-previous-key-12345678"


def workspace_app(transport):
    app = FastAPI(redirect_slashes=False)
    app.include_router(modeling.router)
    app.dependency_overrides[modeling.get_modeling_transport] = lambda: transport
    return app


def bind_session_store(monkeypatch, sessions):
    manager = SimpleNamespace(session=sessions)
    monkeypatch.setattr(database, "AsyncReadSessionLocal", manager)
    monkeypatch.setattr(database, "AsyncWriteSessionLocal", manager)


async def create_session_table(engine):
    async with engine.begin() as connection:
        await connection.run_sync(models.Session.__table__.create)


async def create_users(sessions):
    async with sessions() as db:
        kind = fixtures.entity_type()
        db.add(kind)
        await db.flush()
        organization = fixtures.entity(kind)
        db.add(organization)
        await db.flush()
        role = fixtures.permissions(organization)
        db.add(role)
        await db.flush()
        users = (fixtures.user(role), fixtures.user(role))
        db.add_all(users)
        await db.commit()
        return tuple(user.uuid for user in users)


async def issue_session(sessions, user_id, *, expires_in=timedelta(hours=1)):
    async with sessions() as db:
        return await auth_helpers.create_login_token(db, user_id, expires_delta=expires_in, pro=True, source="pro")


async def revoke_session(sessions, token):
    async with sessions() as db:
        await db.execute(delete(models.Session).where(models.Session.uuid == UUID(token)))
        await db.commit()


def bearer(token):
    return {"Authorization": f"Bearer {token}"}
