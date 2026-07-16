"""Getinvestage API + SPA server.

Run locally:  uvicorn main:app --reload --port 8000

Serves /api/* (market data, auth, watchlist) and, in production, the built
React app from getinvestage/dist. Any non-/api path falls through to
index.html so client-side routes survive a hard refresh.

Without FINNHUB_API_KEY the market API starts in demo mode and serves
clearly-labeled synthetic data. Without SECRET_KEY it refuses to start in
production (see the lifespan guard below).
"""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Windows defaults to the Proactor event loop, which async psycopg cannot use —
# uvicorn against Postgres would fail on the first query. No-op on Linux (prod).
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api import api_router
from core import redis as redis_client
from core.config import settings
from services.cache import build_cache
from services.market import MarketService

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

BACKEND_DIR = Path(__file__).resolve().parent
# Resolved, not just absolute: the SPA fallback compares a resolved candidate
# path against this one to prove containment. Comparing a resolved path to an
# unresolved one is unsound the moment any component is a symlink or junction.
DIST_DIR = (BACKEND_DIR.parent / "getinvestage" / "dist").resolve()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast, loudly, at boot — not on the first login attempt in prod.
    # A missing SECRET_KEY in production means every restart silently
    # invalidates all issued tokens and logs every user out.
    if settings.is_production and not settings.secret_key:
        raise RuntimeError(
            "SECRET_KEY must be set in production. Generate one with: "
            "python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )
    if not settings.finnhub_api_key:
        logger.warning(
            "FINNHUB_API_KEY is not set — starting in DEMO MODE with synthetic data. "
            "Get a free key at https://finnhub.io/register and put it in backend/.env"
        )

    # Redis backs the shared cache and rate limiter. connect() never raises: a
    # Redis that is down at boot must not stop the app from booting, it must
    # only degrade it (SQLite cache, in-process limiter).
    redis = await redis_client.connect()
    cache = build_cache(redis, BACKEND_DIR / "cache.db")

    app.state.market = MarketService(settings.finnhub_api_key or None, cache)
    yield
    await app.state.market.close()
    await redis_client.disconnect()


app = FastAPI(title="Getinvestage API", lifespan=lifespan)

# Only needed for the Vite dev server, which runs on a different origin. In
# production FastAPI serves the SPA itself, so every call is same-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,  # required for the httpOnly refresh cookie
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

app.include_router(api_router)


# --- SPA hosting ------------------------------------------------------
# Order matters. /api/* is already registered above and wins. Static assets
# are served from /assets. Everything else falls through to index.html so
# that a hard refresh on /dashboard (a client-side route with no file on
# disk) renders the app instead of 404ing.

if DIST_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(request: Request, full_path: str):
        # An unmatched /api/* path is a genuine 404, not a page. Returning
        # index.html there would hand JSON clients an HTML body.
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)

        # Serve a real file when one exists (favicon, robots.txt, …).
        candidate = (DIST_DIR / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(DIST_DIR):
            return FileResponse(candidate)

        return FileResponse(DIST_DIR / "index.html")

else:
    logger.warning(
        "getinvestage/dist not found — API-only mode. Run `npm run build` in "
        "getinvestage/ to serve the site from FastAPI."
    )
