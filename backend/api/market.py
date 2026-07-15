"""Market data routes. Public (no auth) — these are read-only and identical
for every visitor, so the cache in services/ can serve everyone.

Behaviour is unchanged from the original main.py; only the location moved.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query

from core.deps import Market
from services.market import SymbolNotFound, UpstreamUnavailable

router = APIRouter(prefix="/api", tags=["market"])

VALID_RANGES = {"1D", "1W", "1M", "3M", "1Y", "ALL"}

UPSTREAM_DOWN = "Market data provider unavailable, try again shortly"


@router.get("/health")
async def health(market: Market):
    return {"status": "ok", "demoMode": market.demo_mode}


@router.get("/quote/{symbol}")
async def quote(symbol: str, market: Market):
    try:
        return await market.get_quote(symbol)
    except SymbolNotFound:
        raise HTTPException(404, f"Unknown symbol: {symbol.upper()}") from None
    except UpstreamUnavailable:
        raise HTTPException(503, UPSTREAM_DOWN) from None


@router.get("/candles/{symbol}")
async def candles(symbol: str, market: Market, range: str = Query("1M")):
    if range.upper() not in VALID_RANGES:
        raise HTTPException(422, f"range must be one of {sorted(VALID_RANGES)}")
    try:
        return await market.get_candles(symbol, range)
    except SymbolNotFound:
        raise HTTPException(404, f"Unknown symbol: {symbol.upper()}") from None
    except UpstreamUnavailable:
        raise HTTPException(503, UPSTREAM_DOWN) from None


@router.get("/search")
async def search(market: Market, q: str = Query(..., min_length=1, max_length=30)):
    try:
        return await market.search(q)
    except UpstreamUnavailable:
        raise HTTPException(503, UPSTREAM_DOWN) from None


@router.get("/profile/{symbol}")
async def profile(symbol: str, market: Market):
    try:
        return await market.get_profile(symbol)
    except SymbolNotFound:
        raise HTTPException(404, f"Unknown symbol: {symbol.upper()}") from None
    except UpstreamUnavailable:
        raise HTTPException(503, UPSTREAM_DOWN) from None


@router.get("/news/{symbol}")
async def news(symbol: str, market: Market):
    try:
        return await market.get_news(symbol)
    except UpstreamUnavailable:
        return []  # news is non-critical; an empty list beats an error banner


@router.get("/quotes")
async def quotes(market: Market, symbols: str = Query(..., min_length=1, max_length=400)):
    """Batch quotes: /api/quotes?symbols=AAPL,MSFT — unknown/failed symbols map to null."""
    syms = list(dict.fromkeys(s.strip().upper() for s in symbols.split(",") if s.strip()))[:30]

    async def one(sym: str):
        try:
            return sym, await market.get_quote(sym)
        except (SymbolNotFound, UpstreamUnavailable):
            return sym, None

    return dict(await asyncio.gather(*(one(s) for s in syms)))
