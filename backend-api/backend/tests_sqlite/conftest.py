# ruff: noqa: E402, I001, S101
"""Install isolation before importing any application settings or models."""

import os
from pathlib import Path
import sys

if "QOPENBB_SQLITE_SANDBOX" not in os.environ:
    raise RuntimeError("Use: <backend-python> tests_sqlite/run.py")

SANDBOX = Path(os.environ["QOPENBB_SQLITE_SANDBOX"])
assert Path.cwd() == SANDBOX and not list(SANDBOX.iterdir())
DENIED_READS = []
for sentinel in ("sentinel.env", "user_create.json"):
    (SANDBOX / sentinel).write_text("SENTINEL_MUST_NOT_BE_READ=private\n")


def deny_private_reads_and_network(event, args):
    if event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
        name = os.fsdecode(args[0])
        if Path(name).name in {".env", "user_create.json", "sentinel.env"}:
            DENIED_READS.append(name)
            raise PermissionError("Operator settings reads are forbidden in SQLite tests")
    if event in {"socket.connect", "socket.getaddrinfo", "socket.sendto"}:
        raise PermissionError("Network access is forbidden in SQLite tests")


sys.addaudithook(deny_private_reads_and_network)

from pydantic_settings import BaseSettings
from pydantic_settings.sources import DotEnvSettingsSource

# _read_env_files is invoked by the source constructor, before __call__.
DOTENV_CONSTRUCTIONS = []


def empty_dotenv(self):
    DOTENV_CONSTRUCTIONS.append(self.env_file)
    return {}


DotEnvSettingsSource._read_env_files = empty_dotenv


class SentinelSettings(BaseSettings):
    pass


DotEnvSettingsSource(SentinelSettings, env_file=SANDBOX / "sentinel.env")
assert not DENIED_READS
for sentinel in ("sentinel.env", "user_create.json"):
    try:
        (SANDBOX / sentinel).read_text()
    except PermissionError:
        pass
    else:
        raise AssertionError("Read denial was not installed")
DENIED_READS.clear()
for sentinel in ("sentinel.env", "user_create.json"):
    (SANDBOX / sentinel).unlink()
assert not list(SANDBOX.iterdir())

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from utilities.config import settings
from tests_sqlite.fixtures import dependency_tables

assert settings.MODE == "onprem" and settings.DATABASE_TYPE == "sqlite"
assert not DENIED_READS


def file_engine(path):
    engine = create_async_engine("sqlite+aiosqlite:///" + str(path))

    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


@pytest.fixture
async def sqlite_store(tmp_path):
    """Yield (database path, engine, session factory); each test owns its file."""
    path = tmp_path / "workspace.db"
    engine = file_engine(path)
    async with engine.begin() as connection:
        await connection.run_sync(lambda sync: dependency_tables()[0].create_all(sync, tables=dependency_tables()[1]))
    try:
        yield path, engine, async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


@pytest.fixture(autouse=True)
def no_private_reads():
    assert not DENIED_READS
    yield
    assert not DENIED_READS
