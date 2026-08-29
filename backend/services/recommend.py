"""LLM-backed recommendation engine: scored data + news → ranked explanations.

Pipeline: score_candidates() → build_context() → generate_recommendation()
The LLM never decides on its own — it only explains data that's handed to it.

Caching: responses are cached by (sorted symbols + profile) hash using the
same TTLCache as the market service.  Cache TTL is configurable via
RECOMMEND_CACHE_TTL (default 1200s = 20 min).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

# pyrefly: ignore [missing-import]
from google import genai

from core.config import settings
from .cache import TTLCache
from .market import MarketService, UpstreamUnavailable
from .scoring import score_candidates
from .context import build_context

logger = logging.getLogger("recommend")

# The disclaimer, matching the existing assistant's exact phrasing.
DISCLAIMER = "Educational insights — not financial advice."

SYSTEM_INSTRUCTION = """\
You are a stock-market research assistant embedded in a terminal-style financial dashboard.

EVIDENCE-ONLY RULE (CRITICAL):
You must ONLY use the data provided below. Do NOT introduce any number, statistic,
price, percentage, P/E ratio, market cap, volume figure, or factual claim that is not
explicitly present in the provided data. If you need to reference a metric, quote it
exactly as given. Do not round differently, do not estimate, do not extrapolate.

If a piece of information is missing from the provided data, say so — do not fill the gap
from memory or training data.

Your role is to RANK the candidates and EXPLAIN why, using only the scored factors,
quote data, and news snippets provided. Your explanations should be concise, specific,
and grounded in the data.

Consider the user's risk tolerance and time horizon when ranking:
- Conservative investors prefer lower volatility, established companies, lower P/E.
- Aggressive investors may prefer higher momentum, higher beta.
- Short horizon: weight intraday momentum and recent news more heavily.
- Long horizon: weight fundamentals (valuation, volatility) more heavily.

