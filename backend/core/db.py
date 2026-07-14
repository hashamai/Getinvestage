"""Async SQLAlchemy engine + session dependency.

Works against Postgres (psycopg) in production and SQLite (aiosqlite) locally;
see core/config.py. Models must stick to dialect-neutral column types.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

# SQLAlchemy's default pool is 5 connections + 10 overflow, and a request that
# finds them all busy blocks on pool_timeout (default 30s) before failing. Under
# load that shows up as latency cliffs rather than honest errors. Size the pool
# for the expected concurrency and fail fast when it's genuinely exhausted.
#
# SQLite takes none of these: its async pool is a NullPool and passing pool_size
# to it raises TypeError.
_pool_args = (
    {}
    if _is_sqlite
    else {
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        # Fail in 5s instead of hanging for 30 — a queued request that can't get
        # a connection should surface as a 500 you can see and alert on, not as
        # a request that silently takes half a minute.
        "pool_timeout": 5,
        # Neon and most managed Postgres close idle connections server-side.
        # Recycle before they do, so pre_ping rarely has to discard one.
        "pool_recycle": 300,
    }
)

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=False,
    **_pool_args,
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request, always closed."""
    async with SessionLocal() as session:
        yield session
