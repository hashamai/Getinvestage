"""Test fixtures: a real app wired to a throwaway SQLite database.

Nothing here touches the dev database or the network. The market service is
never exercised (no FINNHUB_API_KEY in tests -> demo mode), and every test
gets a fresh schema so ordering can't leak state between them.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Must be set before core.config is imported anywhere.
TEST_DB = BACKEND_DIR / "test.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB.as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-not-used-anywhere-real"
os.environ["ENVIRONMENT"] = "development"
os.environ["FINNHUB_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from core.db import engine  # noqa: E402
from core.ratelimit import login_limit, refresh_limit, register_limit  # noqa: E402
from models import Base  # noqa: E402


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """The limiters hold process-global state, so without this the suite
    throttles itself: every test registers a user from the same 'IP', and the
    5-per-5-minutes signup cap would fail every test after the fifth."""
    for dep in (login_limit, register_limit, refresh_limit):
        dep.limiter.reset()
    yield


@pytest.fixture(autouse=True)
def fresh_schema():
    """Drop and recreate every table around each test."""

    async def reset(create: bool):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            if create:
                await conn.run_sync(Base.metadata.create_all)

    asyncio.run(reset(create=True))
    yield
    asyncio.run(reset(create=False))


@pytest.fixture
def client():
    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth(client):
    """Register a user and return (headers, user). Access token in the header,
    refresh cookie held by the client's cookie jar."""

    def _make(email: str = "trader@example.com", password: str = "correct-horse-battery"):
        resp = client.post(
            "/api/auth/register",
            json={"email": email, "password": password},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]

    return _make
