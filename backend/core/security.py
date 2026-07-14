"""Password hashing (argon2) and JWT issuing/verification.

Token design:
  - access token  — short-lived (15 min), returned in the JSON body, held in
    memory by the SPA. Never written to localStorage: an XSS bug there would
    hand an attacker a long-lived credential.
  - refresh token — long-lived (7 days), delivered ONLY as an httpOnly cookie
    so JavaScript (and therefore XSS) cannot read it. Carries a `jti` that is
    tracked in the refresh_tokens table, which is what makes logout and
    reuse-detection actually revoke it (see api/auth.py).

Both carry a `type` claim so a refresh token can never be replayed as an
access token (a confused-deputy bug when both are signed with the same key).

Threading note: argon2 is deliberately CPU-expensive (~64MB, ~50-100ms). Calling
it directly from an async route would block the event loop for that whole time,
stalling every other request and handing an attacker a trivial DoS. The public
helpers here are therefore async and run the hash on a worker thread.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from anyio import to_thread
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from .config import SECRET_KEY, settings

ALGORITHM = "HS256"
ACCESS_TYPE = "access"
REFRESH_TYPE = "refresh"

_hasher = PasswordHasher()

# A real argon2 hash of a throwaway password, used to burn the same CPU time
# when an email doesn't exist. See verify_password_dummy() below.
_DUMMY_HASH = _hasher.hash("timing-equalizer-not-a-real-password")


class TokenError(Exception):
    """Token is missing, malformed, expired, or the wrong type."""


# --- passwords ---------------------------------------------------------
# All three run on a worker thread: argon2 is CPU-bound by design and would
# otherwise block the event loop for the duration of every login.


async def hash_password(password: str) -> str:
    return await to_thread.run_sync(_hasher.hash, password)


async def verify_password(password: str, password_hash: str) -> bool:
    def _verify() -> bool:
        try:
            _hasher.verify(password_hash, password)
            return True
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    return await to_thread.run_sync(_verify)


async def verify_password_dummy(password: str) -> None:
    """Verify against a throwaway hash and discard the result.

    Called when the email doesn't exist, so a login attempt costs the same
    wall-clock time whether or not the account is real. Without this, an
    unknown email returns in ~2ms and a wrong password in ~80ms, and that gap
    is an account-enumeration oracle — which would defeat the identical error
    message we return in both cases.
    """
    await verify_password(password, _DUMMY_HASH)


async def needs_rehash(password_hash: str) -> bool:
    """True when argon2 parameters have changed since this hash was written."""

    def _check() -> bool:
        try:
            return _hasher.check_needs_rehash(password_hash)
        except InvalidHashError:
            return False

    return await to_thread.run_sync(_check)


# --- tokens ------------------------------------------------------------


def _encode(subject: str, token_type: str, expires: timedelta, **claims) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires,
        **claims,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _encode(
        str(user_id), ACCESS_TYPE, timedelta(minutes=settings.access_token_minutes)
    )


def refresh_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days)


def create_refresh_token(user_id: int, jti: str | None = None) -> tuple[str, str]:
    """Return (token, jti). The jti is stored in refresh_tokens so the token
    can be revoked — a JWT alone is valid until it expires and cannot be taken
    back, which would make logout cosmetic."""
    jti = jti or uuid.uuid4().hex
    token = _encode(
        str(user_id),
        REFRESH_TYPE,
        timedelta(days=settings.refresh_token_days),
        jti=jti,
    )
    return token, jti


def decode_token(token: str, expected_type: str) -> dict:
    """Return the decoded payload, or raise TokenError. Never trust a token
    that doesn't declare the type we asked for."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc

    if payload.get("type") != expected_type:
        raise TokenError(f"expected a {expected_type} token")
    try:
        payload["user_id"] = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise TokenError("token has no usable subject") from exc
    return payload
