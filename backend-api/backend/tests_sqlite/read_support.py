# ruff: noqa: S101, T201
"""Populate original models and retain the actual executed select projections."""

from sqlalchemy.dialects import mysql, sqlite

from tests_sqlite import fixtures

NAMES = [
    ("Ada", "Lovelace"),
    (None, "Lovelace"),
    ("Ada", None),
    (None, None),
    ("", ""),
    ("  ", " \t"),
    ("", "Lovelace"),
    ("Ada", ""),
]


class CapturedReads:
    def __init__(self, session):
        self.session = session
        self.calls = []

    async def execute(self, query):
        result = await self.session.execute(query)
        frozen = result.freeze()
        rows = frozen().all()
        self.calls.append((query, rows))
        for dialect in (sqlite.dialect(), mysql.dialect()):
            print(f"ACTUAL_SELECT {dialect.name} rows={len(rows)}: {query.compile(dialect=dialect)}")
        return frozen()

    def projection(self):
        return [(query, rows) for query, rows in self.calls if "created_by" in query.selected_columns][-1]


async def people(session):
    kind = fixtures.entity_type()
    session.add(kind)
    await session.flush()
    entities = [fixtures.entity(kind), fixtures.entity(kind)]
    session.add_all(entities)
    await session.flush()
    roles = [fixtures.permissions(entities[0]), fixtures.permissions(entities[0]), fixtures.permissions(entities[1])]
    session.add_all(roles)
    await session.flush()
    users = [
        fixtures.user(role, first_name=name, last_name="Identity")
        for role, name in zip(
            (roles[0], roles[1], roles[0], roles[2]), ("Owner", "Creator", "Recipient", "Unrelated"), strict=True
        )
    ]
    session.add_all(users)
    await session.flush()
    return entities, roles, users


def display(user):
    if user.first_name is not None and user.last_name is not None:
        return f"{user.first_name} {user.last_name}".strip()
    return user.email


def assert_projection(capture, expected_count):
    query, rows = capture.projection()
    assert len(rows) == expected_count
    sqlite_sql = str(query.compile(dialect=sqlite.dialect()))
    mysql_sql = str(query.compile(dialect=mysql.dialect()))
    assert " || " in sqlite_sql or "concat(" in sqlite_sql
    assert "concat(" in mysql_sql
    assert "CASE WHEN" in sqlite_sql and "ELSE user.email END AS created_by" in sqlite_sql
