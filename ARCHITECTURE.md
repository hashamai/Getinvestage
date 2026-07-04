# Getinvestage — Architecture & Design Decisions

> A deep-dive into every file, every function, every design decision — the reasoning behind it,
> the alternatives that were considered (or should have been), and what a senior engineer would
> change on the road to a production-ready, secure, scalable system.
>
> Last updated: 2026-07-04 (Phase 1 codebase)

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [System Overview](#2-system-overview)
3. [The Tech Stack — and Why Each Piece Was Chosen](#3-the-tech-stack--and-why-each-piece-was-chosen)
4. [Backend Deep-Dive (file by file, function by function)](#4-backend-deep-dive)
5. [Frontend Deep-Dive (file by file, function by function)](#5-frontend-deep-dive)
6. [Architecture Decision Records (ADRs)](#6-architecture-decision-records)
7. [Security Audit — Current State](#7-security-audit--current-state)
8. [Scalability Analysis — Where It Breaks and When](#8-scalability-analysis)
9. [The Senior-Engineer Roadmap to Production](#9-the-senior-engineer-roadmap-to-production)

---

## 1. What This Project Is

**Getinvestage** is a terminal-style stock-market research assistant for retail investors.
It has two goals, in priority order:

1. **Portfolio project to get hired** — it must demonstrate senior-level engineering judgment
   (grounded AI, graceful degradation, honest data labeling), not just "another React dashboard."
2. **Learning vehicle** — each weekly "slice" adds a production concern (caching, deployment,
   RAG, evals).

The product thesis (from the office-hours design review): the differentiator is a **grounded,
genuinely useful AI assistant** — RAG for text questions, tool-calling for numeric questions —
not a wrapped ChatGPT. Phase 1 (this codebase) is the live dashboard with a rule-based
(non-LLM) assistant; the LLM and RAG layers are future slices.

---

## 2. System Overview

```
                            ┌───────────────────────────────────────────┐
                            │                Browser                    │
                            │  React 18 SPA (getinvestage/dist)         │
                            │  · polls /api/quotes every 20s            │
                            │  · fetches /api/candles per range         │
                            │  · rule-based assistant (pure JS, local)  │
                            └──────────────────┬────────────────────────┘
                                               │ same-origin HTTP (JSON)
                                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     FastAPI  (backend/main.py, :8000)                │
│                                                                      │
│  /api/quote/{sym}   /api/quotes?symbols=   /api/candles/{sym}        │
│  /api/search        /api/profile/{sym}     /api/news/{sym}           │
│  /api/indices       /api/health            /  (static dist/)         │
│                                                                      │
│              ┌──────────────────────────────────────┐                │
│              │   MarketService (services/market.py) │                │
│              │   · provider routing                 │                │
│              │   · response normalization           │                │
│              │   · stale-on-error fallback chain    │                │
│              └───────┬───────────────┬──────────────┘                │
│                      │               │                               │
│           ┌──────────▼─────┐  ┌──────▼────────────┐                  │
│           │ TTLCache       │  │ demo_data.py      │                  │
│           │ (SQLite, local)│  │ (synthetic data)  │                  │
│           └────────────────┘  └───────────────────┘                  │
└───────────────┬──────────────────────────┬───────────────────────────┘
                │ HTTPS                    │ HTTPS
                ▼                          ▼
      ┌──────────────────┐      ┌────────────────────────┐
      │  Finnhub API     │      │  Yahoo Finance chart   │
      │  (key, 60/min)   │      │  API (keyless, no SLA) │
      │  quotes/search/  │      │  candles, index quotes │
      │  profile/news    │      │                        │
      └──────────────────┘      └────────────────────────┘
```

**The one-sentence architecture:** a thin FastAPI proxy that normalizes, caches, and
honestly labels market data from two free upstreams, serving a self-contained React SPA
that degrades gracefully through four data-quality tiers (live → cached-stale → synthetic-anchored → fully-synthetic).

### The degradation ladder (the most important idea in this codebase)

Every data path has an explicit fallback chain, and every response says where its data
came from (`source` field, UI badges). This is the project's engineering signature:

| Tier | Quotes | Candles | UI label |
|---|---|---|---|
| 1. Live | Finnhub (stocks) / Yahoo (indices) | Yahoo chart API | `LIVE · YAHOO/FINNHUB` |
| 2. Stale cache | last-good SQLite value | last-good SQLite value | (served silently — data is real, just old) |
| 3. Anchored synthetic | — | seeded random walk ending at the real quote | `source: "synthetic-anchored"` |
| 4. Fully synthetic | demo mode (no key) | seeded random walk | `SIMULATED — OFFLINE` |

*Why this matters for hiring:* most junior dashboards show a spinner or crash when an API
fails. This one keeps working and tells the truth about data quality. That's an SRE
mindset applied to a product.

---

## 3. The Tech Stack — and Why Each Piece Was Chosen

| Layer | Choice | Why | Main alternatives (and why not) |
|---|---|---|---|
| Backend framework | **FastAPI** | Async-native (concurrent upstream calls), automatic OpenAPI docs, Pydantic validation, the de-facto Python API standard; also positions the project for the LLM/RAG slice (Python ML ecosystem) | **Flask**: sync-first, would need gevent/threads for concurrent fetches. **Django**: too heavy for a JSON proxy, ORM unused. **Node/Express**: fine, but Python was chosen for the future RAG/LLM work |
| ASGI server | **uvicorn** | Standard FastAPI pairing, `[standard]` extra adds uvloop/httptools speedups | **hypercorn** (HTTP/2, niche), **gunicorn+uvicorn workers** (the production upgrade, see §9) |
| HTTP client | **httpx.AsyncClient** | Async, connection pooling, timeouts; one shared client per process | **aiohttp** (equivalent; httpx has the nicer API and sync parity), **requests** (blocking — would serialize the batch-quote fan-out) |
| Cache | **SQLite via stdlib `sqlite3`** | Zero infra, survives restarts (critical for stale-on-error), one file, free | **Redis**: the production answer, but adds a service to deploy for a single-instance app. **In-memory dict**: loses stale data on every restart — kills the degradation ladder. **diskcache**: fine, but stdlib is one less dependency |
| Market data (primary) | **Finnhub free tier** | Real API with a key, SLA-ish, 60 calls/min, official ToS covering this use | **yfinance**: scrapes Yahoo, no SLA, cloud-provider IPs get blocked — would break the deployed demo. **Alpha Vantage**: 25 req/day free — unusable. **Polygon/IEX**: paid |
| Market data (candles) | **Yahoo chart API (raw HTTP)** | Finnhub's `/stock/candle` is premium-only; Yahoo's chart endpoint is keyless and is exactly what yfinance wraps — but calling it directly drops the heavy dependency | **Paying Finnhub**: not for a portfolio project. **Synthetic-only candles**: dishonest charts, weak demo |
| Frontend framework | **React 18 + Vite, plain JavaScript** | Ubiquitous (hiring signal), Vite dev speed, no framework lock-in for a 9-component app | **Next.js**: SSR is pointless for a live dashboard behind a data API. **TypeScript**: genuinely the better call — see ADR-11. **Svelte/Vue**: fine tech, weaker hiring signal for this market |
| Charts | **Hand-rolled SVG** | Zero dependency, full control of the terminal aesthetic, self-drawing animation, ~80 LOC | **Recharts/Chart.js**: 100KB+ for two line charts, fights the custom look. **D3**: overkill; you'd use 5% of it. **Lightweight-charts (TradingView)**: the right answer *if* candlestick/OHLC display becomes a requirement |
| Styling | **Inline styles + one global.css** | Small app, no build-time CSS machinery, design tokens via CSS custom properties (`--accent`, `--up`, `--down`) | **Tailwind**: the mainstream answer, better at scale. **CSS Modules / styled-components**: more ceremony than a 9-component app needs. Trade-off accepted: no pseudo-classes/media-queries inline, hover is done in JS (a real wart — see §5) |
| State management | **One custom hook (`useMarket`) with a mutable ref + version counter** | The entire app state is one instrument array updated by pollers; a store library adds nothing | **Redux/Zustand/Jotai**: justified the moment there are multiple writers or persisted user state (watchlist editing, auth). **React Query**: the right upgrade for the fetch layer specifically — see ADR-12 |
| Serving model | **FastAPI serves the built SPA** (`StaticFiles` mount) | One process, one port, one deploy, zero CORS in production | **Vercel(front) + Render(back)** split: the original eng-review plan; better CDN edge caching for static assets but two deploys and real CORS. Either is defensible; single-server won on simplicity |

---

## 4. Backend Deep-Dive

### 4.1 `backend/main.py` — the API layer (162 lines)

**Responsibility:** HTTP concerns only — routing, input validation, error→status-code mapping,
CORS, static file serving, app lifecycle. All market logic lives in the service layer.
This separation is deliberate: routes stay boring and testable, and the service can later be
reused by the LLM tool-calling endpoint without touching HTTP code.

#### Lifecycle: `lifespan()` (lines 39–50)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    ...
    app.state.market = MarketService(api_key or None, cache)
    yield
    await app.state.market.close()
```

- **What it does:** builds the single `MarketService` (and its `httpx` client + SQLite cache)
  at startup, closes it cleanly at shutdown.
- **Why `lifespan` and not module-level globals:** the modern FastAPI pattern (replaces the
  deprecated `@app.on_event`). Resources tied to app lifecycle get proper async cleanup —
  the `httpx.AsyncClient` needs an `await aclose()`, which can't happen at module level.
- **Why `app.state` + the `market()` accessor instead of FastAPI's `Depends`:** simplicity —
  one service, no per-request scoping needed. *Senior note:* `Depends(get_market)` would make
  routes independently testable with an injected fake and is the idiomatic upgrade once tests
  exist; with `app.state` you must spin up the whole app (or monkeypatch) to test a route.
- **Demo-mode decision:** a missing key **warns and continues** with synthetic data instead of
  crashing. Deliberate: "clone → run → see something working" beats "clone → cryptic KeyError."
  For a portfolio project, first-run experience is a feature. A bank would fail fast instead.

#### CORS (lines 55–65)

```python
origins = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:5174").split(",") ...]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])
```

- **Why an env-var allowlist, not `*`:** scoped origins are the correct default; `*` would let
  any website's JS consume your API (and your Finnhub quota) via users' browsers.
- **Why `allow_methods=["GET"]`:** the API is read-only today; least privilege costs nothing.
- **Subtlety worth knowing:** in production (FastAPI serving the SPA) everything is same-origin,
  so CORS never fires; it exists only for the Vite dev server case. And because the Vite proxy
  (`vite.config.js`) forwards `/api` server-side, even dev traffic is same-origin — CORS is
  belt-and-suspenders. Knowing *why* a config is inert in prod is exactly the kind of question
  interviews probe.

#### Route: `GET /api/health` (line 72)

Returns `{"status": "ok", "demoMode": bool}`. Exists for deploy checks (Render pings it) and
lets the frontend/ops know the server is keyless. *Production upgrade:* include upstream
reachability and cache stats (see §9).

#### Routes: `quote`, `candles`, `search`, `profile` (lines 77–114)

All follow the same pattern:

```python
try:    return await market().get_quote(symbol)
except SymbolNotFound:      raise HTTPException(404, ...)
except UpstreamUnavailable: raise HTTPException(503, ...)
```

- **Why domain exceptions → HTTP codes at the edge:** the service layer stays HTTP-agnostic
  (raises `SymbolNotFound`, not `HTTPException`) so the same service can back a CLI, a test,
  or the future LLM tool-calls. The route is the only place that knows about status codes.
- **Why 503 (not 500) for upstream failure:** semantically correct — the service is
  *temporarily* unavailable, and 503 tells clients/load-balancers "retry later" rather than
  "the code is broken." Small choice, strong signal.
- **`candles` validates `range` against `VALID_RANGES` with a 422** — reject bad input at the
  edge with an explanatory message instead of deep in the service.
- **`search` uses `Query(..., min_length=1, max_length=30)`** — FastAPI/Pydantic does the
  validation declaratively; malformed input never reaches the service.
- *Gap a senior would flag:* `symbol` path params have **no validation** — any string reaches
  the service and is interpolated into upstream URLs. It's URL-encoded by httpx (so not an
  injection risk per se), but garbage symbols burn quota and cache rows. A
  `^[A-Z0-9.^-]{1,12}$` regex check would close it. See §7.

#### Route: `GET /api/news/{symbol}` (lines 117–122)

```python
except UpstreamUnavailable:
    return []   # news is non-critical; empty list beats an error banner
```

- **Decision: degrade to empty rather than error.** News is decorative; a 503 here would make
  the UI show a failure state for something users barely notice. This is *criticality-tiered
  error handling* — different endpoints have different failure budgets. Senior-level pattern.

#### Route: `GET /api/quotes?symbols=` — the batch endpoint (lines 125–137)

```python
syms = list(dict.fromkeys(s.strip().upper() for s in symbols.split(",") if s.strip()))[:30]
results = await asyncio.gather(*(one(s) for s in syms))
return dict(results)
```

- **Why it exists:** the frontend polls 16 instruments every 20s. Sixteen separate HTTP
  requests per poll would be waterfall latency + 16× connection overhead. One batch request
  fans out concurrently server-side.
- **`dict.fromkeys(...)`** — order-preserving dedup (a Python idiom worth knowing: sets don't
  preserve order, this does).
- **`[:30]` cap** — a hard bound on fan-out so one request can't trigger unbounded upstream
  calls. This plus `max_length=400` on the query string is basic DoS hygiene.
- **Per-symbol `try/except` returning `None`** — partial failure tolerance: one bad symbol
  doesn't fail the batch. The frontend skips `null`s. Alternative rejected: all-or-nothing
  (fragile) or HTTP 207 multi-status (over-engineered).
- **`asyncio.gather`** — this is *the* reason the backend is async. 16 upstream calls complete
  in max(latency), not sum(latency).
- *Nuance a senior would add:* `gather` without bounds is fine at 30 symbols, but the pattern
  needs a semaphore if the cap ever rises (Finnhub is 60 calls/min — a cold cache batch of 30
  is already half the minute's budget).

#### Static serving (lines 152–161)

```python
DIST_DIR = Path(__file__).resolve().parent.parent / "getinvestage" / "dist"
if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="app")
```

- **Why mount last:** FastAPI matches routes in registration order; `/api/*` must win over the
  catch-all `/` mount.
- **Why `html=True`:** serves `index.html` at `/`.
- **Missing-dist behavior:** warn and run API-only rather than crash — same "always boots"
  philosophy as demo mode.
- *Gap:* this is fine for one server, but there's no SPA-fallback for client-side routes
  (deep links like `/dashboard` would 404 if the app ever adds real routing — today it's
  state-based screens, so it works). Also no `Cache-Control` headers on static assets. See §9.

### 4.2 `backend/services/market.py` — the data layer (319 lines)

**Responsibility:** everything about market data — provider selection, HTTP calls,
normalization to a stable internal schema, caching policy, and the fallback ladder.

#### Constants (lines 26–50)

- **`YAHOO_HEADERS` browser User-Agent** — Yahoo rejects default client UAs. This is the
  fingerprint of an *unofficial* API: it works, it's what yfinance does, but it can break any
  day. The code isolates Yahoo behind two functions so a provider swap is contained. (ADR-3
  covers the ethics/risk trade-off.)
- **`YAHOO_RANGES` mapping** — UI ranges (`1D/1W/…`) to Yahoo `(range, interval)` pairs.
  Centralizing the mapping means the UI vocabulary is decoupled from provider vocabulary —
  swap providers, keep the UI contract.
- **TTL tiers** — `QUOTE_TTL=30s`, `NEWS_TTL=15m`, `CANDLE_TTL=5m`, `SEARCH/PROFILE=24h`.
  Each TTL encodes how fast the data actually changes vs. the 60-calls/min budget. Quotes are
  the freshness-critical path; profiles are nearly static. *This tiering is rate-limit
  engineering:* with 16 symbols and 30s TTL, quote fetches consume at most 32 calls/min worst
  case — under the 60 limit, and shared across all users because the cache is server-side.

#### Exceptions: `SymbolNotFound`, `UpstreamUnavailable` (lines 53–58)

Two exceptions, two very different meanings: *your input is wrong* (permanent, 404, don't
retry) vs. *the world is broken* (transient, 503, do retry). Collapsing these into one error
is the classic junior mistake; separating them is what makes the fallback ladder and the
route mapping clean.

#### `_finnhub()` (lines 71–79)

```python
if resp.status_code in (429, 500, 502, 503, 504):
    raise UpstreamUnavailable(...)
resp.raise_for_status()
```

- One choke-point for all Finnhub calls: auth token injection, and classification of
  *retryable* statuses (429 rate-limit + 5xx) into `UpstreamUnavailable` so the cache layer
  can serve stale. Other 4xx (bad request, invalid key) `raise_for_status` into a real error —
  those are bugs, and hiding them behind stale data would mask misconfiguration.

#### `_cached()` — the heart of the backend (lines 81–94)

```python
value, fresh = self.cache.get(key)
if fresh: return value
try:
    result = await fetch()
except (UpstreamUnavailable, httpx.TransportError) as exc:
    if value is not None:
        return value          # serve stale
    raise UpstreamUnavailable(...)
self.cache.set(key, result, ttl)
```

- **The pattern:** *fresh hit → return; miss → fetch + store; fetch failed but stale exists →
  serve stale; failed with no stale → 503.* This one function implements tier 2 of the
  degradation ladder for every endpoint.
- **Why generic (takes `fetch` as a callable):** quote/search/profile/news all share it —
  caching policy is written once.
- *What's missing at scale (senior list):* **request coalescing** (two concurrent misses for
  the same key both hit Finnhub — a `dict[key, asyncio.Task]` of in-flight fetches fixes it),
  **negative caching** (a `SymbolNotFound` isn't cached, so hammering a bad symbol hammers
  Finnhub), and **stale-if-error TTL bounds** (stale data is currently served forever;
  production would cap it, e.g. "stale up to 24h, then error"). None of these matter at
  current traffic; all matter at 100×.

#### `_yahoo_quote()` + `get_quote()` (lines 98–160)

- **Provider routing logic in `get_quote`:** Finnhub for normal symbols with a key; Yahoo for
  `^`-prefixed indices (Finnhub free tier has no index quotes) and for keyless mode. The
  routing rule lives in one place.
- **Finnhub quirk handled:** unknown symbols return HTTP 200 with all-zero fields; the code
  detects `not c and not pc` → `SymbolNotFound`. *Knowing your provider's failure dialects and
  normalizing them is core integration work.*
- **Normalization:** both providers map to the same shape
  (`symbol/current/change/percentChange/high/low/open/prevClose/timestamp`). The frontend
  never knows which provider answered. This anti-corruption layer is what makes providers
  swappable.
- *Wart:* the Yahoo quote path sets `"open": prev` (previous close as open) because the chart
  meta doesn't reliably carry the open. It's labeled nowhere. Minor data-accuracy debt.

#### `_yahoo_candles()` (lines 164–207)

- Parses Yahoo's awkward parallel-array format (`timestamp[]` + `indicators.quote[0].{open[],high[],...}`)
  into an array of `{t,o,h,l,c,v}` dicts.
- **Null-padding handled:** Yahoo pads market gaps with nulls; rows with any null OHLC are
  skipped rather than zero-filled (zero-filling would draw false price spikes).
- **Three distinct not-found detections** (HTTP 404, `error.code == "Not Found"`, empty
  result) — again, provider failure dialects.
- **Volume default:** `(ohlcv.get("volume") or [0]*len)` guards indices that report no volume.

#### `get_candles()` — the full ladder in one function (lines 209–253)

```python
# 1) Yahoo (real history)  → cache + return
# 2) stale cache           → return
# 3) synthetic anchored to the real quote (or pure synthetic) → cache + return
```

- **Why candles don't use `_cached()`:** the fallback chain is longer (three tiers, not two)
  and tier-3 *generates* data instead of fetching it. Forcing it through the generic helper
  would contort the helper.
- **`except SymbolNotFound: raise` before the broad except** — a genuinely unknown symbol must
  404, not silently become a synthetic chart for a ticker that doesn't exist. Easy bug to
  write; deliberately avoided.
- **The broad `except (…, KeyError, IndexError, ValueError)`** — parsing untrusted upstream
  JSON; any malformed payload degrades instead of 500s. Defensible here *because* the fallback
  is the whole point; normally a catch-list this wide is a smell.
- **`source` field (`"yahoo" | "synthetic-anchored" | "synthetic"`)** — the honesty contract
  with the UI. *Synthetic financial data that isn't labeled is a credibility (and arguably
  ethical) failure in a finance tool; this field is the fix.*
- *Wart:* synthetic results are cached with the same `CANDLE_TTL` into the same key — so after
  a Yahoo blip, real data returns only after the 5-min TTL expires even if Yahoo recovered in
  seconds. A shorter TTL for synthetic entries (or not caching tier-3 at all) would recover
  faster.

#### `search()`, `get_profile()`, `get_news()` (lines 257–319)

- All three: demo-mode short-circuit → `_cached()` wrapper → Finnhub fetch → normalize.
- **Search filters `"." in symbol`** to drop non-US listings (BMW.DE etc.) — scope control for
  a US-market product, and caps at 10 results.
- **News truncates `summary` to 280 chars** — the API shouldn't relay unbounded upstream text
  to the client (payload hygiene + layout protection).
- **Profile empty-dict → `SymbolNotFound`** — another Finnhub dialect (200 + `{}` for unknown).

### 4.3 `backend/services/cache.py` — TTL cache (44 lines)

```python
def get(self, key) -> tuple[value | None, bool]:   # (value, is_fresh)
```

- **The key design decision: expiry doesn't delete.** `get` returns `(value, is_fresh)` and
  *stale entries stay readable forever* — this is the storage half of serve-stale-on-error.
  A conventional cache (delete on expiry) would make tier 2 of the ladder impossible.
- **Why SQLite:** persistence across restarts (a deploy shouldn't wipe your fallback data),
  zero infra, single file. For a single-process app this beats Redis on
  simplicity-per-requirement.
- **`check_same_thread=False` + a `threading.Lock`:** sqlite3 connections aren't thread-safe;
  the lock serializes access. Correct, but note the subtlety: **these are sync calls inside
  async code.** Every `cache.get/set` blocks the event loop for the duration of the SQLite
  operation. At local scale it's microseconds and irrelevant; under heavy concurrency it's the
  first backend bottleneck (see §8). Fixes, in escalating order: `aiosqlite`, a WAL-mode
  connection with `run_in_executor`, or Redis.
- **JSON serialization (`json.dumps/loads`)** — human-inspectable (`sqlite3 cache.db "select * from cache"`),
  no pickle security concerns.
- *What's missing:* no eviction (the table grows forever — fine for hundreds of keys, needs a
  purge job at millions), no size cap, no metrics (hit/miss rates are the first thing you
  want when debugging rate-limit issues).

### 4.4 `backend/services/demo_data.py` — synthetic data (172 lines)

- **Determinism as a design goal:** all randomness is seeded from
  `sha256(symbol + context)` (`_seed_for`). The same symbol always gets the same demo price,
  the same chart shape, the same news order. Why: (a) demo screenshots are reproducible,
  (b) charts don't visibly re-roll on refresh (which would scream "fake"), (c) tests could
  assert exact values.
- **`demo_quote` drifts on a slow sine wave** (`sin(t/600 + phase)`) so prices move on
  refresh, making demo mode feel alive without a stateful tick engine — the *time itself* is
  the state. Clever and stateless.
- **`synthetic_candles` walks backwards from an anchor** — the series is generated
  end-to-start so the last close equals the real current price (`anchor`). This is why
  tier-3 charts still "agree" with the live quote. It also skips weekends for daily bars so
  the x-axis looks like a real market calendar. This function shows product empathy: fake data
  engineered to not *look* broken while being *labeled* fake.
- **`_RANGE_CONFIG` mirrors real market granularity** (78 five-minute bars = one 6.5h trading
  day; 252 daily bars = one trading year — the real number of US trading days).

### 4.5 `backend/requirements.txt`

Four pinned dependencies (`fastapi`, `uvicorn[standard]`, `httpx`, `python-dotenv`).
- **Exact pins (`==`)**: reproducible installs — correct for an app (libraries use ranges,
  applications pin).
- *Senior upgrade:* pins without a lockfile don't pin *transitive* deps. Move to `uv` or
  `pip-tools` (`requirements.in` → compiled lock) so `starlette`, `anyio` etc. are locked
  too. Also missing: dev-deps split (pytest, ruff) — because there are no tests yet (§9's
  first item).

---

## 5. Frontend Deep-Dive

### 5.1 `getinvestage/src/main.jsx` — entry (10 lines)

Mounts `<App>` under `React.StrictMode` with the three "tweakables" (`accentColor`,
`marketTempo`, `ambientMotion`) passed as props — a poor man's theming system documented in
the README. StrictMode matters here: it double-mounts effects in dev, and the codebase is
written to survive that (see `Assistant.jsx`'s cleanup-based auto-ask).

### 5.2 `getinvestage/src/App.jsx` — screen routing (69 lines)

- **State-machine routing, not a router:** two screens (`landing` / `dashboard`) toggled by
  `useState`, with a cinematic wipe transition (450ms until swap, 1000ms overlay).
  **Why no react-router:** two screens, no deep links, no shareable URLs needed in phase 1;
  a router is pure overhead. **The cost:** no URL state — refresh always lands on landing.
  The moment "share this ticker view" becomes a feature, add a router (ADR-13).
- **`timersRef` collects timeouts and clears them on unmount** — timer-leak hygiene that most
  small apps skip and then hit "setState on unmounted component" warnings.
- **`--accent` set as a CSS custom property from a prop** — bridges React props into CSS so
  both inline styles and global.css share one accent token.

### 5.3 `getinvestage/src/useMarket.js` — the market engine (334 lines, the frontend's core)

This one hook owns all market state. Its design is the most opinionated thing in the frontend.

#### The mutable-ref + version-counter pattern

```js
const instRef = useRef(null);        // the instrument array, mutated in place
const [, setVersion] = useState(0);  // bump() forces re-render
```

- **What:** instruments live in a ref and are *mutated*; `bump()` increments a dummy counter
  to trigger re-render. This is deliberately *not* idiomatic immutable-React.
- **Why:** 16 instruments × a history array of 120 points, updated up to every 620ms in
  simulated mode. Immutable updates would clone 16 objects + arrays per tick; here a tick is
  16 in-place pushes and one integer bump. It's a **performance-motivated escape hatch**, and
  it's contained inside one hook — components consume plain values.
- **The trade-offs a senior would name:** (a) mutation means `React.memo`/`useMemo` on
  children can't rely on reference equality — the `seq` field per instrument exists precisely
  to give components a change signal (see `PriceCell`); (b) concurrent-mode features
  (transitions, offscreen) assume immutable snapshots — this pattern can tear. Verdict:
  acceptable and pragmatic at this scale, should be revisited if the app grows writers.
  The `seq` counter is the tell that the author understood the cost.

#### `SEED` — the instrument universe (lines 32–49)

Hardcoded 16 instruments with `symbol` (display, e.g. `SPX`) vs `ySym` (backend/Yahoo, e.g.
`^GSPC`) separation, plus placeholder `mcap`/`pe` reference figures.
- **Why hardcode:** phase 1 has a fixed watchlist; no user accounts yet.
- *Debt:* `mcap`/`pe` are static placeholders shown in the stats strip (real profile data
  exists at `/api/profile/{sym}` but isn't wired in). The comment admits it. Also the base
  prices go stale by definition — they only matter for the offline simulation's starting
  point, which is fine.

#### Connection lifecycle (lines 167–200)

```
'connecting' → fetch batch quotes → any success? → 'live' (start pollers)
                                  → throw/empty  → 'simulated' (start tick loop)
```

- **One state variable (`source`) drives everything:** the three `useEffect`s each guard on
  `source` (`live` pollers, `simulated` tick loop) so exactly one engine runs. Mode switching
  by effect-dependency is clean React.
- **Startup order:** quotes first (fast, makes numbers real), then 1D candles via
  `Promise.allSettled` to backfill real sparkline history. `allSettled` (not `all`) means one
  failed candle fetch doesn't kill the rest — the same partial-failure philosophy as the
  backend batch endpoint.
- **Polling cadences:** quotes every 20s (vs. server cache TTL 30s — so roughly every other
  poll is a cache hit; deliberate quota-friendliness), candles every 5min (matching
  `CANDLE_TTL`). **Client cadence tuned to server cache policy** — cross-layer thinking.
- *Gap:* once `simulated`, it never retries the backend — a temporary server restart during
  dev permanently strands open tabs in simulation until refresh. A reconnect-with-backoff
  loop is a cheap, high-polish fix.
- *Why polling and not WebSockets/SSE:* the server cache is 30s anyway (free-tier quota), so
  push would deliver the same staleness with far more infrastructure (connection management,
  reconnects, a Finnhub websocket consumer). Polling is *correct* for this data-freshness
  budget, not a shortcut. When the product needs sub-second ticks, revisit (ADR-9).

#### `applyQuotes()` (lines 144–164)

Merges a quote map into the instruments: updates price/open/chg/high/low, computes
`lastStep` (per-poll % move that drives the green/red flash), appends to `history` only when
the price actually changed, bounds history to 120 points, bumps `seq`. Returns whether *any*
symbol matched — which the connect path uses to distinguish "backend up but empty" from live.

#### `marketStatus()` (lines 94–101)

NYSE session from UTC minutes (13:30–20:00 UTC = 810–1200 min → OPEN).
- *Two real bugs a senior would catch:* **(1) DST** — NYSE opens 13:30 UTC in summer (EDT)
  and 14:30 UTC in winter (EST); this hardcodes summer. **(2) Holidays** — July 4th shows
  "NYSE OPEN." Fix: compute in `America/New_York` via `Intl.DateTimeFormat` (zero deps) and
  optionally a holiday list; or derive open/closed from quote timestamps moving. Cosmetic, but
  it's a *finance app confidently displaying wrong market status* — exactly the kind of detail
  reviewers notice.

#### `useRangeSeries()` (lines 278–318)

Range-chart data: `1D` returns the live in-memory history; other ranges fetch real candles
once, memoized in a **module-level `Map` cache** keyed `symbol:range:source`, falling back to
seeded synthetic in simulated mode.
- **Why a module Map, not state:** the cache should outlive component unmounts (switching
  tickers back and forth shouldn't re-fetch). *Debt:* it's unbounded and never invalidated —
  a 1Y series fetched at 10am is served at 4pm. Fine for a session-scoped dashboard, but this
  is exactly the wheel React Query has already invented (staleTime, gc, dedupe) — ADR-12.

#### Seeded RNG helpers (lines 5–25)

`hashStr` (FNV-style string hash) + `mulberry32` (tiny seeded PRNG) + `dayKey()`.
- **Why not `Math.random()`:** same determinism argument as the backend — the offline
  simulation and assistant phrasing are stable within a day (`dayKey` in the seed), so the UI
  doesn't visibly re-roll. Standard, well-known tiny PRNG choices (mulberry32 is *the*
  goto 32-bit JS PRNG).

### 5.4 `getinvestage/src/assistant.js` — the rule-based assistant (218 lines)

**What it is:** a pure function `generateResponse(text, {tickers, selected}) → string`.
No network, no LLM. Intent routing by regex/keyword:

1. **Advice questions** (`should i|buy|sell|invest|...`) → **refusal** + neutral factual
   setup + "Educational, not advice." — the compliance-aware path is checked *first*, so
   "should I buy NVDA and AMD?" refuses rather than compares.
2. **Two+ ticker mentions** → comparison (tape strength, P/E-based valuation line).
3. **One mention** → `describeOne`: price, direction, a per-sector "driver" phrase, day
   range/volume, momentum over the last 10 prints.
4. **Watchlist keywords** → breadth summary (leader, laggard, risk-on/mixed/cautious tone
   by green count).
5. **"why" with no ticker** → describes selected or biggest mover.
6. **Fallback** → suggests the three canonical prompts.

- **`driver()` and the `POOLS` phrase banks:** per-sector up/down narrative phrases chosen by
  `hashStr(symbol + dayKey()) % len` — deterministic per symbol per day, so the assistant
  doesn't contradict itself across questions within a session. The phrases are *plausible
  genre-appropriate narratives*, *not real news* — which is the main honesty gap: unlike
  charts (`source: synthetic`), these explanations carry no "this is a canned narrative"
  label beyond the global footer. The roadmap's RAG slice exists precisely to replace this
  with grounded, cited claims.
- **Why rule-based first, LLM later (ADR-7):** zero cost, zero latency, zero API keys, no
  prompt-injection surface, and it forces the *grounding contract* (answers derived from live
  state) to be designed before an LLM is bolted on. The interface (`text + market ctx →
  answer`) is exactly the future LLM endpoint's contract.
- **`findMentions` builds `new RegExp` from instrument names** — safe today because the
  universe is hardcoded, but a regex-injection footgun the moment users can add custom
  tickers (a name containing `(` would throw). Escape or use `includes()` when the watchlist
  becomes user-editable.

### 5.5 Components

| Component | Lines | What it does | Notable engineering |
|---|---|---|---|
| `Dashboard.jsx` | 169 | 3-column grid shell (watchlist / chart / assistant), header with indices, live badge, NYSE status, clock | The `LIVE / SIMULATED / CONNECTING` badge with a `title` tooltip is the UI end of the honesty contract. Fixed `grid-template-columns` = **no responsive/mobile layout** (accepted phase-1 cut) |
| `Watchlist.jsx` | 153 | Header + scrollable rows: ticker, price, chg%, sparkline | `PriceCell` flashes green/red via the **Web Animations API** (`el.animate`) keyed on `inst.seq` — animation without state churn or CSS-class juggling; `role="button"` + `tabIndex` + Enter handling = keyboard a11y on rows |
| `PriceChart.jsx` | 320 | The big SVG chart: line+area, grid, right-edge price labels, live head dot, range buttons, stats strip | Self-drawing line via `stroke-dasharray` offset animation, run **only on symbol/range change** (`drawKeyRef`), not on live ticks; `vectorEffect="non-scaling-stroke"` keeps 1.6px lines crisp under `preserveAspectRatio="none"` stretch; price labels are HTML overlays so text doesn't distort; `prefers-reduced-motion` respected. *Warts:* x-axis labels are **approximations computed from today's date, not from candle timestamps** (1M labels can drift days from reality; 1D assumes a full session) — honest-data polish item; the `useMemo` dep `series[series.length-1]` is a hand-rolled "last value changed" signal (works, but subtle) |
| `Assistant.jsx` | 288 | Chat panel: messages, typing dots, char-by-char streaming with caret, contextual suggestion chips, input row | Streaming is **purely cosmetic** (the full answer exists before "streaming" starts) — theatrical UX honesty-adjacent but standard; `busyRef` prevents double-sends; `marketRef`/`selectedRef` keep the delayed answer reading *current* market state (avoids stale-closure bugs — subtle and correct); reduced-motion skips the theater; StrictMode-safe auto-ask via effect cleanup |
| `TickerTape.jsx` | 60 | Infinite marquee: list rendered twice, CSS `translateX(0 → -50%)` loop | Duplicate list is the standard CSS marquee trick; second copy `aria-hidden` so screen readers don't hear everything twice |
| `Sparkline.jsx` | 28 | 64×20 SVG polyline of last 36 points, colored by direction | Dead simple, zero deps — the right size of solution |
| `Landing.jsx` | ~200 | Hero, features, CTA into dashboard, masked rise-in animations | Marketing shell; `maskLine` overflow-hidden rise-in is a nice CSS-only reveal |
| `AmbientCanvas.jsx` | — | Canvas background animation on landing | Decorative; gated behind `ambientMotion` prop |

**Styling decision (repeated everywhere):** inline style objects + shared `microLabel` token +
CSS custom properties for the palette. Consequence: hover states are `onMouseEnter/Leave`
JS handlers (see Watchlist rows, chips, back button) because inline styles can't express
`:hover`. This is the single clearest signal the styling approach is at its limit — Tailwind
or CSS Modules removes ~40 lines of hover JS. Accepted debt, cheap to fix.

---

## 6. Architecture Decision Records

Format: **Decision → Context → Alternatives → Why → Revisit when.**

### ADR-1: Backend proxy owns all API keys (browser never talks to providers)
- **Context:** Finnhub requires a key; the frontend needs its data.
- **Alternatives:** (a) key in the React bundle (many tutorials do this), (b) serverless
  function per call, (c) backend proxy. ✅ (c)
- **Why:** a key shipped to the browser is public within minutes (bundle inspection), and the
  quota is then burnable by anyone. The proxy also enables the *shared server-side cache* —
  100 users cost the same Finnhub quota as one. Security and economics align.
- **Revisit:** never. This one's permanent.

### ADR-2: Finnhub primary, not yfinance
- **Context:** eng-review 2026-07-02. yfinance is the default hobbyist choice.
- **Why:** yfinance scrapes Yahoo with no SLA, and **cloud-provider IPs get blocked** — the
  deployed demo (the single most important artifact for a hired-first project) would break
  precisely when a recruiter opens it. Finnhub is an actual API with a key, ToS, and a
  60/min free tier that a cache makes sufficient.
- **Revisit:** if the project ever needs data Finnhub free tier lacks (fundamentals history,
  options) — then evaluate paid tiers or Polygon.

### ADR-3: Candles from Yahoo's raw chart endpoint (unofficial API)
- **Context:** Finnhub free tier has no `/stock/candle` (premium). Charts need real history —
  synthetic-only charts would gut the demo.
- **Alternatives:** (a) pay Finnhub, (b) yfinance dependency, (c) raw Yahoo HTTP,
  (d) synthetic-only. ✅ (c) with (d) as fallback.
- **Why:** (c) is exactly what yfinance does under the hood, minus the dependency weight and
  with our own timeout/error semantics. The risk (Yahoo changes/blocks — see ADR-2's cloud-IP
  concern, which applies here too!) is mitigated by the fallback ladder: if Yahoo dies, charts
  degrade to stale-then-synthetic and stay labeled.
- **Honest tension a senior should note:** ADR-2 rejected yfinance partly because Yahoo blocks
  cloud IPs, yet candles depend on the same Yahoo endpoints. The mitigation is the ladder +
  caching (candles cached 5min and served stale indefinitely), but the deployed demo's charts
  are still exposed to the exact risk that disqualified yfinance for quotes. **Post-deploy,
  verify Yahoo actually answers from Render's IPs; if not, promote synthetic-anchored candles
  to an explicitly-labeled first-class mode, or budget for a paid candle source.**
- **Revisit:** first Yahoo 403/999 from the production host.

### ADR-4: Serve-stale-on-error as a core policy (cache never deletes)
- **Context:** free-tier upstreams *will* rate-limit and fail; the demo must not.
- **Alternatives:** conventional TTL cache (expiry = deletion) + error states in UI; retries
  with backoff; circuit breaker.
- **Why:** for read-only market data, *slightly old truth beats an error banner* in every user
  story this product has. Implemented in the cheapest correct place: the cache reports
  staleness instead of deleting (`(value, is_fresh)`), and one wrapper (`_cached`) applies
  the policy uniformly.
- **Revisit:** add max-stale bounds when data age can mislead (e.g., showing a 3-day-old price
  as "live" during an outage would violate the honesty contract — currently unbounded).

### ADR-5: SQLite for the cache (not Redis, not in-memory)
- **Why:** persistence is *required* by ADR-4 (a restart must not wipe fallback data); a
  second deployed service (Redis) is unjustifiable for one process; stdlib `sqlite3` = zero
  deps. See §4.3 for the event-loop-blocking caveat.
- **Revisit:** at multi-instance deployment (each instance would have its own cache —
  inconsistent staleness, N× upstream quota burn) or when cache calls appear in profiles.
  Redis is the standard answer then.

### ADR-6: Demo mode — boot with zero configuration
- **Why:** for a portfolio repo, the funnel is *clone → run → wow*. Any mandatory key setup
  loses some fraction of evaluators. Everything synthetic is labeled (warning log, `demoMode`
  in `/api/health`, deterministic data).
- **Revisit:** not applicable to a real product with real users (fail fast instead).

### ADR-7: Rule-based assistant before LLM
- **Why:** (a) proves the *grounding architecture* (answers as pure functions of live state)
  before adding model risk; (b) zero cost/latency/keys in phase 1; (c) the refusal path
  (buy/sell questions) is a compliance design that must survive into the LLM version;
  (d) the LLM slice (roadmap #2) swaps the implementation behind the same contract.
- **The known gap:** sector "driver" phrases are canned narratives, not news — acceptable only
  because phase-1 framing is explicit, and RAG (roadmap #3) replaces them with cited claims.
- **Revisit:** Slice 2 (LLM endpoint with tool-calling + per-IP rate limit + cost cap — the
  eng-review already flagged both preconditions).

### ADR-8: FastAPI serves the built SPA (single-server production)
- **Context:** original plan was Vercel + Render split.
- **Why the change:** one deploy, one origin (CORS becomes inert), one URL to put on a resume.
  Costs: FastAPI serving static files is slower than a CDN and couples frontend/backend
  deploy cadence. At portfolio scale, simplicity wins.
- **Revisit:** at real traffic — put a CDN in front or split again (the code supports both:
  CORS config already exists, dist detection already optional).

### ADR-9: 20-second polling, no WebSockets
- **Why:** server cache TTL is 30s (quota-driven), so push infrastructure would deliver
  identical staleness at much higher complexity (connection lifecycle, Finnhub WS consumer,
  fan-out). Polling matches the actual freshness budget. The batch endpoint keeps it to 1
  request per poll.
- **Revisit:** if the freshness budget changes (paid tier, real-time requirement) —
  then SSE first (simpler than WS for one-way data), WS only if bidirectional.

### ADR-10: Mutable ref + version counter for market state (frontend)
- See §5.3. Pragmatic performance escape hatch, contained in one hook, `seq` as change signal.
- **Revisit:** if concurrent features/multiple writers arrive, or when adopting React Query.

### ADR-11 (retro): Plain JavaScript, no TypeScript — *the decision a senior would reverse*
- **What happened:** JS chosen for speed of iteration.
- **Why it's wrong for this project's goal:** a *hired-first* project forgoes the single most
  demanded frontend skill; and this codebase specifically trades in shaped data (quote/candle
  schemas crossing the API boundary) where TS pays off immediately. The backend half of the
  contract is likewise untyped-at-the-edge (no Pydantic response models — FastAPI docs
  currently show empty schemas).
- **Fix path (incremental, ~1–2 days):** `allowJs` tsconfig → rename files gradually → shared
  API types (or generate from OpenAPI once response models exist).

### ADR-12 (forward): Adopt React Query for the fetch layer
- The hand-rolled polling/caching/dedupe in `useMarket`/`useRangeSeries` re-implements a
  solved problem (staleTime ≈ TTL, refetchInterval ≈ polling, per-key caching ≈ rangeCache).
  Keeping the custom engine is fine for learning; migrating is the industry-standard move and
  removes the unbounded module-Map cache and the no-reconnect gap in one sweep.

### ADR-13 (forward): URL state / router
- Add react-router (or just `history.pushState`) the moment shareable ticker/range links
  matter. Cheap now, painful later if screens multiply.

---

## 7. Security Audit — Current State

Ranked by severity. "Fix now" = before any public deploy.

### 🔴 S-1. Live API key in `.env.example` — **fix now**
`backend/.env.example` contains what appears to be a *real* Finnhub key, not a placeholder.
The file is currently untracked (`.gitignore`'s `.env.*` catches it — itself a mistake, see
S-2), so it hasn't leaked into git history — **verify with `git log --all -- backend/.env.example`,
then rotate the key at finnhub.io regardless** (it has been on disk and possibly in editor
sync/backups). Replace with `FINNHUB_API_KEY=your_key_here`.
*Rule: example files never contain real credentials, because their entire purpose is to be committed.*

### 🟠 S-2. `.gitignore` blocks `.env.example` from ever being committed
`.env.*` matches `.env.example`. New contributors won't get the template. Fix:
```gitignore
.env
.env.*
!.env.example
```

### 🟠 S-3. No rate limiting on the API
Any client can hammer `/api/*`; a single hostile loop burns the shared 60/min Finnhub quota
(cache absorbs repeats, but unique-symbol spam — `/api/quote/AAA1..AAA999` — bypasses it and
also grows the cache DB forever). **Fix:** `slowapi` (or a tiny middleware) with per-IP
budgets, e.g. 60 req/min; make it strict *before* the future LLM endpoint (each call there
costs real money — the eng-review already flagged this as a Slice-2 precondition).

### 🟠 S-4. No symbol input validation
`{symbol}` accepts arbitrary strings that flow into upstream request URLs and cache keys.
Not injectable (httpx encodes; SQL is parameterized — verified), but it enables quota burn +
cache pollution. **Fix:** `^[A-Z0-9.\-^]{1,12}$` via a FastAPI path-param pattern; reject
early with 422. Same for `range` (already done) and search `q` (length-limited already).

### 🟡 S-5. No security headers / HTTPS assumptions
The SPA is served without `X-Content-Type-Options`, `Referrer-Policy`,
`Content-Security-Policy`, or HSTS (HTTPS termination is delegated to the host — fine on
Render, but headers are still the app's job). **Fix:** small middleware adding
`nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP; note the CSP must
allow the inline-style-heavy React output (`style-src 'unsafe-inline'`) until styling moves
to classes — a concrete, citable reason inline styles have a *security* cost, not just a
maintenance one.

### 🟡 S-6. Upstream responses trusted structurally
Yahoo/Finnhub JSON is parsed defensively for *shape* (good) but values aren't sanity-checked
(a negative price or absurd timestamp would flow to the UI). XSS risk is low — React escapes
by default and no `dangerouslySetInnerHTML` exists (verified) — but the news `url` field is
rendered as links in future UI plans: **when news links land in the UI, enforce
`https?://` scheme on upstream URLs** (a `javascript:` URL from a compromised upstream is
the classic miss).

### 🟡 S-7. Error-detail hygiene
`HTTPException` messages echo the (upper-cased) symbol back — harmless today, but the habit
to build: never reflect raw input; here it's bounded and encoded by FastAPI, so acceptable.
Logs include upstream exception text — fine; ensure no key ends up in logs (`_finnhub` puts
the token in `params`, and httpx does log full URLs at DEBUG level — keep prod log level at
INFO, or scrub).

### 🟢 What's already right
- Key server-side only (ADR-1), never in the bundle. ✅
- CORS origin allowlist + GET-only. ✅
- SQL fully parameterized. ✅
- Input length caps on search and batch symbols; batch fan-out capped at 30. ✅
- React default escaping; no `dangerouslySetInnerHTML`; no `eval`. ✅
- `.env` untracked; no secrets in git history (verified for tracked files). ✅
- Read-only API, no user data, no auth surface — the attack surface is genuinely small
  *today*. Auth/rate-limit/abuse work becomes mandatory the day the LLM endpoint (costs
  money per call) or user accounts (PII) land.

---

## 8. Scalability Analysis

Where the current design breaks, in the order it would break:

| # | Bottleneck | Breaks at (order of magnitude) | Fix | Effort |
|---|---|---|---|---|
| 1 | **Finnhub 60 calls/min** | ~30+ *unique* uncached symbols/min (16-symbol default watchlist is safely under; user-custom watchlists blow past it) | Cache is already the mitigation; add request coalescing + negative caching (§4.2); paid tier ($) is the real unlock | S |
| 2 | **Sync SQLite in the event loop** | High-concurrency bursts (every cache op blocks the loop; p99 latency degrades first) | `aiosqlite` → or Redis at multi-instance | S–M |
| 3 | **Single process, no workers** | CPU-bound JSON serialization at hundreds of RPS | `gunicorn -k uvicorn.workers.UvicornWorker -w N` — but note: N workers = N separate SQLite caches unless cache moves to Redis first (fix #2/#5 before this) | S |
| 4 | **Static files from FastAPI** | Thousands of users pulling the bundle | CDN in front (Cloudflare free tier) or re-split to Vercel | S |
| 5 | **Per-instance cache** | First horizontal scale-out (inconsistent staleness, N× quota) | Redis as shared cache — this is the *architectural* scale gate; everything above is tuning | M |
| 6 | **Client polling fan-in** | ~10k concurrent dashboards → 500 req/s of batch quotes | Cheap because responses are cache hits; then SSE fan-out from one upstream poller (invert the data flow: server polls providers once, pushes to all clients) | M–L |
| 7 | **Cache table growth** | Millions of unique keys (mostly from unvalidated symbols — see S-4) | Validation (S-4) + nightly `DELETE WHERE expires_at < now - 7d` | S |

**The honest summary:** for the intended load (a recruiter, a demo, a class of users) the
current architecture has *zero* scaling problems — the shared cache means user count barely
matters; only *symbol diversity* does. The first real scale event is user-custom watchlists
(#1) and the first architectural one is a second instance (#5). A senior would not build any
of the fixes today; they would (and this document does) write down the order in which they'll
be needed.

---

## 9. The Senior-Engineer Roadmap to Production

Sequenced. Each phase is shippable; don't start N+1 before N.

### Phase 0 — Hygiene (half a day) 🔴
1. **Rotate the Finnhub key; placeholder in `.env.example`; un-ignore `.env.example`** (S-1, S-2).
2. **Symbol validation** on all `{symbol}` routes (S-4).
3. Remove `backend/cache.db` from the repo working tree if present in history (`*.db` is
   ignored, but verify: `git ls-files | grep db`).
4. `README`: add a SECURITY note (what's proxied, what's stored — nothing personal).

### Phase 1 — Tests + CI (1–2 days) — *the single highest-value gap*
Nothing here is tested; for a hired-first project, tests are as much a showcase as features.
1. **Backend unit tests (pytest + `httpx.MockTransport`):** the degradation ladder is
   *perfect* test material — fresh-hit / miss-fetch / stale-on-error / SymbolNotFound-vs-
   Unavailable / synthetic-anchored candle fallback / batch partial failure. ~15 tests,
   massive signal.
2. **Cache tests:** freshness boundary, stale readability, thread-safety smoke.
3. **API tests (`TestClient`):** status-code mapping (404/422/503), CORS, batch dedup+cap.
4. **Frontend:** at minimum `assistant.js` (pure function — trivially testable: refusal
   routing, comparisons, mention parsing) and `marketStatus` (write the failing DST test
   first, then fix it). Vitest, co-located.
5. **GitHub Actions:** lint (ruff + eslint) → typecheck → test → build on every push.
   A green badge on the README is hiring-signal-per-hour maximizing.

### Phase 2 — Contracts + types (1–2 days)
1. **Pydantic response models** for every endpoint (Quote, Candle, CandleSeries, Profile,
   NewsItem, SearchResult) — validates *outbound* data, makes `/docs` real, and generates
   the OpenAPI schema that…
2. **…generates TypeScript types** for the frontend (`openapi-typescript`), then migrate
   frontend to TS incrementally (ADR-11).
3. **Structured logging** (one JSON line per request: path, symbol, cache hit/miss, upstream,
   latency) — this is also the cheapest observability you'll ever buy.

### Phase 3 — Deploy (the original Slice-0 goal, 1 day)
1. Render (or Fly.io) single service: build SPA in CI, uvicorn behind their TLS. Key as env
   var. `/api/health` as the health check.
2. **Immediately validate ADR-3's risk:** do Yahoo candles work from the datacenter IP? If
   not, execute the ADR-3 contingency *before* sharing the URL.
3. Security headers middleware (S-5) + rate limiting (S-3) go in with this deploy.
4. Uptime check (UptimeRobot free) against `/api/health`.

### Phase 4 — Production polish (2–3 days)
1. Fix `marketStatus` DST/holidays (America/New_York via `Intl`).
2. Frontend reconnect-with-backoff out of `simulated` mode.
3. React Query migration (ADR-12) — deletes ~100 lines of hand-rolled fetch machinery.
4. Real profile data (mcap/PE) wired from `/api/profile`; x-axis labels from real candle
   timestamps.
5. Max-stale bound + "as of HH:MM" staleness display (closes the ADR-4 honesty gap).
6. Responsive layout pass (the fixed 3-column grid is desktop-only).
7. Request coalescing + negative caching in `_cached`.

### Phase 5 — The differentiator slices (per the original plan)
1. **LLM assistant endpoint** — tool-calling against `MarketService` (the clean service
   layer now pays off; the tools are `get_quote`/`get_candles`/`search` almost verbatim).
   *Preconditions already identified in eng-review: per-IP rate limit + hard cost cap.*
   Keep `assistant.js` as the offline/failure fallback — the degradation ladder philosophy,
   applied to AI.
2. **RAG over Finnhub news + SEC EDGAR** with citations — replaces the canned driver
   phrases with grounded claims (closes ADR-7's honesty gap).
3. **Eval set + results in the README** — the closing argument of the hired-first thesis:
   measured AI quality, not vibes.

---

## Appendix A — File Inventory

| Path | Lines | Role |
|---|---|---|
| `backend/main.py` | 162 | FastAPI app: routes, CORS, lifespan, static serving |
| `backend/services/market.py` | 319 | Provider clients, normalization, fallback ladder |
| `backend/services/cache.py` | 44 | SQLite TTL cache, stale-readable |
| `backend/services/demo_data.py` | 172 | Deterministic synthetic quotes/candles/news |
| `backend/requirements.txt` | 4 | Pinned deps: fastapi, uvicorn, httpx, python-dotenv |
| `getinvestage/src/main.jsx` | 10 | React entry, StrictMode, tweakable props |
| `getinvestage/src/App.jsx` | 69 | Screen state machine + wipe transition |
| `getinvestage/src/useMarket.js` | 334 | Market engine: polling, simulation fallback, range series |
| `getinvestage/src/assistant.js` | 218 | Rule-based grounded assistant (pure function) |
| `getinvestage/src/components/Dashboard.jsx` | 169 | 3-column dashboard shell + status header |
| `getinvestage/src/components/Watchlist.jsx` | 153 | Ticker rows + flash-on-tick price cells |
| `getinvestage/src/components/PriceChart.jsx` | 320 | Self-drawing SVG chart + stats strip |
| `getinvestage/src/components/Assistant.jsx` | 288 | Chat UI with cosmetic streaming |
| `getinvestage/src/components/TickerTape.jsx` | 60 | CSS marquee tape |
| `getinvestage/src/components/Sparkline.jsx` | 28 | Mini trend SVG |
| `getinvestage/src/components/Landing.jsx` | ~200 | Marketing landing page |
| `getinvestage/src/components/AmbientCanvas.jsx` | — | Decorative canvas animation |
| `getinvestage/vite.config.js` | 13 | Dev server + `/api` proxy |

## Appendix B — Key Vocabulary (for interviews)

- **Anti-corruption layer** — the normalization in `market.py` that shields the app from
  provider schemas.
- **Serve-stale-on-error / stale-while-revalidate family** — ADR-4; also what
  `Cache-Control: stale-if-error` does in HTTP.
- **Graceful degradation ladder** — the 4-tier fallback with honest labeling.
- **Criticality-tiered error handling** — news returns `[]`, quotes return 503.
- **Partial failure tolerance** — batch endpoint nulls, `Promise.allSettled`.
- **Request coalescing / single-flight** — the named gap in `_cached`.
- **Backend-for-frontend (BFF)** — what this backend actually is.
