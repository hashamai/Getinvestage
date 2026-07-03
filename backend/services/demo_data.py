"""Deterministic synthetic market data.

Used in two situations:
1. Demo mode — no FINNHUB_API_KEY configured, everything is synthetic.
2. Candle fallback — Finnhub's /stock/candle endpoint is premium-only, so
   candle history is synthesized as a seeded random walk anchored to the
   real quote when one is available.
"""

from __future__ import annotations

import hashlib
import math
import random
import time

# Small universe used for demo-mode search/quotes/trends.
DEMO_UNIVERSE: dict[str, dict] = {
    "AAPL": {"name": "Apple Inc", "price": 294.38, "exchange": "NASDAQ", "industry": "Technology"},
    "MSFT": {"name": "Microsoft Corporation", "price": 512.10, "exchange": "NASDAQ", "industry": "Technology"},
    "NVDA": {"name": "NVIDIA Corporation", "price": 171.35, "exchange": "NASDAQ", "industry": "Semiconductors"},
    "TSLA": {"name": "Tesla Inc", "price": 315.65, "exchange": "NASDAQ", "industry": "Automobiles"},
    "AMZN": {"name": "Amazon.com Inc", "price": 223.41, "exchange": "NASDAQ", "industry": "Retail"},
    "META": {"name": "Meta Platforms Inc", "price": 612.91, "exchange": "NASDAQ", "industry": "Media"},
    "GOOGL": {"name": "Alphabet Inc", "price": 179.53, "exchange": "NASDAQ", "industry": "Technology"},
    "JPM": {"name": "JPMorgan Chase & Co", "price": 289.72, "exchange": "NYSE", "industry": "Banking"},
    "V": {"name": "Visa Inc", "price": 355.28, "exchange": "NYSE", "industry": "Financial Services"},
    "MU": {"name": "Micron Technology Inc", "price": 1032.28, "exchange": "NASDAQ", "industry": "Semiconductors"},
    "SPY": {"name": "SPDR S&P 500 ETF Trust", "price": 622.08, "exchange": "NYSE ARCA", "industry": "ETF"},
    "QQQ": {"name": "Invesco QQQ Trust", "price": 553.94, "exchange": "NASDAQ", "industry": "ETF"},
    "DIA": {"name": "SPDR Dow Jones Industrial Average ETF", "price": 443.21, "exchange": "NYSE ARCA", "industry": "ETF"},
}

_DEMO_HEADLINES = [
    "{name} beats quarterly earnings expectations on strong demand",
    "Analysts raise price target for {name} after product announcement",
    "{name} expands into new markets amid sector rotation",
    "What {name}'s latest guidance means for investors",
    "{name} announces buyback program; shares react",
    "Institutional investors increase stakes in {name}",
]


def _seed_for(symbol: str, extra: str = "") -> int:
    digest = hashlib.sha256(f"{symbol}:{extra}".encode()).hexdigest()
    return int(digest[:12], 16)


def _base_price(symbol: str) -> float:
    if symbol in DEMO_UNIVERSE:
        return DEMO_UNIVERSE[symbol]["price"]
    rng = random.Random(_seed_for(symbol, "base"))
    return round(rng.uniform(15, 900), 2)


def demo_quote(symbol: str) -> dict:
    """Synthetic quote that drifts slowly over time so the UI feels live."""
    base = _base_price(symbol)
    # Slow sine drift (~10 min period) + per-symbol phase, +/-1.2% intraday.
    phase = _seed_for(symbol) % 628 / 100.0
    t = time.time()
    drift = math.sin(t / 600 + phase) * 0.012 + math.sin(t / 97 + phase) * 0.003
    price = round(base * (1 + drift), 2)
    prev_close = round(base * (1 - 0.004 - (_seed_for(symbol) % 9) / 1000), 2)
    change = round(price - prev_close, 2)
    return {
        "symbol": symbol,
        "current": price,
        "change": change,
        "percentChange": round(change / prev_close * 100, 2) if prev_close else 0.0,
        "high": round(max(price, base) * 1.006, 2),
        "low": round(min(price, base) * 0.993, 2),
        "open": round(prev_close * 1.002, 2),
        "prevClose": prev_close,
        "timestamp": int(t),
    }


