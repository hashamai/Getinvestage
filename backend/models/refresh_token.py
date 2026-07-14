"""A single issued refresh token, tracked so it can be revoked.

A bare JWT cannot be taken back: it stays valid until it expires, which makes
logout cosmetic and a stolen 7-day token unstoppable. Storing the `jti` here
gives us three things a stateless token can't have:

  - real logout          — revoke this row, the cookie is now worthless
  - rotation             — each refresh revokes the old jti and issues a new one,
                           so a leaked token has a short useful life
  - reuse detection      — if an ALREADY-revoked jti comes back, the token was
                           replayed (someone kept a copy). We can't tell the
                           thief from the victim, so we revoke the user's whole
                           family of tokens and force a fresh login.

Rows are per-device, so signing out on your laptop doesn't sign out your phone.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User


class RefreshToken(Base, TimestampMixin):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    # uuid4 hex; indexed because every /auth/refresh looks a token up by it.
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # NULL = live. Set on logout, on rotation, and on reuse detection.
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

    @property
    def is_live(self) -> bool:
        return self.revoked_at is None
