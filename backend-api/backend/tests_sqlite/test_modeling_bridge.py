# ruff: noqa: S101, PLR2004
"""Exercise the Workspace bridge with persisted sessions and a recording upstream."""

from datetime import timedelta
from uuid import UUID, uuid4

import httpx
import jwt
import pytest

from api import auth_helpers, models
from tests_sqlite.test_modeling_bridge_support import (
    KEY,
    KEY_ID,
    PREFIX,
    PREVIOUS_KEY,
    PREVIOUS_KEY_ID,
    UPSTREAM_ORIGIN,
    bearer,
    bind_session_store,
    create_session_table,
    create_users,
    issue_session,
    revoke_session,
    workspace_app,
)

RUN_ID = str(UUID(int=1))
OUTPUT_ID = "Free cash flow €"


@pytest.fixture
async def accounts(sqlite_store, monkeypatch):
    _, engine, sessions = sqlite_store
    await create_session_table(engine)
    bind_session_store(monkeypatch, sessions)
    monkeypatch.setenv("QFM_IDENTITY_CURRENT_KID", KEY_ID)
    monkeypatch.setenv("QFM_IDENTITY_CURRENT_SECRET", KEY)
    return sessions, await create_users(sessions)


def inspect_assertion(request, subject, *, kid=KEY_ID, key=KEY):
    (authorization,) = request.headers.get_list("authorization")
    scheme, token = authorization.split(" ", 1)
    assert scheme == "Bearer"
    assert jwt.get_unverified_header(token) == {"alg": "HS256", "typ": "qfm-identity", "kid": kid}
    claims = jwt.decode(
        token,
        key,
        algorithms=["HS256"],
        issuer="qopenbb-workspace",
        audience="qfm",
        options={"require": ["iat", "exp", "sub"], "strict_aud": True},
    )
    assert claims["sub"] == str(subject)
    assert type(claims["iat"]) is int and type(claims["exp"]) is int
    assert 0 < claims["exp"] - claims["iat"] <= 60


def client_for(handler):
    app = workspace_app(httpx.MockTransport(handler))
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://workspace.example")


@pytest.mark.parametrize(
    ("method", "path", "params"),
    [
        ("GET", "/models", {}),
        ("GET", "/widgets.json", {}),
        ("GET", "/apps.json", {}),
        ("POST", "/evaluations", {}),
        ("GET", f"/runs/{RUN_ID}", {}),
        ("GET", f"/runs/{RUN_ID}/outputs/{OUTPUT_ID}", {"expected_run_id": RUN_ID}),
        ("GET", "/widget-results", {"run_id": RUN_ID, "output_id": OUTPUT_ID, "expected_run_id": RUN_ID}),
    ],
)
async def test_supported_endpoints_forward_only_contract_inputs(accounts, method, path, params):
    sessions, (owner, other) = accounts
    token = await issue_session(sessions, owner)
    payload = b'{"model_id":"fixture","method_version":"1"}' if method == "POST" else b""
    received = []

    async def upstream(request):
        received.append(request)
        assert request.method == method
        assert str(request.url.copy_with(path="/", query=None)).rstrip("/") == UPSTREAM_ORIGIN
        assert request.url.path == PREFIX + path
        assert dict(request.url.params) == params
        assert await request.aread() == payload
        inspect_assertion(request, owner)
        assert token not in str(request.headers)
        for header in ("cookie", "origin", "x-openbb-authorization", "x-user-id", "x-forwarded-host", "x-api-key"):
            assert header not in request.headers
        if method == "POST":
            assert request.headers["content-type"] == "application/json"
        return httpx.Response(
            200,
            json={"result": "from-modeling"},
            headers={
                "Set-Cookie": "internal=private",
                "X-Internal-Detail": "private",
            },
        )

    async with client_for(upstream) as client:
        response = await client.request(
            method,
            PREFIX + path,
            params={**params, "unused": "discard"},
            content=payload,
            headers={
                **bearer(token),
                "Cookie": "workspace=private",
                "Origin": "https://workspace.example",
                "X-OpenBB-Authorization": "Bearer private",
                "X-User-Id": str(other),
                "X-Forwarded-Host": "public.example",
                "X-Api-Key": "private",
                **({"Content-Type": "application/json"} if payload else {}),
            },
        )
    assert len(received) == 1
    assert response.status_code == 200
    assert response.json() == {"result": "from-modeling"}
    assert "set-cookie" not in response.headers
    assert "x-internal-detail" not in response.headers


