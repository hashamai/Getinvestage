# Getinvestage — The market, thinking out loud.

A dark, terminal-style AI stock-market assistant for retail investors:
a cinematic landing page and a dense live dashboard — real-time watchlist,
self-drawing price charts, and a plain-English assistant grounded in live
quotes. **Educational tool — not financial advice.**

| Landing | Dashboard |
|---|---|
| ![Landing](docs/screenshots/landing.png) | ![Dashboard](docs/screenshots/dashboard.png) |

## Architecture

```
getinvestage/  React 18 + Vite (JavaScript, no UI libs)
  src/useMarket.js      live market engine: quote polling + candle history,
                        seeded simulation as labeled offline fallback
  src/assistant.js      grounded response logic (compare / explain / summarize
                        / refuse-advice) over the live quote state
  src/components/       Landing, AmbientCanvas, Dashboard, Watchlist,
                        PriceChart (self-drawing SVG), Assistant, TickerTape

backend/       FastAPI — the single production server
  main.py               /api/* routes + serves the built React app from
                        getinvestage/dist
  services/market.py    Finnhub (stock quotes, search, news) + Yahoo Finance
                        chart API (candles, index quotes — the same source
                        yfinance wraps), SQLite TTL cache, stale-on-error
```

Data policy: the browser only ever talks to FastAPI — API keys stay
server-side. Quotes for stocks come from Finnhub (free tier); index quotes
(^GSPC, ^IXIC) and all OHLC history come from Yahoo's chart API. If the
backend is unreachable, the UI falls back to a seeded simulation and labels
itself `SIMULATED — OFFLINE` in the header.

## Run it

**1. Backend** (Python 3.12+) — serves the API *and* the built site:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env        # put your free finnhub.io key in .env
.venv\Scripts\python -m uvicorn main:app --port 8000
```

**2. Frontend build** (Node 20+):

```powershell
cd getinvestage
npm install
npm run build                 # output lands in getinvestage/dist
```

Open **http://localhost:8000** — FastAPI serves the app and the data.

For frontend development with hot reload, run `npm run dev` in
`getinvestage/` (http://localhost:5174, proxies `/api` to the backend).

## API

| Endpoint | Description |
|---|---|
| `GET /api/quotes?symbols=AAPL,^GSPC` | Batch quotes (Finnhub + Yahoo for `^` indices) |
| `GET /api/quote/{symbol}` | Single quote (404 unknown, 503 provider down) |
| `GET /api/candles/{symbol}?range=1D` | OHLCV history (`1D 1W 1M 3M 1Y ALL`), `source`-labeled |
| `GET /api/search?q=` | Symbol search |
| `GET /api/profile/{symbol}` | Company profile |
| `GET /api/news/{symbol}` | Recent company news |
| `GET /api/health` | Health + demo-mode flag |

## The assistant

Pure function over live state — no LLM calls, no network. It compares
tickers (tape strength + P/E read), explains single names via per-sector
driver pools, summarizes watchlist breadth, and **refuses buy/sell
questions**, always ending at "Educational, not advice." Answers stream in
character-by-character; `prefers-reduced-motion` skips all animation.

## Tweakables

Set at the root in `getinvestage/src/main.jsx`:

- `accentColor` — default `#EDEDED`; presets: gold `#E8C268`, blue `#5B8CFF`, green `#4EC58F`
- `marketTempo` — `calm` | `normal` | `volatile` (offline simulation only)
- `ambientMotion` — toggles the landing canvas animation

## Roadmap

1. ~~Live dashboard with grounded assistant (this)~~
2. LLM-backed assistant endpoint (tool-calling against the market service)
3. RAG over news + SEC filings with cited answers
4. Eval set + results in the README
