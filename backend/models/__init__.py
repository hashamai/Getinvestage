"""SQLAlchemy models.

Every model must be imported here: Alembic's autogenerate walks Base.metadata,
and a model that is never imported is a table that never gets a migration.
"""

from .base import Base
from .refresh_token import RefreshToken
from .user import User
from .watchlist import WatchlistItem

__all__ = ["Base", "RefreshToken", "User", "WatchlistItem"]
