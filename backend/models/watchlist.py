"""A symbol saved to a user's watchlist."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User


class WatchlistItem(Base, TimestampMixin):
    __tablename__ = "watchlist_items"
    # A user can't hold the same symbol twice. Enforced in the DB, not just
    # in the route, so a double-click / concurrent request can't duplicate.
    __table_args__ = (UniqueConstraint("user_id", "symbol", name="uq_watchlist_user_symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Uppercased on write (see api/watchlist.py) so AAPL and aapl are one row.
    symbol: Mapped[str] = mapped_column(String(16), nullable=False)
    # Manual ordering in the UI; ties broken by id.
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user: Mapped["User"] = relationship(back_populates="watchlist")
