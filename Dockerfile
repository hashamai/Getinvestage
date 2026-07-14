# Multi-stage: Node builds the React app, Python serves it alongside the API.
#
# This exists because the two runtimes are both needed but only one ships:
# Render's Python runtime has no Node, and `getinvestage/dist` is gitignored,
# so there is no way to get a built SPA into a plain Python deploy. Stage 1
# builds it; stage 2 copies just the output and throws Node away.

# ---- stage 1: build the SPA ----
FROM node:20-slim AS web
WORKDIR /build

# Copy manifests first: this layer only busts when dependencies change, so
# editing a component doesn't reinstall node_modules on every deploy.
COPY getinvestage/package.json getinvestage/package-lock.json ./
RUN npm ci

COPY getinvestage/ ./
RUN npm run build


# ---- stage 2: the app ----
FROM python:3.12-slim
WORKDIR /app

# Keeps the image small and logs unbuffered so Render shows them in real time.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/

# The path here is load-bearing. main.py computes DIST_DIR as
#   Path(__file__).parent.parent / "getinvestage" / "dist"
# so the built assets must land at /app/getinvestage/dist for the SPA to be
# served. Change one and you must change the other.
COPY --from=web /build/dist getinvestage/dist

# Drop root. If the app is ever exploited, the attacker lands as a user who
# cannot write to the filesystem or install anything.
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app

WORKDIR /app/backend
EXPOSE 8000

# Render/Fly inject $PORT; default to 8000 for `docker run` locally.
# Migrations run here, not in a separate release step, so the schema is always
# applied before the first request hits the new code. `alembic upgrade head` is
# idempotent — a redeploy with no new migrations is a no-op.
CMD alembic upgrade head && \
    uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
