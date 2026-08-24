"""Recommendation route: POST /api/recommend.

Accepts a list of candidate symbols and an optional user profile,
returns a ranked list with per-candidate explanations grounded in
real data from existing services.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, HTTPException

from core.deps import Market
from services.market import UpstreamUnavailable
from services.recommend import generate_recommendation

router = APIRouter(prefix="/api", tags=["recommend"])


class UserProfile(BaseModel):
    riskTolerance: str = Field(default="moderate")
    horizon: str = Field(default="medium")

    @field_validator("riskTolerance")
    @classmethod
    def validate_risk(cls, v: str) -> str:
        allowed = {"conservative", "moderate", "aggressive"}
        v = v.lower().strip()
        if v not in allowed:
            raise ValueError(f"riskTolerance must be one of {sorted(allowed)}")
        return v

    @field_validator("horizon")
    @classmethod
    def validate_horizon(cls, v: str) -> str:
        allowed = {"short", "medium", "long"}
        v = v.lower().strip()
        if v not in allowed:
            raise ValueError(f"horizon must be one of {sorted(allowed)}")
        return v


class RecommendRequest(BaseModel):
    symbols: list[str] = Field(..., min_length=1, max_length=10)
    profile: UserProfile = Field(default_factory=UserProfile)

    @field_validator("symbols")
    @classmethod
    def validate_symbols(cls, v: list[str]) -> list[str]:
        cleaned = []
        for sym in v:
            s = sym.strip().upper()
            if not s or len(s) > 10:
                raise ValueError(f"Invalid symbol: '{sym}' (must be 1–10 chars)")
            cleaned.append(s)
        # Deduplicate while preserving order.
        seen = set()
        return [s for s in cleaned if not (s in seen or seen.add(s))]


UPSTREAM_DOWN = "Recommendation service unavailable, try again shortly"


@router.post("/recommend")
async def recommend(body: RecommendRequest, market: Market):
    """Score, retrieve news, and generate LLM-explained rankings."""
    try:
        result = await generate_recommendation(
            symbols=body.symbols,
            profile=body.profile.model_dump(),
            market=market,
            cache=market.cache,
        )
    except UpstreamUnavailable as exc:
        raise HTTPException(503, str(exc) or UPSTREAM_DOWN) from None

    if not result.get("results"):
        raise HTTPException(
            404,
            "None of the provided symbols could be found. "
            "Check the tickers and try again.",
        ) from None

    return result
