"""Application settings, loaded from the environment (.env in development).

DATABASE_URL drives the dialect:
  - production:  postgresql+asyncpg://user:pass@host/db   (Neon)
  - local:       sqlite+aiosqlite:///./app.db             (default, zero setup)
Column types in models/ are kept dialect-neutral so both work.
"""

from __future__ import annotations

import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- market data ---
    finnhub_api_key: str = ""

    # --- database ---
    # Postgres in dev and prod. SQLite remains supported (tests use it, and it
    # keeps a fresh clone runnable) but is no longer the default: the app should
    # develop against the engine it deploys on, or you find the dialect
    # differences in production.
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/getinvestage"
    # Ignored on SQLite (NullPool). On Postgres these bound concurrency: keep
    # pool_size + max_overflow under the provider's connection cap (Neon's free
    # tier allows ~100, and every uvicorn worker opens its own pool).
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # --- redis ---
    # Shared cache + rate-limit store. Empty = fall back to the in-process
    # implementations, which are correct on ONE instance and wrong on two.
    # Upstash gives a rediss:// URL that works from a laptop and from Render.
    redis_url: str = ""

    # --- auth ---
    # Generated per-process if unset so local dev works out of the box. In
    # production this MUST be set: a random key on each boot would invalidate
    # every issued token on restart. main.py fails fast if it's missing there.
    secret_key: str = ""
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    # --- deployment ---
    # "development" | "production". Production requires SECRET_KEY and marks
    # the refresh cookie Secure.
    environment: str = "development"
    frontend_origins: str = "http://localhost:5174"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]


settings = Settings()

# Resolved ONCE per process. A per-call random key would invalidate every
# token the moment it was issued; a per-boot random key only invalidates
# tokens across restarts, which is acceptable in local dev but not in prod
# (main.py refuses to start in production without SECRET_KEY set).
SECRET_KEY: str = settings.secret_key or secrets.token_urlsafe(32)
