"""RAG Grounding Experiment: Does news context reduce LLM hallucination?

Controlled comparison:
  Condition A (Grounded)   — scored data + retrieved news → Gemini
  Condition B (Ungrounded) — scored data + empty news     → Gemini

The ONLY variable that changes is the presence of news in the prompt.
Same stocks, same scores, same system instruction, same model, same temperature.

Usage:
    cd backend
    .venv/bin/python -m experiments.grounding_experiment
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend/ is on the import path so services/ and core/ resolve.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from google import genai  # noqa: E402

from core.config import settings  # noqa: E402
from services.cache import TTLCache  # noqa: E402
from services.market import MarketService  # noqa: E402
from services.scoring import score_candidates  # noqa: E402
from services.context import build_context  # noqa: E402
from services.recommend import (  # noqa: E402
    SYSTEM_INSTRUCTION,
    RANKING_SCHEMA,
    _build_user_prompt,
    _hallucination_check,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("experiment")

RESULTS_DIR = Path(__file__).resolve().parent / "results"

# --- Pre-selected stock sample (chosen before any results are seen) ----------
# Mix of sectors and volatility profiles:
#   Steady/large-cap: AAPL (tech), MSFT (tech), GOOGL (media/tech), JPM (fin)
#   Volatile/growth:  NVDA (chips), TSLA (EV), AMZN (tech/retail), META (media)
STOCKS = ["AAPL", "NVDA", "MSFT", "TSLA", "JPM", "GOOGL", "AMZN", "META"]

# Fixed profile for both conditions.
PROFILE = {"riskTolerance": "moderate", "horizon": "medium"}

# Delay between Gemini calls to respect rate limits.
CALL_DELAY_S = 3


async def call_gemini(user_prompt: str) -> dict:
    """Call Gemini with the recommendation prompt and return parsed rankings."""
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=user_prompt,
        config=genai.types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=RANKING_SCHEMA,
            temperature=0.3,
        ),
    )
    return json.loads(response.text)


async def run_experiment():
    if not settings.gemini_api_key:
        logger.error("GEMINI_API_KEY not set in .env — cannot run experiment.")
        return

    logger.info("=" * 60)
    logger.info("RAG GROUNDING EXPERIMENT")
    logger.info("Stocks: %s", ", ".join(STOCKS))
    logger.info("Profile: %s", PROFILE)
    logger.info("=" * 60)

    # --- Set up services (no FastAPI needed) ---------------------------------
    cache = TTLCache(BACKEND_DIR / "experiment_cache.db")
    market = MarketService(settings.finnhub_api_key or None, cache)

    try:
        # === STEP 1: Score all candidates ====================================
        logger.info("\n[Step 1] Scoring candidates...")
        scored = await score_candidates(STOCKS, market)
        scored_symbols = [s["symbol"] for s in scored]
        logger.info("Scored %d of %d stocks: %s",
                     len(scored), len(STOCKS), scored_symbols)

        # === STEP 2: Retrieve news context ===================================
        logger.info("\n[Step 2] Retrieving news context...")
        news_map = await build_context(scored_symbols, market)
        for sym, articles in news_map.items():
            logger.info("  %s: %d news articles", sym, len(articles))

        # === STEP 3: Freeze ground truth =====================================
        ground_truth = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "profile": PROFILE,
            "stocks": STOCKS,
            "scored": scored,
            "news_map": news_map,
        }

        gt_path = RESULTS_DIR / "ground_truth.json"
        gt_path.write_text(json.dumps(ground_truth, indent=2, default=str))
        logger.info("\n[Step 3] Ground truth saved → %s", gt_path)

        # === STEP 4: Build prompts ===========================================
        prompt_grounded = _build_user_prompt(scored, news_map, PROFILE)
        prompt_ungrounded = _build_user_prompt(scored, {}, PROFILE)  # empty news

        # Save prompts for inspection.
        (RESULTS_DIR / "prompt_grounded.md").write_text(prompt_grounded)
        (RESULTS_DIR / "prompt_ungrounded.md").write_text(prompt_ungrounded)
        logger.info("[Step 4] Prompts saved (grounded: %d chars, ungrounded: %d chars)",
                     len(prompt_grounded), len(prompt_ungrounded))

        # === STEP 5: Condition A — Grounded ==================================
        logger.info("\n[Step 5] Running Condition A (GROUNDED — with news)...")
        t0 = time.monotonic()
        grounded_result = await call_gemini(prompt_grounded)
        grounded_time = time.monotonic() - t0
        logger.info("  Gemini responded in %.1fs with %d rankings",
                     grounded_time, len(grounded_result.get("rankings", [])))

        # Save raw response.
        condition_a = {
            "condition": "grounded",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "response_time_s": round(grounded_time, 2),
            "llm_response": grounded_result,
            "prompt_char_count": len(prompt_grounded),
        }
        (RESULTS_DIR / "condition_a_grounded.json").write_text(
            json.dumps(condition_a, indent=2)
        )

        await asyncio.sleep(CALL_DELAY_S)

        # === STEP 6: Condition B — Ungrounded ================================
        logger.info("\n[Step 6] Running Condition B (UNGROUNDED — no news)...")
        t0 = time.monotonic()
        ungrounded_result = await call_gemini(prompt_ungrounded)
        ungrounded_time = time.monotonic() - t0
        logger.info("  Gemini responded in %.1fs with %d rankings",
                     ungrounded_time, len(ungrounded_result.get("rankings", [])))

        condition_b = {
            "condition": "ungrounded",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "response_time_s": round(ungrounded_time, 2),
            "llm_response": ungrounded_result,
            "prompt_char_count": len(prompt_ungrounded),
        }
        (RESULTS_DIR / "condition_b_ungrounded.json").write_text(
            json.dumps(condition_b, indent=2)
        )

        # === STEP 7: Run automated hallucination check =======================
        logger.info("\n[Step 7] Running automated hallucination checks...")
        auto_results = []
        for condition_name, result, prompt in [
            ("grounded", grounded_result, prompt_grounded),
            ("ungrounded", ungrounded_result, prompt_ungrounded),
        ]:
            for entry in result.get("rankings", []):
                sym = entry.get("symbol", "?")
                explanation = entry.get("explanation", "")
                flagged = _hallucination_check(explanation, prompt, sym)
                auto_results.append({
                    "condition": condition_name,
                    "symbol": sym,
                    "rank": entry.get("rank"),
                    "confidence": entry.get("confidence"),
                    "explanation": explanation,
                    "auto_flagged": flagged,
                })
                status = "⚠ FLAGGED" if flagged else "✓ clean"
                logger.info("  [%s] %s — %s", condition_name.upper(), sym, status)

        (RESULTS_DIR / "auto_check_results.json").write_text(
            json.dumps(auto_results, indent=2)
        )

        # === Summary =========================================================
        grounded_flags = sum(1 for r in auto_results
                            if r["condition"] == "grounded" and r["auto_flagged"])
        ungrounded_flags = sum(1 for r in auto_results
                              if r["condition"] == "ungrounded" and r["auto_flagged"])
        n_stocks = len(scored)

        logger.info("\n" + "=" * 60)
        logger.info("EXPERIMENT COMPLETE")
        logger.info("=" * 60)
        logger.info("Stocks scored:   %d", n_stocks)
        logger.info("Grounded auto-flags:   %d / %d", grounded_flags, n_stocks)
        logger.info("Ungrounded auto-flags: %d / %d", ungrounded_flags, n_stocks)
        logger.info("Results saved to: %s", RESULTS_DIR)
        logger.info("")
        logger.info("Next step: run `python -m experiments.evaluate` for the")
        logger.info("manual evaluation table, then review each explanation by hand.")

    finally:
        await market.close()
        # Clean up the experiment cache file.
        exp_cache = BACKEND_DIR / "experiment_cache.db"
        if exp_cache.exists():
            exp_cache.unlink()


if __name__ == "__main__":
    asyncio.run(run_experiment())
