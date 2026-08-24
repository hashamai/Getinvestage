"""API routers. Add a new feature by writing a router here and including it
below — main.py never needs to change.
"""

from fastapi import APIRouter

from . import auth, market, recommend, watchlist

api_router = APIRouter()
api_router.include_router(market.router)
api_router.include_router(auth.router)
api_router.include_router(watchlist.router)
api_router.include_router(recommend.router)

__all__ = ["api_router"]