Educational insights — not financial advice.
"""

RANKING_SCHEMA = {
    "type": "object",
    "properties": {
        "rankings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "rank": {"type": "integer"},
                    "explanation": {"type": "string"},
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                    },
                },
                "required": ["symbol", "rank", "explanation", "confidence"],
            },
        }
    },
    "required": ["rankings"],
}


def _cache_key(symbols: list[str], profile: dict) -> str:
    """Deterministic cache key from sorted symbols + profile."""
    payload = json.dumps({"symbols": sorted(s.upper() for s in symbols), "profile": profile}, sort_keys=True)
    return f"recommend:{hashlib.sha256(payload.encode()).hexdigest()[:24]}"


def _build_user_prompt(
    scored: list[dict],
    news_map: dict[str, list[dict]],
    profile: dict,
) -> str:
    """Assemble the data payload the LLM will explain."""
    lines = []
    lines.append("## User Profile")
    lines.append(f"- Risk tolerance: {profile.get('riskTolerance', 'moderate')}")
    lines.append(f"- Time horizon: {profile.get('horizon', 'medium')}")
    lines.append("")

    for entry in scored:
        sym = entry["symbol"]
        lines.append(f"## {sym}")
        lines.append(f"Composite score: {entry['score']}/100")
        lines.append("")

        # Quote data
        q = entry.get("quote") or {}
        lines.append("### Quote")
        lines.append(f"- Current price: {q.get('current', 'N/A')}")
        lines.append(f"- Change: {q.get('change', 'N/A')} ({q.get('percentChange', 'N/A')}%)")
        lines.append(f"- Day high: {q.get('high', 'N/A')}")
        lines.append(f"- Day low: {q.get('low', 'N/A')}")
        lines.append(f"- Previous close: {q.get('prevClose', 'N/A')}")
        lines.append("")

        # Scoring factors
        lines.append("### Scoring Factors")
        for fname, fdata in entry.get("factors", {}).items():
            lines.append(f"- {fname}: {fdata['value']}/{fdata['max']} ({fdata['label']})")
        lines.append("")

        # Profile info
        prof = entry.get("profile") or {}
        if prof.get("name"):
            lines.append(f"### Company: {prof['name']}")
            if prof.get("industry"):
                lines.append(f"- Industry: {prof['industry']}")
            lines.append("")

        # News
        news_items = news_map.get(sym, [])
        if news_items:
            lines.append("### Recent News")
            for item in news_items:
                headline = item.get("headline", "")
                source = item.get("source", "")
                summary = item.get("summary", "")
                lines.append(f"- [{source}] {headline}")
                if summary:
                    lines.append(f"  {summary}")
            lines.append("")

    lines.append("---")
    lines.append(
        "Rank ALL candidates above from most to least recommended for this user profile. "
        "For each, provide a concise explanation (2-3 sentences) referencing ONLY the data above. "
        "Assign a confidence level (high/medium/low) based on how much data was available."
    )
    return "\n".join(lines)


def _extract_numbers(text: str) -> set[str]:
    """Extract all numeric tokens from text for hallucination checking."""
    # Match integers and decimals, including negative and percentage forms.
    return set(re.findall(r"-?\d+\.?\d*", text))


def _hallucination_check(
    explanation: str, input_data: str, symbol: str
) -> bool:
    """Check if the explanation contains numbers not present in the input data.

    Returns True if any unfounded number is detected (flagged).
    """
    explanation_numbers = _extract_numbers(explanation)
    input_numbers = _extract_numbers(input_data)
    flagged = False
    for num in explanation_numbers:
        if num not in input_numbers:
            # Small integers (0-10) and ordinals (ranks) are allowed — the model
            # generates rank numbers and sentence structure that naturally includes
            # small numbers like "2-3 sentences".
            try:
                val = float(num)
                if abs(val) <= 10:
                    continue
            except ValueError:
                pass
            logger.warning(
                "Unfounded number in explanation for %s: %s", symbol, num
            )
            flagged = True
    return flagged


async def generate_recommendation(
    symbols: list[str],
    profile: dict,
    market: MarketService,
    cache: TTLCache,
) -> dict[str, Any]:
    """Full pipeline: score → retrieve news → LLM explain → return ranked results.

    Raises UpstreamUnavailable if the LLM provider is unreachable or
    GEMINI_API_KEY is not configured.
    """
    if not settings.gemini_api_key:
        raise UpstreamUnavailable(
            "GEMINI_API_KEY is not configured. "
            "Get an API key at https://aistudio.google.com/apikey and add it to backend/.env"
        )

    # Normalize profile defaults.
    profile = {
        "riskTolerance": profile.get("riskTolerance", "moderate"),
        "horizon": profile.get("horizon", "medium"),
    }

    # Check cache first.
    cache_k = _cache_key(symbols, profile)
    cached_value, is_fresh = await cache.get(cache_k)
    if is_fresh and cached_value is not None:
        logger.info("Serving cached recommendation for %s", cache_k)
        cached_value["cached"] = True
        return cached_value

    # Step 1: Score candidates.
    scored = await score_candidates(symbols, market)
    if not scored:
        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "cached": False,
            "profile": profile,
            "results": [],
            "disclaimer": DISCLAIMER,
        }

    # Step 2: Retrieve news context.
    scored_symbols = [s["symbol"] for s in scored]
    news_map = await build_context(scored_symbols, market)

    # Step 3: Build the prompt and call the LLM.
    user_prompt = _build_user_prompt(scored, news_map, profile)

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=user_prompt,
            config=genai.types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                response_schema=RANKING_SCHEMA,
                temperature=0.3,
            ),
        )

        llm_text = response.text
        llm_data = json.loads(llm_text)
    except json.JSONDecodeError as exc:
        logger.error("LLM returned invalid JSON: %s", exc)
        raise UpstreamUnavailable("LLM returned malformed response") from exc
    except Exception as exc:
        logger.error("Gemini API call failed: %s", exc)
        raise UpstreamUnavailable(f"LLM provider unavailable: {exc}") from exc

    # Step 4: Merge LLM rankings with scored data.
    rankings = llm_data.get("rankings", [])
    ranking_by_symbol = {r["symbol"]: r for r in rankings}

    results = []
    for entry in scored:
        sym = entry["symbol"]
        llm_entry = ranking_by_symbol.get(sym, {})
        explanation = llm_entry.get("explanation", "No explanation available.")
        flagged = _hallucination_check(explanation, user_prompt, sym)

        results.append({
            "symbol": sym,
            "rank": llm_entry.get("rank", 99),
            "score": entry["score"],
            "factors": entry["factors"],
            "explanation": explanation,
            "confidence": llm_entry.get("confidence", "low"),
            "flagged": flagged,
            "news": news_map.get(sym, []),
            "profile": entry.get("profile"),
        })

    # Sort by LLM rank.
    results.sort(key=lambda x: x["rank"])

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "cached": False,
        "profile": profile,
        "results": results,
        "disclaimer": DISCLAIMER,
    }

    # Cache the result.
    await cache.set(cache_k, output, settings.recommend_cache_ttl)
    logger.info("Cached recommendation for %s (TTL %ds)", cache_k, settings.recommend_cache_ttl)

    return output
