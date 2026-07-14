"""User account."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .refresh_token import RefreshToken
    from .watchlist import WatchlistItem


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stored lowercased (see api/auth.py) so uniqueness is case-insensitive
    # without relying on a dialect-specific CITEXT/functional index.
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    # argon2 hash — never the password itself. Length is generous; argon2
    # encoded hashes run ~95 chars but the format can grow with parameters.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # lazy="raise" on purpose. get_current_user loads this User on EVERY
    # authenticated request; with the previous lazy="selectin" that fired a
    # second query for the whole watchlist every time, even on requests that
    # only needed the user id. Nothing reads these collections through the
    # relationship (the watchlist API queries WatchlistItem directly), so
    # forbidding implicit loads makes the cost impossible to reintroduce by
    # accident. passive_deletes hands cascade deletion to the FK's ON DELETE
    # CASCADE instead of loading the rows to delete them one by one.
    watchlist: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )
