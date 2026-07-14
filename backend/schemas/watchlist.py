"""Watchlist request/response bodies."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class WatchlistAddIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)

    @field_validator("symbol")
    @classmethod
    def normalize(cls, v: str) -> str:
        # Symbols are stored uppercase so AAPL and aapl are the same row and
        # the (user_id, symbol) unique constraint actually holds.
        v = v.strip().upper()
        if not v:
            raise ValueError("symbol cannot be blank")
        return v


class WatchlistItemOut(BaseModel):
    id: int
    symbol: str
    position: int

    model_config = {"from_attributes": True}
