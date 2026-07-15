"""Per-IP sliding-window rate limiting, backed by Redis.

Applied to the auth routes, where the absence of a limit means passwords are
brute-forceable and argon2 (CPU-expensive by design) becomes a DoS lever.

Why Redis: the previous in-process version kept counters in a dict, so N workers
or N instances each enforced the limit independently — "10 logins/minute"
silently became 30 with three workers, and an attacker only had to spread
requests across them. A shared store makes the limit mean what it says.

Fallback: if Redis is unreachable, we fall back to the in-process window rather
than failing open (no limit at all) or failing closed (locking every user out of
login because the cache is down). Degraded but still enforcing is the right
posture for a limiter.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status
from redis.exceptions import RedisError

from .redis import get_redis

logger = logging.getLogger("ratelimit")


def _client_key(request: Request) -> str:
    # Behind a proxy (Render, Fly, any CDN) request.client.host is the proxy, so
    # every user would share one bucket. The first entry of X-Forwarded-For is
    # the original client.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _too_many(retry_after: int) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many attempts. Try again shortly.",
        headers={"Retry-After": str(max(1, retry_after))},
    )


class _LocalWindow:
    """In-process sliding window. Correct on one instance; the fallback path."""

    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        cutoff = now - self.window
        # Keeps each deque bounded by `limit` and lets idle keys drain to empty
        # instead of leaking forever.
        while hits and hits[0] < cutoff:
            hits.popleft()

        if len(hits) >= self.limit:
            raise _too_many(int(hits[0] + self.window - now) + 1)
        hits.append(now)

    def reset(self) -> None:
        self._hits.clear()


async def _redis_hit(redis, name: str, key: str, limit: int, window: int) -> None:
    """Sliding window over a Redis sorted set, scored by timestamp.

    A plain INCR+EXPIRE is a *fixed* window: it lets 2x the limit through across
    a boundary (10 at 0:59, 10 more at 1:01). The sorted set drops entries that
    fell out of the trailing window, so the limit holds at every instant.

    Pipelined into one round trip — a limiter that costs three network hops is a
    latency tax on every login.
    """
    redis_key = f"rl:{name}:{key}"
    now = time.time()
    cutoff = now - window

    pipe = redis.pipeline()
    pipe.zremrangebyscore(redis_key, "-inf", cutoff)  # forget what aged out
    pipe.zcard(redis_key)                             # how many remain
    pipe.zadd(redis_key, {uuid.uuid4().hex: now})     # record this attempt
    pipe.expire(redis_key, window)                    # GC the key when idle
    _, count, _, _ = await pipe.execute()

    # zcard ran BEFORE our zadd, so `count` excludes this request.
    if count >= limit:
        oldest = await redis.zrange(redis_key, 0, 0, withscores=True)
        retry_after = int(oldest[0][1] + window - now) + 1 if oldest else window
        # This attempt was rejected, so don't let it count against the user —
        # otherwise a client hammering the endpoint keeps pushing its own
        # window forward and can never get back in.
        await redis.zremrangebyscore(redis_key, now, now)
        raise _too_many(retry_after)


def rate_limit(limit: int, window: int, name: str):
    """Build a FastAPI dependency enforcing `limit` requests per `window` seconds.

    Returns a plain function, not a callable object: FastAPI resolves a
    dependency's type hints through `__globals__`, which a class instance does
    not have — so `request: Request` on a `__call__` method silently degrades
    into a required *query parameter* and every request 422s.
    """
    local = _LocalWindow(limit, window)

    async def dependency(request: Request) -> None:
        key = _client_key(request)
        redis = get_redis()
        if redis is None:
            local.hit(key)
            return
        try:
            await _redis_hit(redis, name, key, limit, window)
        except RedisError as exc:
            # Degrade, don't fail open. An unlimited login endpoint is worse
            # than a limit that's only enforced per-process for a few minutes.
            logger.warning("Redis rate-limit failed (%s) — falling back in-process", exc)
            local.hit(key)

    dependency.limiter = local  # exposed so tests can reset the fallback window
    return dependency


# Tight on login: a human mistypes a password a few times, a script tries
# thousands. 10/min is generous for the former and useless for the latter.
login_limit = rate_limit(limit=10, window=60, name="login")
# Signup is rarer still, and unthrottled it lets anyone fill the users table.
register_limit = rate_limit(limit=5, window=300, name="register")
# Refresh is legitimate but automated (roughly every 15 min per open tab), so the
# ceiling is higher — it exists to stop a token-guessing loop, not normal use.
refresh_limit = rate_limit(limit=60, window=60, name="refresh")
