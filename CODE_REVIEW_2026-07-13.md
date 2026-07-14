# Code Review & Hardening — 2026-07-13

Full-project review of **Getinvestage** against four questions: is the authentication
secure, does the database survive high traffic, is any code dead or bloated, and is the
architecture what a senior engineer would actually ship.

**Ten issues found. Ten fixed. Every fix is verified, not asserted** — see
[Verification](#verification) for the measurements.

| | Before | After |
|---|---|---|
| Backend tests | 29 passing | **36 passing** |
| Login (unknown vs known email) | 2ms vs 80ms — **enumeration oracle** | 65ms vs 67ms (**1.03x**) |
| Brute-force protection | none | **10 attempts / min / IP** |
| Logout | cosmetic (cookie only) | **server-side revocation** |
| argon2 (~66ms CPU) | **blocked the event loop** | runs on a worker thread |
| Cache I/O | **blocked the event loop** | runs on a worker thread |
| Queries per authenticated request | 2 (watchlist eagerly loaded) | **1** |
| DB pool | 5 + 10, 30s stall on exhaustion | 10 + 20, **fail fast in 5s** |

---

## 1. Security — authentication

### 1.1 argon2 blocked the event loop (also a DoS lever)
`core/security.py`

argon2 is *designed* to be CPU-expensive (64MB, ~66ms measured). It was being called
synchronously from `async def login` / `async def register`, so **every login froze the entire
event loop for ~66ms** — including every unrelated `/api/quote` request from every other user.
An attacker POSTing junk logins in a loop could pin the process at 100% CPU and take the whole
app down without any credentials at all.

**Fix:** `hash_password` / `verify_password` / `needs_rehash` are now `async` and run on a
worker thread via `anyio.to_thread.run_sync`. The loop stays free while the hash computes.

> This is the single most important fix in this pass. It is simultaneously a
> **throughput bug** and a **denial-of-service vulnerability**, and it is invisible in
> single-user testing — everything feels fine until two people log in at once.

### 1.2 Login leaked which emails have accounts (timing oracle)
`api/auth.py`

The code returned an identical error message for "no such user" and "wrong password" — the
right instinct — but then undermined it one line up:

```python
if user is None or not verify_password(...):   # short-circuits!
```

For an unknown email, `verify_password` **never ran**, so the request returned in ~2ms. A wrong
password on a *real* account ran argon2 and took ~80ms. Timing the responses tells an attacker
exactly which emails are registered, which is the whole thing the identical message was
supposed to prevent.

**Fix:** when the email doesn't exist, verify the password against a throwaway hash
(`verify_password_dummy`) and discard the result. Both paths now burn the same CPU.
**Measured: 65.2ms vs 67.2ms — a 1.03x ratio.**

### 1.3 No rate limiting — passwords were brute-forceable
`core/ratelimit.py` (new)

`/api/auth/login` had no throttle, lockout, or backoff. An attacker could try passwords as fast
as the network allowed, and (per 1.1) each attempt also cost the server 66ms of blocked CPU.

**Fix:** a dependency-free per-IP sliding-window limiter. Login 10/min, register 5/5min,
refresh 60/min. Returns `429` with a `Retry-After` header. `X-Forwarded-For` aware, so a
reverse proxy doesn't collapse every user into one bucket.

**Why not `slowapi`:** it's ~50 lines, this app is a single process, and the interface is
identical when it eventually needs Redis. Documented honestly in the module: **the counters are
per-process**, so N workers = N x the limit. That is fine now and wrong the day the app scales
out — at which point `_Window.hit()` becomes a Redis `INCR` and nothing else changes.

*(Implementation note worth keeping: the limiter is a **factory returning a function**, not a
callable class. FastAPI resolves a dependency's type hints through `__globals__`, which a class
instance doesn't have — so `request: Request` on a `__call__` method silently degrades into a
required **query parameter** and every request 422s. This bit us and is caught by the tests.)*

### 1.4 Logout was cosmetic — the token stayed valid for 7 days
`models/refresh_token.py` (new), `api/auth.py`

Logout deleted the cookie and nothing else. A JWT cannot be taken back; it is valid until it
expires. So anyone holding a *copy* of the refresh token (XSS on a subdomain, shared machine,
leaked proxy log, stolen backup) could **keep minting access tokens for the full 7 days after
the user believed they had signed out.** Nothing could revoke it — not logout, not a password
change.

**Fix:** refresh tokens now carry a `jti` recorded in a `refresh_tokens` table. This buys three
properties a stateless token cannot have:

- **Real logout** — revoke the row; the cookie is now worthless. *Per-device*, so signing out on
  your laptop doesn't sign out your phone.
- **Rotation** — every refresh retires the token it consumed and issues a new one, so a leaked
  token is only useful until the victim's next refresh.
- **Reuse detection** — if an already-revoked `jti` comes back, the token was replayed. We can't
  tell the thief from the victim, so **the user's entire token family is revoked** and both are
  forced to log in again. This is the standard OAuth refresh-rotation defense.

---

## 2. Database — scalability under high traffic

### 2.1 The cache was the throughput ceiling for the whole market API
`services/cache.py`

`TTLCache` used blocking `sqlite3` behind a `threading.Lock`, called directly from async request
handlers. Two compounding problems: every `get`/`set` **blocked the event loop**, and the lock
**serialized all cache access across all concurrent requests**. Since every market endpoint
touches the cache, this was the bottleneck for the entire API — precisely the high-traffic
failure asked about.

**Fix:** the public methods are `async` and run the SQLite work on a worker thread. Enabled
**WAL mode**, so readers proceed while a writer holds the lock (this is what makes the threaded
access genuinely concurrent rather than merely off-loop). Added a bounded `purge()` — stale rows
are load-bearing for serve-stale-on-error, so only *genuinely ancient* ones go; without it the
table grew forever.

Call sites in `services/market.py` now `await`. **The degradation ladder is unchanged** — that
design was right and I didn't touch it.

### 2.2 Every authenticated request loaded the user's entire watchlist
`models/user.py`

`User.watchlist` was `lazy="selectin"`. `get_current_user` runs `session.get(User, id)` on
**every** protected request — so that eager load fired a **second query for the whole watchlist
every single time**, including on requests that only needed the user's id. At 50 symbols per
user under load, that's a doubling of query count and Neon round-trips for data immediately
thrown away.

**Fix:** `lazy="raise"`. Nothing reads these collections through the relationship (the watchlist
API queries `WatchlistItem` directly), so forbidding implicit loads makes the cost *impossible to
reintroduce by accident* — an accidental access now raises loudly instead of silently costing a
query. Added `passive_deletes=True` so cascade deletion uses the FK's `ON DELETE CASCADE` rather
than loading every row to delete it one at a time.

**Queries per authenticated request: 2 → 1.**

### 2.3 Connection pool would stall, not fail, under load
`core/db.py`

Default pool: 5 connections + 10 overflow, and a request finding them all busy blocks on
`pool_timeout` (**default 30 seconds**) before giving up. Under traffic that surfaces as a
latency cliff — requests that hang for half a minute — rather than an honest error you can see
and alert on.

**Fix:** `pool_size=10`, `max_overflow=20` (configurable), `pool_timeout=5` (**fail fast, don't
hang**), and `pool_recycle=300` because Neon closes idle connections server-side. Pool args are
skipped on SQLite, whose async pool is a `NullPool` and raises `TypeError` if you pass them.

### 2.4 Watchlist add had a read-then-write race
`api/watchlist.py`

The `MAX_SYMBOLS` check and the insert were a classic TOCTOU: two concurrent adds both read
`count = 49`, both pass the limit check, both insert — **the cap is breached and both rows get
the same `position`**. The unique constraint protects against duplicate *symbols*, but not
against the count or the ordering.

**Fix:** `SELECT ... FOR UPDATE` on the user's row for the transaction, serializing only *that
user's* writes (costs nothing across users). No-op on SQLite, which serializes writers anyway.

---

## 3. Correctness

### 3.1 Watchlist rollback could silently discard a concurrent add
`getinvestage/src/useWatchlist.js`

`remove()` snapshotted the whole array at render time (`const before = items`) and restored it
wholesale on failure. If a concurrent `add()` resolved in between, the rollback **erased the
newly added symbol.** Having `items` in the dependency array also rebuilt `remove`/`toggle` on
every list change, re-rendering every Watchlist row.

**Fix:** capture only the removed rows *inside* the functional updater and restore only those,
leaving concurrent changes intact. Empty dependency array — stable callback identity, no
spurious re-renders.

### 3.2 SPA path containment compared a resolved path to an unresolved one
`backend/main.py`

The fallback resolved the candidate path but compared it against an **unresolved** `DIST_DIR`.
If any component of the repo path is a symlink or a Windows junction, `is_relative_to` compares
two different things and the containment check fails unpredictably — open or closed.

**Fix:** resolve `DIST_DIR` once at module load, so the comparison is sound.

---

## 4. Dead code & cleanup

- Removed unused `utcnow()` from `models/base.py`.
- `MarketService.close()` now closes the cache connection (it was leaked on shutdown).
- Extracted the duplicated token-issuing logic in `api/auth.py` into one `_issue()` helper
  (register, login, and refresh all mint tokens identically — it was written three times).
- `decode_token` returns the payload instead of a bare int, so callers can read `jti` without a
  second decode.

**Deliberately left alone:** the `services/` layer (market, demo_data) and the degradation
ladder. That code is genuinely good — the provider-routing, normalization, and
stale-on-error design is the strongest thing in the repo, and the clean service boundary is
exactly why auth and the database could land without market code changing a line.

---

## Verification

Nothing here is claimed without being run.

```
36 backend tests passing (was 29 — 7 new)
frontend build clean: 232 KB / 76 KB gzipped
```

**Live, over real HTTP:**

```
GET  /                    -> 200          app serves
GET  /dashboard           -> 200          deep link / hard refresh works
GET  /api/health          -> 200          {"status":"ok","demoMode":false}
GET  /api/quote/AAPL      -> 200          AAPL 317.57   (real data, async cache OK)

logout    -> 204,  replay stolen token  -> 401   revocation is real
refresh   -> 200,  replay spent token   -> 401   rotation works
                   victim's live token  -> 401   reuse detection revokes the family

login brute force:  attempts 1-10 -> 401,  attempt 11+ -> 429
```

**Timing oracle, measured (5-sample median, limiter reset to isolate hashing cost):**

```
KNOWN email + wrong password : 67.2 ms
UNKNOWN email                : 65.2 ms
ratio                        : 1.03x        <- oracle closed
```

---

## Still open (deliberately, with reasons)

1. **Symbol input validation** — `{symbol}` path params accept arbitrary strings. Not injectable
   (httpx encodes, SQL is parameterized) but it burns Finnhub quota and grows cache rows.
   A `^[A-Z0-9.^-]{1,12}$` pattern closes it. *Small, do it next.*
2. **Security headers** — no CSP, `X-Content-Type-Options`, or `Referrer-Policy`. Note the CSP
   will need `style-src 'unsafe-inline'` until the inline-style approach changes — a concrete
   *security* cost of that styling decision, not just a maintenance one.
3. **Rate limiter is per-process.** Correct today, wrong on the first second instance. Swap
   `_Window` for Redis when you scale out.
4. **The cache is per-process too.** Two instances = two caches = 2x the Finnhub quota burn and
   inconsistent staleness. This is the real architectural scale gate; Redis solves both it and #3.
5. **Market/service tests.** The degradation ladder is still the best untested material in the
   repo and would be high-signal to cover.

## Files changed

**New:** `backend/core/ratelimit.py`, `backend/models/refresh_token.py`,
`backend/alembic/versions/*_refresh_tokens.py`

**Modified:** `backend/core/{security,db,config,deps}.py`, `backend/api/{auth,watchlist}.py`,
`backend/models/{user,base,__init__}.py`, `backend/services/{cache,market}.py`,
`backend/main.py`, `backend/tests/{conftest,test_auth}.py`,
`getinvestage/src/useWatchlist.js`
