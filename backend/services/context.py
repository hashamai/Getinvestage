"""Context builder: retrieves recent news for each scored candidate.

This is the entire "retrieval" step — no embeddings, no vector DB.
We reuse the existing MarketService.get_news() which calls Finnhub's
/company-news endpoint (already cached with a 15-minute TTL).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .market import MarketService

logger = logging.getLogger("context")

# How many news items to include per candidate in the LLM prompt.
MAX_NEWS_PER_SYMBOL = 3


async def build_context(
    symbols: list[str], market: MarketService
) -> dict[str, list[dict[str, Any]]]:
    """For each symbol, retrieve recent news snippets.

    Returns a dict mapping each symbol to a list of news items (at most
    MAX_NEWS_PER_SYMBOL), each containing 'headline', 'source', and 'summary'.
    If news retrieval fails for a symbol, it maps to an empty list (news is
    non-critical — same philosophy as the existing /api/news endpoint).
    """

    async def _get_news(symbol: str) -> tuple[str, list[dict[str, Any]]]:
        symbol = symbol.upper()
        try:
            raw = await market.get_news(symbol)
        except Exception as exc:
            logger.warning("Context: news retrieval failed for %s: %s", symbol, exc)
            return symbol, []

        # Take the top N most recent items (already sorted by datetime desc
        # in MarketService.get_news).
        items = []
        for article in raw[:MAX_NEWS_PER_SYMBOL]:
            items.append({
                "headline": article.get("headline", ""),
                "source": article.get("source", ""),
                "summary": article.get("summary", ""),
            })
        return symbol, items

    results = await asyncio.gather(*[_get_news(s) for s in symbols])
    return dict(results)
