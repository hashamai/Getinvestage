"""Shared FastAPI dependencies: current user, market service."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from models import User
from services.market import MarketService

from .db import get_session
from .security import ACCESS_TYPE, TokenError, decode_token

# auto_error=False so a missing header produces our own 401 with a clean
# message rather than FastAPI's terse default.
bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    if creds is None or not creds.credentials:
        raise CREDENTIALS_ERROR
    try:
        payload = decode_token(creds.credentials, ACCESS_TYPE)
    except TokenError:
        raise CREDENTIALS_ERROR from None

    user = await session.get(User, payload["user_id"])
    # A token can outlive the account it names (deleted or deactivated between
    # issue and use), so re-check every request rather than trusting the claim.
    if user is None or not user.is_active:
        raise CREDENTIALS_ERROR
    return user


def get_market(request: Request) -> MarketService:
    return request.app.state.market


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_session)]
Market = Annotated[MarketService, Depends(get_market)]
