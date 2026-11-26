"""Issue short-lived assertions for the private modeling service."""

from os import getenv
from time import time
from uuid import UUID

import jwt

_MIN_KEY_BYTES = 32
_ASSERTION_TTL_SECONDS = 60


class ModelingIdentityError(ValueError):
    """The Workspace identity assertion could not be issued."""


def issue_assertion(user_id: UUID) -> str:
    """Sign the validated Workspace user ID with the dedicated current key."""
    kid = getenv("QFM_IDENTITY_CURRENT_KID")
    secret = getenv("QFM_IDENTITY_CURRENT_SECRET")
    if not kid or kid.split() != [kid] or not secret or secret.split() != [secret]:
        raise ModelingIdentityError("Modeling identity unavailable")
    try:
        key = secret.encode("utf-8")
    except UnicodeError:
        raise ModelingIdentityError("Modeling identity unavailable") from None
    if len(key) < _MIN_KEY_BYTES or not isinstance(user_id, UUID):
        raise ModelingIdentityError("Modeling identity unavailable")
    issued = int(time())
    return jwt.encode(
        {
            "iss": "qopenbb-workspace",
            "aud": "qfm",
            "sub": str(user_id),
            "iat": issued,
            "exp": issued + _ASSERTION_TTL_SECONDS,
        },
        key,
        algorithm="HS256",
        headers={"kid": kid, "typ": "qfm-identity"},
    )
