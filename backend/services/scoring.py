"""Rules-based candidate scoring using existing MarketService data.

Scoring formula (4 factors, 25 pts each, total 0–100):
  - Momentum  (25):  1-month return, higher is better
  - Volatility (25): Std-dev of daily returns from 1M candles, lower is better
  - Valuation  (25): P/E ratio from seed data, lower is better (value tilt)
  - Day Range  (25): Position in today's high–low range, higher is better

Percentile ranking is within the candidate set, so each call is self-contained.
No ML, no training — inspectable weighted sum.
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any

from .market import MarketService, SymbolNotFound, UpstreamUnavailable

logger = logging.getLogger("scoring")

# Weights for each factor.  Easy to adjust — they must sum to 100.
# fmt: off
WEIGHTS = {
    "momentum":  25,
    "volatility": 25,
    "valuation":  25,
    "dayRange":   25,
}
# fmt: on


async def _fetch_symbol_data(
    market: MarketService, symbol: str
) -> dict[str, Any] | None:
    """Gather quote + 1M candles + profile for one symbol.

    Returns None (with a log) if the symbol can't be found at all.
    Individual missing pieces are represented as None inside the dict.
    """
    symbol = symbol.upper()
    result: dict[str, Any] = {"symbol": symbol, "quote": None, "candles": None, "profile": None}

    # Quote is essential — if we can't even get a price, skip the symbol.
    try:
        result["quote"] = await market.get_quote(symbol)
    except SymbolNotFound:
        logger.warning("Scoring: symbol %s not found — excluding", symbol)
        return None
    except UpstreamUnavailable as exc:
        logger.warning("Scoring: upstream down for %s quote — excluding: %s", symbol, exc)
        return None

    # Candles and profile are best-effort: missing candles just mean fewer
    # scoring factors, not exclusion.
    try:
        candle_data = await market.get_candles(symbol, "1M")
        result["candles"] = candle_data.get("candles") or None
    except (SymbolNotFound, UpstreamUnavailable) as exc:
        logger.warning("Scoring: candles unavailable for %s: %s", symbol, exc)

    try:
        result["profile"] = await market.get_profile(symbol)
    except (SymbolNotFound, UpstreamUnavailable) as exc:
        logger.warning("Scoring: profile unavailable for %s: %s", symbol, exc)

    return result


# ---------------------------------------------------------------------------
# Individual factor computations.  Each returns (raw_value, label) or None
# if the data needed isn't available.
# ---------------------------------------------------------------------------

def _momentum(data: dict) -> tuple[float, str] | None:
    """1-month return: (last_close – first_close) / first_close."""
    candles = data.get("candles")
    if not candles or len(candles) < 2:
        return None
    first_c = candles[0]["c"]
    last_c = candles[-1]["c"]
    if first_c <= 0:
        return None
    ret = (last_c - first_c) / first_c
    label = f"{ret:+.1%} over 1M"
    return ret, label


def _volatility(data: dict) -> tuple[float, str] | None:
    """Annualized std-dev of daily log returns over the 1M candles."""
    candles = data.get("candles")
    if not candles or len(candles) < 3:
        return None
    closes = [c["c"] for c in candles if c["c"] and c["c"] > 0]
    if len(closes) < 3:
        return None
    log_rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
    mean = sum(log_rets) / len(log_rets)
    var = sum((r - mean) ** 2 for r in log_rets) / len(log_rets)
    daily_vol = math.sqrt(var)
    label = f"{daily_vol:.1%} daily vol"
    return daily_vol, label


def _valuation(data: dict, pe_lookup: dict[str, float]) -> tuple[float, str] | None:
    """P/E ratio — looked up from the frontend seed table (the only place it
    lives right now).  Lower is better."""
    symbol = data["symbol"]
    pe = pe_lookup.get(symbol)
    if pe is None or pe <= 0:
        return None
    label = f"P/E {pe:.1f}"
    return pe, label


def _day_range(data: dict) -> tuple[float, str] | None:
    """Where the current price sits in today's high–low range (0 = at low, 1 = at high)."""
    q = data.get("quote")
    if not q:
        return None
    hi = q.get("high")
    lo = q.get("low")
    cur = q.get("current")
    if hi is None or lo is None or cur is None:
        return None
    span = hi - lo
    if span <= 0:
        return 0.5, "50% of day range"
    pos = (cur - lo) / span
    pos = max(0.0, min(1.0, pos))
    label = f"{pos:.0%} of day range"
    return pos, label


