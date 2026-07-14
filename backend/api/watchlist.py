"""User-scoped watchlist. Every route here requires a valid access token, and
every query is filtered by the authenticated user's id — a user can never read
or delete another user's rows.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from core.deps import CurrentUser, DbSession
from models import User, WatchlistItem
from schemas import WatchlistAddIn, WatchlistItemOut

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

MAX_SYMBOLS = 50


@router.get("", response_model=list[WatchlistItemOut])
async def list_items(user: CurrentUser, session: DbSession):
    result = await session.execute(
        select(WatchlistItem)
        .where(WatchlistItem.user_id == user.id)
        .order_by(WatchlistItem.position, WatchlistItem.id)
    )
    return list(result.scalars())


@router.post("", response_model=WatchlistItemOut, status_code=status.HTTP_201_CREATED)
async def add_item(body: WatchlistAddIn, user: CurrentUser, session: DbSession):
    # Lock this user's row for the transaction. Without it, the count check and
    # the insert are a read-then-write race: two concurrent adds both read 49,
    # both pass the limit check, and both insert — the cap is breached and both
    # rows get the same position. Locking per user serializes only that user's
    # writes, so it costs nothing across users.
    # (No-op on SQLite, which serializes writers anyway.)
    await session.execute(select(User.id).where(User.id == user.id).with_for_update())

    count = await session.scalar(
        select(func.count()).select_from(WatchlistItem).where(WatchlistItem.user_id == user.id)
    )
    if count >= MAX_SYMBOLS:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Watchlist is full (max {MAX_SYMBOLS} symbols)"
        )

    item = WatchlistItem(user_id=user.id, symbol=body.symbol, position=count or 0)
    session.add(item)
    try:
        await session.commit()
    except IntegrityError:
        # uq_watchlist_user_symbol — the symbol is already there. A double-click
        # lands here rather than creating a duplicate row.
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"{body.symbol} is already on your watchlist"
        ) from None
    await session.refresh(item)
    return item


@router.delete("/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item(symbol: str, user: CurrentUser, session: DbSession):
    result = await session.execute(
        delete(WatchlistItem).where(
            WatchlistItem.user_id == user.id,
            WatchlistItem.symbol == symbol.strip().upper(),
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{symbol.upper()} is not on your watchlist")
    await session.commit()
