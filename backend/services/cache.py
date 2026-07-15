"""TTL cache with serve-stale-on-error support.

Two backends, one interface — `await get(key) -> (value, is_fresh)` and
`await set(key, value, ttl)`:

  - RedisCache  — shared across instances. The real one.
  - TTLCache    — SQLite, in-process. Fallback when REDIS_URL is unset, so a
                  fresh clone still runs with zero infrastructure.

THE LOAD-BEARING IDEA: expiry must not delete.

The whole degradation ladder depends on being able to read a *stale* entry when
the upstream is down (serve-stale-on-error). A conventional cache — including a
naive `SETEX(key, 30, value)` — deletes the value the moment it expires, so 30
seconds after the last good fetch the fallback data is gone and a Finnhub outage
becomes an error page instead of slightly-old prices.

So the TTL is stored *logically*, inside the payload (`exp`), and the key is
given a much longer *physical* TTL (STALE_TTL) purely to bound memory. `get()`
compares `exp` against the clock and reports freshness; the value stays readable
long after it goes stale. Redis's own expiry is a garbage collector here, not the
cache policy.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from pathlib import Path

from anyio import to_thread
from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger("cache")

# How long a value stays *readable* after it goes stale. This is the memory
# bound, not the freshness policy — freshness is the per-entry `exp` below.
# Seven days means a week-long Finnhub outage still has something to serve.
STALE_TTL = 7 * 24 * 3600

CachedValue = dict | list


def _wrap(value: CachedValue, ttl_seconds: float) -> str:
    return json.dumps({"v": value, "exp": time.time() + ttl_seconds})


def _unwrap(raw: str) -> tuple[CachedValue | None, bool]:
    try:
        payload = json.loads(raw)
        return payload["v"], time.time() < payload["exp"]
    except (ValueError, KeyError, TypeError):
        # A corrupt or old-format entry is a miss, not a crash.
        return None, False


class RedisCache:
    """Shared cache. Survives restarts and is consistent across instances."""

    def __init__(self, client: Redis, namespace: str = "mkt"):
        self._redis = client
        self._ns = namespace

    def _key(self, key: str) -> str:
        return f"{self._ns}:{key}"

    async def get(self, key: str) -> tuple[CachedValue | None, bool]:
        try:
            raw = await self._redis.get(self._key(key))
        except (RedisError, OSError) as exc:
            # Redis is a performance dependency, not a correctness one. A dead
            # Redis must look like a cache miss, not like a 500.
            logger.warning("Redis GET failed (%s) — treating as a miss", exc)
            return None, False
        if raw is None:
            return None, False
        return _unwrap(raw)

    async def set(self, key: str, value: CachedValue, ttl_seconds: float) -> None:
        try:
            # ex=STALE_TTL bounds memory; the real TTL lives inside the payload.
            await self._redis.set(self._key(key), _wrap(value, ttl_seconds), ex=STALE_TTL)
        except (RedisError, OSError) as exc:
            logger.warning("Redis SET failed (%s) — value not cached", exc)

    def close(self) -> None:
        # The client's lifecycle is owned by core/redis.py, not by the cache.
        pass


class TTLCache:
    """SQLite fallback for when REDIS_URL is unset.

    sqlite3 is blocking, so every call runs on a worker thread — calling it
    directly from an async handler would block the event loop, and its
    connection lock would serialize every concurrent request through one
    cache access. WAL mode lets readers proceed while a writer holds the lock.
    """

    def __init__(self, db_path: str | Path = "cache.db"):
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS cache "
            "(key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at REAL NOT NULL)"
        )
        self._conn.commit()

    def _get(self, key: str) -> tuple[CachedValue | None, bool]:
        with self._lock:
            row = self._conn.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?", (key,)
            ).fetchone()
        if row is None:
            return None, False
        return json.loads(row[0]), time.time() < row[1]

    def _set(self, key: str, value: CachedValue, ttl_seconds: float) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO cache (key, value, expires_at) VALUES (?, ?, ?)",
                (key, json.dumps(value), time.time() + ttl_seconds),
            )
            self._conn.commit()

    async def get(self, key: str) -> tuple[CachedValue | None, bool]:
        return await to_thread.run_sync(self._get, key)

    async def set(self, key: str, value: CachedValue, ttl_seconds: float) -> None:
        await to_thread.run_sync(self._set, key, value, ttl_seconds)

    def close(self) -> None:
        with self._lock:
            self._conn.close()


def build_cache(redis: Redis | None, sqlite_path: str | Path) -> RedisCache | TTLCache:
    if redis is not None:
        logger.info("Cache backend: Redis (shared)")
        return RedisCache(redis)
    logger.info("Cache backend: SQLite (in-process — single instance only)")
    return TTLCache(sqlite_path)