async def test_missing_unknown_and_expired_sessions_never_forward(accounts, monkeypatch):
    sessions, (owner, _) = accounts
    expired = await issue_session(sessions, owner, expires_in=-timedelta(hours=1))
    invalidations = []
    # SQLite exercises session expiry and deletion. Redis cache invalidation stays local to the test.
    monkeypatch.setattr(auth_helpers.base, "remove_session_redis", invalidations.append)

    async def unexpected_forward(_request):
        pytest.fail("Unauthenticated request reached modeling")

    async with client_for(unexpected_forward) as client:
        for headers in ({}, bearer(str(uuid4())), bearer(expired)):
            response = await client.get(PREFIX + "/models", headers=headers)
            assert response.status_code == 401
    assert invalidations == [UUID(expired)]
    async with sessions() as db:
        assert await db.get(models.Session, UUID(expired)) is None


async def test_session_and_signing_key_rotation(accounts, monkeypatch):
    sessions, (owner, _) = accounts
    initial = await issue_session(sessions, owner)
    signed = []

    async def upstream(request):
        signed.append(request)
        return httpx.Response(200, json={"ok": True})

    async with client_for(upstream) as client:
        assert (await client.get(PREFIX + "/models", headers=bearer(initial))).is_success
        await revoke_session(sessions, initial)
        replacement = await issue_session(sessions, owner)
        assert replacement != initial
        monkeypatch.setenv("QFM_IDENTITY_CURRENT_KID", PREVIOUS_KEY_ID)
        monkeypatch.setenv("QFM_IDENTITY_CURRENT_SECRET", PREVIOUS_KEY)
        assert (await client.get(PREFIX + "/models", headers=bearer(initial))).status_code == 401
        assert (await client.get(PREFIX + "/models", headers=bearer(replacement))).is_success
    before, after = signed
    inspect_assertion(before, owner)
    inspect_assertion(after, owner, kid=PREVIOUS_KEY_ID, key=PREVIOUS_KEY)


@pytest.mark.parametrize(
    ("method", "path", "status"),
    [("GET", "/health", 404), ("PUT", "/evaluations", 405)],
)
async def test_only_supported_method_and_path_reach_upstream(accounts, method, path, status):
    sessions, (owner, _) = accounts
    token = await issue_session(sessions, owner)

    async def unexpected_forward(_request):
        pytest.fail("Unsupported route reached modeling")

    async with client_for(unexpected_forward) as client:
        response = await client.request(method, PREFIX + path, headers=bearer(token))
    assert response.status_code == status


@pytest.mark.parametrize(
    "upstream_reply",
    [
        pytest.param(
            lambda: httpx.Response(302, headers={"Location": "http://elsewhere.invalid/private"}), id="redirect"
        ),
        pytest.param(lambda: httpx.Response(502, text="private service detail"), id="non-json"),
        pytest.param(lambda: httpx.Response(404, json={"detail": "private service detail"}), id="unexpected-json"),
    ],
)
async def test_unexpected_upstream_replies_are_sanitized(accounts, upstream_reply):
    sessions, (owner, _) = accounts
    token = await issue_session(sessions, owner)
    received = []

    async def upstream(request):
        received.append(request.url)
        return upstream_reply()

    async with client_for(upstream) as client:
        response = await client.get(PREFIX + "/models", headers=bearer(token))
    assert len(received) == 1
    assert response.status_code == 503
    assert "location" not in response.headers
    body = response.json()
    assert set(body) == {"code", "correlation_id", "retryable"}
    assert body["code"] == "modeling_unavailable"
    assert body["retryable"] is True
    UUID(body["correlation_id"])


async def test_unconfigured_signing_never_forwards(accounts, monkeypatch):
    sessions, (owner, _) = accounts
    token = await issue_session(sessions, owner)
    monkeypatch.delenv("QFM_IDENTITY_CURRENT_SECRET")

    async def unexpected_forward(_request):
        pytest.fail("Unsigned request reached modeling")

    async with client_for(unexpected_forward) as client:
        response = await client.get(PREFIX + "/models", headers=bearer(token))
    assert response.status_code == 503
    assert response.json()["code"] == "modeling_unavailable"
