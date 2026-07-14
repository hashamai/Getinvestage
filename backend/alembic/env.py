"""Alembic environment.

Reads DATABASE_URL from core.config (single source of truth) and runs
migrations through the async engine, so the same commands work against
SQLite locally and Postgres in production.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool

from core.config import settings
from models import Base  # imports every model, so autogenerate sees every table

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _configure(connection=None, url=None):
    context.configure(
        connection=connection,
        url=url,
        target_metadata=target_metadata,
        literal_binds=url is not None,
        compare_type=True,  # catch a column type change, not just add/drop
        # SQLite cannot ALTER a column in place; batch mode rebuilds the table.
        # No-op on Postgres.
        render_as_batch=settings.database_url.startswith("sqlite"),
    )


def run_migrations_offline() -> None:
    _configure(url=settings.database_url)
    with context.begin_transaction():
        context.run_migrations()


def _run(connection) -> None:
    _configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
