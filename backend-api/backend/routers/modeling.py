"""Forward the authenticated Workspace modeling contract to its private listener."""

import json
import re
from http import HTTPStatus
from typing import Annotated
from urllib.parse import quote
from uuid import uuid4

import httpx
from anyio import fail_after
from anyio.lowlevel import checkpoint
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from starlette.requests import ClientDisconnect

from api.auth_helpers import CustomRow, GetCurrentUser
from api.modeling_identity import issue_assertion

_PREFIX = "/modeling/v1"
_ORIGIN = "http://modeling:6901"
_MAX_BODY_BYTES = 2 * 1024 * 1024
_MAX_RESPONSE_BYTES = 16 * 1024 * 1024
_MAX_QUERY_BYTES = 4096
_MAX_ERROR_FIELDS = 32
_MAX_FIELD_PATH_PARTS = 32
_BODY_TIMEOUT = 30
_UPSTREAM_TIMEOUT = 65  # The service has its own 60-second evaluation budget.
_MAX_IDENTIFIER_LENGTH = 128
_FIELD_TOKEN = re.compile(r"[A-Za-z0-9._~-]{1,128}")
_HEX_ID = re.compile(r"[0-9a-f]{32}")
_ERROR_CODES = {
    401: {"unauthorized"},
    404: {"not_found"},
    413: {"request_too_large"},
    422: {
        "invalid_request",
        "unsupported_method",
        "unsupported_acquisition",
        "horizon_limit",
        "invalid_assumptions",
        "invalid_input_snapshot",
        "input_schema_mismatch",
        "row_limit",
        "scenario_limit",
        "unsupported_numeric_conversion",
    },
    500: {"internal_error"},
    503: {
        "acquisition_unavailable",
        "cancelled",
        "capacity",
        "discovery_unavailable",
        "evaluation_unavailable",
        "publication_unconfirmed",
        "storage_unavailable",
        "timeout",
    },
}

router = APIRouter(prefix=_PREFIX, tags=["modeling"])
CurrentUser = Annotated[CustomRow, Depends(GetCurrentUser(["uuid"]))]


def get_modeling_transport() -> httpx.AsyncBaseTransport | None:
    """Allow tests to substitute a local transport for the fixed service origin."""
    return None


ModelingTransport = Annotated[httpx.AsyncBaseTransport | None, Depends(get_modeling_transport)]


class BridgeError(Exception):
    def __init__(self, status: int, code: str):
        self.status = status
        self.code = code


def _failure(status: int, code: str, *, retryable: bool = False) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"code": code, "correlation_id": uuid4().hex, "retryable": retryable},
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


async def _read_body(request: Request) -> bytes:
    length = request.headers.get("content-length", "").lstrip("0")
    if (
        length.isascii()
        and length.isdecimal()
        and (len(length) > len(str(_MAX_BODY_BYTES)) or int(length) > _MAX_BODY_BYTES)
    ):
        raise BridgeError(413, "request_too_large")
    body = bytearray()
    with fail_after(_BODY_TIMEOUT):
        async for chunk in request.stream():
            await checkpoint()
            if len(body) + len(chunk) > _MAX_BODY_BYTES:
                raise BridgeError(413, "request_too_large")
            body.extend(chunk)
    return bytes(body)


def _segment(value: str) -> str:
    if not value or len(value) > _MAX_IDENTIFIER_LENGTH or value in {".", ".."} or "/" in value or "\\" in value:
        raise BridgeError(404, "not_found")
    return quote(value, safe="")


def _safe_error(payload: object, status: int) -> bool:
    if not isinstance(payload, dict):
        return False
    required = {"code", "correlation_id", "retryable"}
    optional = {"fields"} if status == HTTPStatus.UNPROCESSABLE_ENTITY else set()
    if status == HTTPStatus.SERVICE_UNAVAILABLE and payload.get("code") == "publication_unconfirmed":
        required.add("run_id")
    if not required <= payload.keys() <= required | optional:
        return False
    code = payload["code"]
    correlation_id = payload["correlation_id"]
    if (
        not isinstance(code, str)
        or code not in _ERROR_CODES[status]
        or not isinstance(correlation_id, str)
        or not _HEX_ID.fullmatch(correlation_id)
        or type(payload["retryable"]) is not bool
    ):
        return False
    if "run_id" in required:
        run_id = payload["run_id"]
        return isinstance(run_id, str) and bool(_HEX_ID.fullmatch(run_id))
    if "fields" in payload:
        fields = payload["fields"]
        return (
            isinstance(fields, list) and len(fields) <= _MAX_ERROR_FIELDS and all(_safe_field(field) for field in fields)
        )
    return True