def demo_profile(symbol: str) -> dict:
    info = DEMO_UNIVERSE.get(symbol, {})
    return {
        "symbol": symbol,
        "name": info.get("name", f"{symbol} Corp"),
        "exchange": info.get("exchange", "NASDAQ"),
        "industry": info.get("industry", "Technology"),
        "logo": "",
        "marketCap": round(_base_price(symbol) * random.Random(_seed_for(symbol, "mc")).uniform(0.9, 8.0), 1),
        "currency": "USD",
    }


def demo_search(query: str) -> list[dict]:
    q = query.upper().strip()
    results = [
        {"symbol": sym, "description": info["name"], "type": "Common Stock"}
        for sym, info in DEMO_UNIVERSE.items()
        if q in sym or q in info["name"].upper()
    ]
    if not results and q.isalpha() and len(q) <= 5:
        results = [{"symbol": q, "description": f"{q} Corp", "type": "Common Stock"}]
    return results[:10]


def demo_news(symbol: str) -> list[dict]:
    name = DEMO_UNIVERSE.get(symbol, {}).get("name", symbol)
    rng = random.Random(_seed_for(symbol, "news"))
    now = int(time.time())
    items = []
    for i, template in enumerate(_DEMO_HEADLINES):
        items.append({
            "id": i,
            "headline": template.format(name=name),
            "source": rng.choice(["MarketWatch", "Reuters", "Bloomberg", "CNBC", "Barron's"]),
            "datetime": now - rng.randint(1, 48) * 3600,
            "url": "https://finnhub.io/",
            "summary": f"Sample article about {name} for demo mode. Configure FINNHUB_API_KEY for real news.",
        })
    return sorted(items, key=lambda x: -x["datetime"])


# resolution -> (seconds per bar, bar count)
_RANGE_CONFIG = {
    "1D": (5 * 60, 78),        # 5-minute bars over a trading day
    "1W": (30 * 60, 65),       # 30-minute bars over a week
    "1M": (86400, 22),         # daily bars
    "3M": (86400, 66),
    "1Y": (86400, 252),
    "ALL": (7 * 86400, 260),   # weekly bars over ~5 years
}


def synthetic_candles(symbol: str, range_key: str, anchor_price: float | None = None) -> list[dict]:
    """Seeded random-walk OHLCV series whose last close hits anchor_price.

    Deterministic per (symbol, range) except for the anchor, so charts are
    stable between requests instead of re-rolling on every refresh.
    """
    step_sec, count = _RANGE_CONFIG.get(range_key, _RANGE_CONFIG["1M"])
    rng = random.Random(_seed_for(symbol, range_key))
    end_price = anchor_price if anchor_price else _base_price(symbol)

    # Walk backwards from the anchor so the series ends at today's real price.
    intraday = step_sec < 86400
    vol = 0.004 if intraday else 0.018
    closes = [end_price]
    for _ in range(count - 1):
        prev = closes[-1] / (1 + rng.gauss(0.0004, vol))
        closes.append(max(prev, 0.5))
    closes.reverse()

    now = int(time.time())
    candles = []
    ts = now - step_sec * count
    for i, close in enumerate(closes):
        open_ = closes[i - 1] if i > 0 else close * (1 + rng.gauss(0, vol / 2))
        hi = max(open_, close) * (1 + abs(rng.gauss(0, vol / 2)))
        lo = min(open_, close) * (1 - abs(rng.gauss(0, vol / 2)))
        ts += step_sec
        # Skip weekends for daily bars so the axis looks like a market calendar.
        if not intraday:
            while time.gmtime(ts).tm_wday >= 5:
                ts += 86400
        candles.append({
            "t": ts,
            "o": round(open_, 2),
            "h": round(hi, 2),
            "l": round(lo, 2),
            "c": round(close, 2),
            "v": int(abs(rng.gauss(1, 0.5)) * 4_000_000),
        })
    return candles