# ---------------------------------------------------------------------------
# Percentile ranking within a group of raw values.
# ---------------------------------------------------------------------------

def _percentile_ranks(values: list[float | None], invert: bool = False) -> list[float | None]:
    """Rank non-None values into [0, 1] percentiles.

    If *invert* is True, a lower raw value gets a higher percentile
    (used for volatility and valuation where lower is better).
    """
    indexed = [(i, v) for i, v in enumerate(values) if v is not None]
    if not indexed:
        return [None] * len(values)

    # Sort and assign ranks (average-rank for ties).
    indexed.sort(key=lambda x: x[1], reverse=(not invert))
    n = len(indexed)
    ranks: dict[int, float] = {}
    for rank_pos, (orig_idx, _) in enumerate(indexed):
        ranks[orig_idx] = rank_pos / max(n - 1, 1)  # 0..1

    result: list[float | None] = [None] * len(values)
    for i, r in ranks.items():
        result[i] = r
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Known P/E ratios from the frontend seed data (useMarket.js SEED array).
# These are the only P/E values the system has — we don't fabricate others.
_PE_TABLE: dict[str, float] = {
    "AAPL": 35.1,
    "NVDA": 46.4,
    "MSFT": 37.2,
    "AMZN": 42.8,
    "TSLA": 68.3,
    "META": 27.9,
    "GOOGL": 22.6,
    "AMD": 48.9,
    "NFLX": 44.1,
    "JPM": 13.8,
    "COIN": 61.2,
    "PLTR": 190.4,
    "DIS": 24.7,
    "UBER": 31.5,
}


async def score_candidates(
    symbols: list[str], market: MarketService
) -> list[dict[str, Any]]:
    """Score a list of candidate symbols using existing MarketService data.

    Returns a list of scored dicts, sorted by descending score.
    Symbols that can't be quoted are excluded (with a log warning).
    """
    # Fetch data for all symbols concurrently.
    tasks = [_fetch_symbol_data(market, s) for s in symbols]
    raw_results = await asyncio.gather(*tasks)

    # Filter out symbols that failed entirely.
    data_list = [r for r in raw_results if r is not None]
    if not data_list:
        return []

    # Compute raw factor values for each candidate.
    momentum_raw = [_momentum(d) for d in data_list]
    volatility_raw = [_volatility(d) for d in data_list]
    valuation_raw = [_valuation(d, _PE_TABLE) for d in data_list]
    day_range_raw = [_day_range(d) for d in data_list]

    # Percentile rank each factor across the candidate set.
    mom_pct = _percentile_ranks([v[0] if v else None for v in momentum_raw], invert=False)
    vol_pct = _percentile_ranks([v[0] if v else None for v in volatility_raw], invert=True)
    val_pct = _percentile_ranks([v[0] if v else None for v in valuation_raw], invert=True)
    dr_pct  = _percentile_ranks([v[0] if v else None for v in day_range_raw], invert=False)

    scored = []
    for i, data in enumerate(data_list):
        factors: dict[str, dict[str, Any]] = {}
        available_weight = 0

        # Build factor entries.
        factor_defs = [
            ("momentum",   mom_pct[i],  momentum_raw[i]),
            ("volatility", vol_pct[i],  volatility_raw[i]),
            ("valuation",  val_pct[i],  valuation_raw[i]),
            ("dayRange",   dr_pct[i],   day_range_raw[i]),
        ]

        for name, pct, raw_tuple in factor_defs:
            if pct is not None and raw_tuple is not None:
                available_weight += WEIGHTS[name]
                factors[name] = {
                    "value": round(pct * WEIGHTS[name], 1),
                    "max": WEIGHTS[name],
                    "raw": round(raw_tuple[0], 4),
                    "label": raw_tuple[1],
                }

        # Redistribute missing weight proportionally so the total is still 0–100.
        if available_weight > 0 and available_weight < 100:
            scale = 100 / available_weight
            for f in factors.values():
                f["value"] = round(f["value"] * scale, 1)
                f["max"] = round(f["max"] * scale, 1)

        total = sum(f["value"] for f in factors.values())

        scored.append({
            "symbol": data["symbol"],
            "score": round(total, 1),
            "factors": factors,
            "quote": data["quote"],
            "profile": data.get("profile"),
        })

    # Sort by score descending.
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored
