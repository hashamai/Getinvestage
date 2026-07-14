"""Auth routes: register, login, refresh, logout, me.

The refresh token never appears in a response body — only in an httpOnly
cookie — and its `jti` is tracked in refresh_tokens so it can actually be
revoked. See core/security.py and models/refresh_token.py for the reasoning.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from core.config import settings
from core.deps import CurrentUser, DbSession
from core.ratelimit import login_limit, refresh_limit, register_limit
from core.security import (
    REFRESH_TYPE,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    needs_rehash,
    refresh_expiry,
    verify_password,
    verify_password_dummy,
)
from models import RefreshToken, User
from schemas import LoginIn, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
BAD_CREDENTIALS = "Incorrect email or password"


async def _issue(response: Response, session: DbSession, user: User) -> TokenOut:
    """Mint an access token, and a refresh token whose jti is recorded so it
    can be revoked later."""
    token, jti = create_refresh_token(user.id)
    session.add(RefreshToken(jti=jti, user_id=user.id, expires_at=refresh_expiry()))
    await session.commit()

    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        httponly=True,                   # JS (and therefore XSS) cannot read it
        secure=settings.is_production,   # HTTPS-only in prod; off for localhost
        samesite="lax",                  # blocks the basic cross-site CSRF POST
        max_age=settings.refresh_token_days * 24 * 3600,
        path="/api/auth",                # never sent to the data routes
    )
    return TokenOut(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post(
    "/register",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_limit)],
)
async def register(body: RegisterIn, response: Response, session: DbSession):
    user = User(
        email=body.email.lower(),
        password_hash=await hash_password(body.password),
        display_name=body.display_name or body.email.split("@")[0],
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        # Unique constraint on users.email. Checking first would still race;
        # letting the DB be the arbiter is the only correct version.
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with that email already exists"
        ) from None
    return await _issue(response, session, user)


@router.post("/login", response_model=TokenOut, dependencies=[Depends(login_limit)])
async def login(body: LoginIn, response: Response, session: DbSession):
    result = await session.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    if user is None:
        # Burn the same argon2 CPU time we'd spend on a real user. Returning
        # early here would make an unknown email answer in ~2ms and a wrong
        # password in ~80ms — a timing oracle that leaks which emails have
        # accounts, defeating the identical message we return in both cases.
        await verify_password_dummy(body.password)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_CREDENTIALS)

    if not await verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_CREDENTIALS)
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is disabled")

    # Transparently upgrade the hash if argon2's parameters have moved on.
    if await needs_rehash(user.password_hash):
        user.password_hash = await hash_password(body.password)

    return await _issue(response, session, user)


async def _revoke_all(session: DbSession, user_id: int) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )


@router.post("/refresh", response_model=TokenOut, dependencies=[Depends(refresh_limit)])
async def refresh(
    response: Response,
    session: DbSession,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
):
    """Rotate the refresh token and mint a new access token.

    Rotation means a leaked token is only useful until the victim's next
    refresh. If an ALREADY-revoked jti comes back, the token was replayed —
    we can't tell the thief from the victim, so every token for that user is
    revoked and both are forced to log in again.
    """
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    try:
        payload = decode_token(refresh_token, REFRESH_TYPE)
    except TokenError:
        raise invalid from None

    stored = await session.scalar(
        select(RefreshToken).where(RefreshToken.jti == payload.get("jti", ""))
    )
    if stored is None:
        raise invalid

    if not stored.is_live:
        # Reuse of a revoked token: assume compromise, kill the whole family.
        await _revoke_all(session, stored.user_id)
        await session.commit()
        raise invalid

    user = await session.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise invalid

    stored.revoked_at = datetime.now(timezone.utc)  # rotate: this one is spent
    return await _issue(response, session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: DbSession,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
):
    """Revoke this device's refresh token server-side, then drop the cookie.

    Deleting the cookie alone would leave the token cryptographically valid for
    its full 7 days — anyone holding a copy could keep minting access tokens
    after the user believed they had signed out.
    """
    if refresh_token:
        try:
            payload = decode_token(refresh_token, REFRESH_TYPE)
        except TokenError:
            payload = None
        if payload:
            await session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.jti == payload.get("jti", ""),
                    RefreshToken.revoked_at.is_(None),
                )
                .values(revoked_at=datetime.now(timezone.utc))
            )
            await session.commit()

    # path must match the one used to set it, or the browser keeps the cookie.
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
