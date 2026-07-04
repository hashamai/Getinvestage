"""Market data service: Finnhub client + cache + graceful degradation.

Data policy:
- quote / search / profile / news -> Finnhub free tier, cached, stale-on-error.
- candles -> Finnhub's /stock/candle is premium-only, so real OHLC history
  comes from Yahoo Finance's public chart API (the same source yfinance
  wraps), no key needed. If Yahoo fails, fall back to stale cache, then to
  a synthetic series. Responses carry a `source` field so the UI can label
  non-live data honestly.
- No API key -> demo mode: synthetic quotes/search/news, but candles still
  try Yahoo first (it needs no key).
"""

from __future__ import annotations

import logging
import time

import httpx

from .cache import TTLCache
from . import demo_data

logger = logging.getLogger("market")

FINNHUB_BASE = "https://finnhub.io/api/v1"
YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
# Yahoo rejects requests without a browser-like User-Agent.
YAHOO_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}

# UI range -> Yahoo (range, interval)
YAHOO_RANGES = {
    "1D": ("1d", "5m"),
    "1W": ("5d", "30m"),
    "1M": ("1mo", "1d"),
    "3M": ("3mo", "1d"),
    "1Y": ("1y", "1d"),
    "ALL": ("5y", "1wk"),
}

QUOTE_TTL = 30          # seconds; free tier is 60 calls/min
SEARCH_TTL = 24 * 3600
PROFILE_TTL = 24 * 3600
NEWS_TTL = 15 * 60
CANDLE_TTL = 5 * 60


class SymbolNotFound(Exception):
    pass


class UpstreamUnavailable(Exception):
    pass


