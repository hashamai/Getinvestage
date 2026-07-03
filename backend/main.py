"""Stock Market Dashboard API.

Run locally:  uvicorn main:app --reload --port 8000
Requires FINNHUB_API_KEY env var (or .env file) for real data; without it
the API starts in demo mode and serves clearly-labeled synthetic data.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from services.cache import TTLCache
from services.market import MarketService, SymbolNotFound, UpstreamUnavailable

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

# Indices shown in the top strip. Finnhub free tier has no index quotes,
# so liquid ETF proxies are used and labeled as such in the UI.
INDICES = [
    {"symbol": "SPY", "label": "S&P 500", "badge": "500"},
    {"symbol": "QQQ", "label": "Nasdaq 100", "badge": "100"},
    {"symbol": "DIA", "label": "Dow 30", "badge": "30"},
]

VALID_RANGES = {"1D", "1W", "1M", "3M", "1Y", "ALL"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    if not api_key:
        logger.warning(
            "FINNHUB_API_KEY is not set — starting in DEMO MODE with synthetic data. "
            "Get a free key at https://finnhub.io/register and put it in backend/.env"
        )
    cache = TTLCache(Path(__file__).parent / "cache.db")
    app.state.market = MarketService(api_key or None, cache)
    yield
    await app.state.market.close()


app = FastAPI(title="Stock Market Dashboard API", lifespan=lifespan)

origins = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def market() -> MarketService:
    return app.state.market


@app.get("/api/health")
async def health():
    return {"status": "ok", "demoMode": market().demo_mode}


@app.get("/api/quote/{symbol}")
async def quote(symbol: str):
    try:
        return await market().get_quote(symbol)
    except SymbolNotFound:
        raise HTTPException(404, f"Unknown symbol: {symbol.upper()}")
    except UpstreamUnavailable:
        raise HTTPException(503, "Market data provider unavailable, try again shortly")


@app.get("/api/candles/{symbol}")
async def candles(symbol: str, range: str = Query("1M")):
    if range.upper() not in VALID_RANGES:
        raise HTTPException(422, f"range must be one of {sorted(VALID_RANGES)}")
    try:
        return await market().get_candles(symbol, range)
    except SymbolNotFound:
        raise HTTPException(404, f"Unknown symbol: {symbol.upper()}")
    except UpstreamUnavailable:
        raise HTTPException(503, "Market data provider unavailable, try again shortly")


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1, max_length=30)):
    try:
        return await market().search(q)
    except UpstreamUnavailable:
        raise HTTPException(503, "Market data provider unavailable, try again shortly")


@app.get("/api/profile/{symbol}")
async def profile(symbol: str):
    try:
        return await market().get_profile(symbol)
    except SymbolNotFound:
        raise HTTPException(404, f"Unknown symbol: {symbol.upper()}")
    except UpstreamUnavailable:
        raise HTTPException(503, "Market data provider unavailable, try again shortly")


@app.get("/api/news/{symbol}")
async def news(symbol: str):
    try:
        return await market().get_news(symbol)
    except UpstreamUnavailable:
        return []  # news is non-critical; empty list beats an error banner


@app.get("/api/quotes")
async def quotes(symbols: str = Query(..., min_length=1, max_length=400)):
    """Batch quotes: /api/quotes?symbols=AAPL,MSFT — unknown/failed symbols map to null."""
    syms = list(dict.fromkeys(s.strip().upper() for s in symbols.split(",") if s.strip()))[:30]

    async def one(sym: str):
        try:
            return sym, await market().get_quote(sym)
        except (SymbolNotFound, UpstreamUnavailable):
            return sym, None

    results = await asyncio.gather(*(one(s) for s in syms))
    return dict(results)


@app.get("/api/indices")
async def indices():
    async def one(entry: dict):
        try:
            q = await market().get_quote(entry["symbol"])
            return {**entry, "quote": q}
        except (SymbolNotFound, UpstreamUnavailable):
            return {**entry, "quote": None}

    return await asyncio.gather(*(one(e) for e in INDICES))
