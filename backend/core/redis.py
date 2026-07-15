"""Shared Redis client.

Redis backs two things that were previously per-process and therefore wrong the
moment the app runs more than one instance:

  - the market cache    — per-process meant N instances = N cold caches = N x the
                          Finnhub quota burned, and inconsistent staleness between
                          them
  - the rate limiter    — per-process meant N instances = N x the configured limit,
                          so "10 logins/min" silently became 30 with three workers

Availability stance: Redis is a *performance and coordination* dependency, not a
correctness one. If it is unreachable the app must still serve — market data
degrades to a cold fetch, and rate limiting degrades to the in-process limiter.
An outage in the cache should never become an outage in the product. Every call
site therefore treats a Redis error as a miss, not as a failure.
"""

from __future__ import annotations

import logging

from redis.asyncio import Redis
from redis.exceptions import RedisError

from .config import settings

logger = logging.getLogger("redis")

_client: Redis | None = None


def get_redis() -> Redis | None:
    """The shared client, or None when REDIS_URL is unset."""
    return _client


async def connect() -> Redis | None:
    """Called once at startup. Never raises: a Redis that is down at boot must
    not stop the app from booting."""
    global _client
    if not settings.redis_url:
        logger.info("REDIS_URL not set — using in-process cache and rate limiter "
                    "(correct for a single instance only)")
        return None

    client = Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        # Don't let a slow or dead Redis stall a request. Failing fast here is
        # the whole point: the caller falls back immediately.
        socket_timeout=2,
        socket_connect_timeout=2,
        retry_on_timeout=False,
        health_check_interval=30,
    )
    try:
        await client.ping()
    except (RedisError, OSError) as exc:
        logger.error("Redis unreachable at startup (%s) — falling back in-process", exc)
        await client.aclose()
        return None

    logger.info("Redis connected")
    _client = client
    return client


async def disconnect() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