class MarketService:
    def __init__(self, api_key: str | None, cache: TTLCache):
        self.api_key = api_key
        self.cache = cache
        self.demo_mode = not api_key
        self._client = httpx.AsyncClient(timeout=8.0)

    async def close(self) -> None:
        await self._client.aclose()

    async def _finnhub(self, path: str, params: dict) -> dict | list:
        resp = await self._client.get(
            f"{FINNHUB_BASE}{path}",
            params={**params, "token": self.api_key},
        )
        if resp.status_code in (429, 500, 502, 503, 504):
            raise UpstreamUnavailable(f"Finnhub {resp.status_code} on {path}")
        resp.raise_for_status()
        return resp.json()

    async def _cached(self, key: str, ttl: int, fetch):
        """Fresh cache hit -> return; miss -> fetch + store; error -> stale."""
        value, fresh = self.cache.get(key)
        if fresh:
            return value
        try:
            result = await fetch()
        except (UpstreamUnavailable, httpx.TransportError) as exc:
            if value is not None:
                logger.warning("Serving stale %s after upstream error: %s", key, exc)
                return value
            raise UpstreamUnavailable(str(exc)) from exc
        self.cache.set(key, result, ttl)
        return result

    # ---- quotes -------------------------------------------------------

    async def _yahoo_quote(self, symbol: str) -> dict:
        """Quote derived from Yahoo chart metadata (keyless fallback)."""
        resp = await self._client.get(
            f"{YAHOO_CHART_BASE}/{symbol}",
            params={"range": "1d", "interval": "5m"},
            headers=YAHOO_HEADERS,
        )
        if resp.status_code != 200:
            raise UpstreamUnavailable(f"Yahoo {resp.status_code} for {symbol}")
        results = resp.json().get("chart", {}).get("result") or []
        if not results:
            raise SymbolNotFound(symbol)
        meta = results[0].get("meta", {})
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        if price is None or prev is None:
            raise UpstreamUnavailable(f"Yahoo quote missing fields for {symbol}")
        change = round(price - prev, 4)
        return {
            "symbol": symbol,
            "current": price,
            "change": change,
            "percentChange": round(change / prev * 100, 2) if prev else 0.0,
            "high": meta.get("regularMarketDayHigh") or price,
            "low": meta.get("regularMarketDayLow") or price,
            "open": prev,
            "prevClose": prev,
            "timestamp": meta.get("regularMarketTime") or int(time.time()),
        }

    async def get_quote(self, symbol: str) -> dict:
        symbol = symbol.upper()
        # Yahoo path: always for keyless mode, and for index symbols (^GSPC,
        # ^IXIC, …) which Finnhub's free tier doesn't quote.
        if self.demo_mode or symbol.startswith("^"):
            async def fetch_yahoo():
                return await self._yahoo_quote(symbol)

            try:
                return await self._cached(f"quote:{symbol}", QUOTE_TTL, fetch_yahoo)
            except (UpstreamUnavailable, SymbolNotFound):
                if self.demo_mode:
                    return demo_data.demo_quote(symbol)
                raise

        async def fetch():
            data = await self._finnhub("/quote", {"symbol": symbol})
            # Finnhub returns all-zero quotes for unknown symbols.
            if not data.get("c") and not data.get("pc"):
                raise SymbolNotFound(symbol)
            return {
                "symbol": symbol,
                "current": data["c"],
                "change": data.get("d") or 0,
                "percentChange": data.get("dp") or 0,
                "high": data.get("h") or data["c"],
                "low": data.get("l") or data["c"],
                "open": data.get("o") or data["c"],
                "prevClose": data.get("pc") or data["c"],
                "timestamp": data.get("t") or int(time.time()),
            }

        return await self._cached(f"quote:{symbol}", QUOTE_TTL, fetch)

    # ---- candles ------------------------------------------------------

    async def _yahoo_candles(self, symbol: str, range_key: str) -> list[dict]:
        yrange, interval = YAHOO_RANGES.get(range_key, YAHOO_RANGES["1M"])
        resp = await self._client.get(
            f"{YAHOO_CHART_BASE}/{symbol}",
            params={"range": yrange, "interval": interval, "events": "history"},
            headers=YAHOO_HEADERS,
        )
        if resp.status_code == 404:
            raise SymbolNotFound(symbol)
        if resp.status_code != 200:
            raise UpstreamUnavailable(f"Yahoo {resp.status_code} for {symbol}")

        payload = resp.json().get("chart", {})
        if payload.get("error"):
            code = payload["error"].get("code", "")
            if code == "Not Found":
                raise SymbolNotFound(symbol)
            raise UpstreamUnavailable(f"Yahoo error: {code}")

        results = payload.get("result") or []
        if not results:
            raise SymbolNotFound(symbol)

        result = results[0]
        timestamps = result.get("timestamp") or []
        ohlcv = (result.get("indicators", {}).get("quote") or [{}])[0]
        candles = []
        for i, ts in enumerate(timestamps):
            o, h = ohlcv.get("open", [])[i], ohlcv.get("high", [])[i]
            l, c = ohlcv.get("low", [])[i], ohlcv.get("close", [])[i]
            v = (ohlcv.get("volume") or [0] * len(timestamps))[i]
            if None in (o, h, l, c):  # Yahoo pads gaps with nulls
                continue
            candles.append({
                "t": ts,
                "o": round(o, 4),
                "h": round(h, 4),
                "l": round(l, 4),
                "c": round(c, 4),
                "v": int(v or 0),
            })
        if not candles:
            raise UpstreamUnavailable(f"Yahoo returned no usable candles for {symbol}")
        return candles

    async def get_candles(self, symbol: str, range_key: str) -> dict:
        symbol = symbol.upper()
        range_key = range_key.upper()
        cache_key = f"candles:{symbol}:{range_key}"
        value, fresh = self.cache.get(cache_key)
        if fresh:
            return value

        # 1) Real history from Yahoo (free, no key).
        try:
            candles = await self._yahoo_candles(symbol, range_key)
            result = {
                "symbol": symbol,
                "range": range_key,
                "source": "yahoo",
                "candles": candles,
            }
            self.cache.set(cache_key, result, CANDLE_TTL)
            return result
        except SymbolNotFound:
            raise
        except (UpstreamUnavailable, httpx.TransportError, KeyError, IndexError, ValueError) as exc:
            logger.warning("Yahoo candles failed for %s (%s): %s", symbol, range_key, exc)

        # 2) Stale cache beats synthetic.
        if value is not None:
            return value

        # 3) Last resort: synthetic series anchored to the real quote if possible.
        anchor = None
        source = "synthetic"
        if not self.demo_mode:
            try:
                anchor = (await self.get_quote(symbol))["current"]
                source = "synthetic-anchored"
            except (SymbolNotFound, UpstreamUnavailable):
                pass
        result = {
            "symbol": symbol,
            "range": range_key,
            "source": source,
            "candles": demo_data.synthetic_candles(symbol, range_key, anchor),
        }
        self.cache.set(cache_key, result, CANDLE_TTL)
        return result

    # ---- search / profile / news ---------------------------------------

    async def search(self, query: str) -> list[dict]:
        if self.demo_mode:
            return demo_data.demo_search(query)

        async def fetch():
            data = await self._finnhub("/search", {"q": query, "exchange": "US"})
            return [
                {
                    "symbol": item["symbol"],
                    "description": item.get("description", ""),
                    "type": item.get("type", ""),
                }
                for item in data.get("result", [])
                if "." not in item.get("symbol", "")  # skip non-US listings
            ][:10]

        return await self._cached(f"search:{query.lower()}", SEARCH_TTL, fetch)

    async def get_profile(self, symbol: str) -> dict:
        symbol = symbol.upper()
        if self.demo_mode:
            return demo_data.demo_profile(symbol)

        async def fetch():
            data = await self._finnhub("/stock/profile2", {"symbol": symbol})
            if not data:
                raise SymbolNotFound(symbol)
            return {
                "symbol": symbol,
                "name": data.get("name", symbol),
                "exchange": data.get("exchange", ""),
                "industry": data.get("finnhubIndustry", ""),
                "logo": data.get("logo", ""),
                "marketCap": data.get("marketCapitalization", 0),
                "currency": data.get("currency", "USD"),
            }

        return await self._cached(f"profile:{symbol}", PROFILE_TTL, fetch)

    async def get_news(self, symbol: str) -> list[dict]:
        symbol = symbol.upper()
        if self.demo_mode:
            return demo_data.demo_news(symbol)

        async def fetch():
            today = time.strftime("%Y-%m-%d")
            week_ago = time.strftime("%Y-%m-%d", time.localtime(time.time() - 7 * 86400))
            data = await self._finnhub(
                "/company-news", {"symbol": symbol, "from": week_ago, "to": today}
            )
            return [
                {
                    "id": item.get("id", i),
                    "headline": item.get("headline", ""),
                    "source": item.get("source", ""),
                    "datetime": item.get("datetime", 0),
                    "url": item.get("url", ""),
                    "summary": (item.get("summary") or "")[:280],
                }
                for i, item in enumerate(data[:8])
            ]

        return await self._cached(f"news:{symbol}", NEWS_TTL, fetch)
