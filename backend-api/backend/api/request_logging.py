"""Bind the Workspace session context and record HTTP request timing."""

from contextlib import suppress
from time import time
from uuid import UUID

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger

from api import auth_helpers
from api.context import session_token_ctx


async def log_requests(request: Request, call_next):
    start_time = time()

    if forwarded_proto := request.headers.get("x-forwarded-proto"):
        # Override the internal scope scheme so url_for and redirects use it
        request.scope["scheme"] = forwarded_proto

    # Get token using the same logic as oauth2_scheme
    scheme, raw_token = auth_helpers.get_authorization_scheme_param(request.headers.get("Authorization"))
    token = None

    if scheme.lower() == "bearer":
        with suppress(ValueError, TypeError):
            clean_token = UUID(raw_token)
            token = session_token_ctx.set(clean_token)

    try:
        response: Response = await call_next(request)
    except Exception as exc:
        process_time = (time() - start_time) * 1000
        logger.bind(
            method=request.method,
            path=request.url.path,
            status_code=500,
            response_time=process_time,
        ).exception(exc)
        return JSONResponse(
            status_code=400,
            content={"detail": "unexpected error", "status": 400},
        )
    finally:
        # Clean up the context var if we set it - avoid context leaks between requests
        if token:
            session_token_ctx.reset(token)

    process_time = (time() - start_time) * 1000
    response.headers["X-Process-Time"] = str(process_time)
    extras = dict(
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        response_time=process_time,
    )
    if request.method != "OPTIONS":
        logger.info(
            f'"{request.method} path={request.url.path} completed_in={process_time:.2f}ms" {response.status_code}',  # noqa: E501
            **extras,
        )

    return response