def _safe_field(field: object) -> bool:
    if not isinstance(field, dict) or field.keys() != {"path", "code"}:
        return False
    code, path = field["code"], field["path"]
    return (
        isinstance(code, str)
        and bool(_FIELD_TOKEN.fullmatch(code))
        and isinstance(path, list)
        and len(path) <= _MAX_FIELD_PATH_PARTS
        and all(type(part) is int or (isinstance(part, str) and _FIELD_TOKEN.fullmatch(part)) for part in path)
    )


async def _relay(upstream: httpx.Response) -> Response:
    status = upstream.status_code
    media_type = upstream.headers.get("content-type", "").partition(";")[0].strip()
    if (
        (status != HTTPStatus.OK and status not in _ERROR_CODES)
        or media_type.lower() != "application/json"
        or upstream.headers.get("content-encoding", "identity").lower() != "identity"
    ):
        raise BridgeError(503, "modeling_unavailable")

    body = bytearray()
    limit = _MAX_RESPONSE_BYTES if status == HTTPStatus.OK else 64 * 1024
    async for chunk in upstream.aiter_bytes():
        await checkpoint()
        if len(body) + len(chunk) > limit:
            raise BridgeError(503, "modeling_unavailable")
        body.extend(chunk)
    payload = json.loads(body)
    if status != HTTPStatus.OK and not _safe_error(payload, status):
        raise BridgeError(503, "modeling_unavailable")
    if status == HTTPStatus.OK and not isinstance(payload, (dict, list)):
        raise BridgeError(503, "modeling_unavailable")
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if status == HTTPStatus.UNAUTHORIZED:
        headers["WWW-Authenticate"] = "Bearer"
    if status != HTTPStatus.OK:
        return JSONResponse(payload, status_code=status, headers=headers)
    return Response(bytes(body), media_type="application/json", headers=headers)


async def _forward(
    request: Request,
    user: CustomRow,
    transport: httpx.AsyncBaseTransport | None,
    path: str,
    *,
    segments: tuple[str, ...] = (),
    query: tuple[str, ...] = (),
) -> Response:
    try:
        path = path.format(*map(_segment, segments))
        if len(request.scope["query_string"]) > _MAX_QUERY_BYTES:
            raise BridgeError(422, "invalid_request")
        params = {name: request.query_params[name] for name in query if name in request.query_params}
        body = await _read_body(request) if request.method == "POST" else None
        headers = {
            "Authorization": f"Bearer {issue_assertion(user.uuid)}",
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"

        with fail_after(_UPSTREAM_TIMEOUT):
            async with (
                httpx.AsyncClient(
                    transport=transport,
                    timeout=httpx.Timeout(_UPSTREAM_TIMEOUT, connect=3, write=5, pool=3),
                    follow_redirects=False,
                    trust_env=False,
                ) as client,
                client.stream(
                    request.method,
                    _ORIGIN + _PREFIX + path,
                    params=params,
                    headers=headers,
                    content=body,
                ) as upstream,
            ):
                return await _relay(upstream)
    except BridgeError as exc:
        status, code = exc.status, exc.code
    except (TimeoutError, httpx.TimeoutException):
        status, code = 503, "timeout"
    except ClientDisconnect:
        status, code = 503, "cancelled"
    except (httpx.HTTPError, ValueError, RecursionError):
        status, code = 503, "modeling_unavailable"

    # A failed evaluation response may follow successful persistence.
    return _failure(status, code, retryable=status == HTTPStatus.SERVICE_UNAVAILABLE and request.method == "GET")


@router.get("/models")
async def list_models(request: Request, user: CurrentUser, transport: ModelingTransport):
    return await _forward(request, user, transport, "/models")


@router.get("/widgets.json")
async def modeling_widgets(request: Request, user: CurrentUser, transport: ModelingTransport):
    return await _forward(request, user, transport, "/widgets.json")


@router.get("/apps.json")
async def modeling_apps(request: Request, user: CurrentUser, transport: ModelingTransport):
    return await _forward(request, user, transport, "/apps.json")


@router.get("/widget-results")
async def modeling_widget_results(request: Request, user: CurrentUser, transport: ModelingTransport):
    return await _forward(
        request,
        user,
        transport,
        "/widget-results",
        query=("run_id", "output_id", "expected_run_id"),
    )


@router.post("/evaluations")
async def create_model_evaluation(request: Request, user: CurrentUser, transport: ModelingTransport):
    return await _forward(request, user, transport, "/evaluations")


@router.get("/runs/{run_id}")
async def get_model_run(request: Request, user: CurrentUser, transport: ModelingTransport, run_id: str):
    return await _forward(request, user, transport, "/runs/{}", segments=(run_id,))


@router.get("/runs/{run_id}/outputs/{output_id}")
async def get_model_output(
    request: Request,
    user: CurrentUser,
    transport: ModelingTransport,
    run_id: str,
    output_id: str,
):
    return await _forward(
        request,
        user,
        transport,
        "/runs/{}/outputs/{}",
        segments=(run_id, output_id),
        query=("expected_run_id",),
    )
