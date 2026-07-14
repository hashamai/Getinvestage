"""API routers. Add a new feature by writing a router here and including it
below — main.py never needs to change.
"""

from fastapi import APIRouter

from . import auth, market, watchlist

api_router = APIRouter()
api_router.include_router(market.router)
api_router.include_router(auth.router)
api_router.include_router(watchlist.router)

__all__ = ["api_router"]
