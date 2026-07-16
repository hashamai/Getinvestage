# Deployment Guide — Getinvestage

One repo, one production server: FastAPI serves both the `/api/*` routes and the
built React app. Everything below follows from that.

```
Browser ──▶ FastAPI (:8000) ──▶ Finnhub / Yahoo (market data)
                │                    ▲
                │                    └── Redis (optional shared cache, Upstash)
                ├── getinvestage/dist  (built React SPA, served as static files)
                └── Postgres (Neon)    (users, watchlists, refresh tokens)
```

## The stack, and what runs where

| Layer     | Tech                          | Local dev                | Production            |
|-----------|-------------------------------|--------------------------|-----------------------|
| Frontend  | React 18 + Vite               | `npm run dev` (:5174)    | Static files inside the Docker image, served by FastAPI |
| Backend   | FastAPI + uvicorn (Python 3.12) | `uvicorn main:app`     | Docker container on Render |
| Database  | SQLAlchemy (async)            | SQLite (`app.db`, zero setup) or local Postgres | **Neon Postgres** (free tier, persists) |
| Cache / rate limit | Redis (optional)     | not needed (in-process fallback) | **Upstash Redis** (optional but recommended for >1 instance) |
| Migrations| Alembic                       | `alembic upgrade head`   | Runs automatically at container start |

**Why Neon and not Render's Postgres:** Render's free Postgres **expires after
30 days and deletes your data**. Neon's free tier persists. This is already
documented in [render.yaml](render.yaml).

**Why Upstash for Redis:** free tier, gives a `rediss://` URL reachable from
both your laptop and Render. If `REDIS_URL` is unset the app still works — it
falls back to a SQLite cache and an in-process rate limiter, which is correct
on exactly one instance.

---

## 0. Prerequisites

- Python 3.12+, Node 20+, Docker Desktop, git
- Accounts (all free tier): [Neon](https://neon.tech), [Render](https://render.com),
  [Finnhub](https://finnhub.io/register), optionally [Upstash](https://upstash.com)

## 1. Environment variables

All configuration is env vars (read from `backend/.env` in dev, from the
platform dashboard in prod). Full list:

| Variable | Required | Example / notes |
|---|---|---|
| `SECRET_KEY` | **prod: yes** (app refuses to boot without it) | `python -c "import secrets; print(secrets.token_urlsafe(32))"` — set once, never rotate casually: it signs every JWT, changing it logs everyone out |
| `ENVIRONMENT` | prod: yes | `production` — turns on Secure cookies and the SECRET_KEY boot guard. Default `development` |
| `DATABASE_URL` | yes | see step 2 |
| `FINNHUB_API_KEY` | recommended | without it the app boots in **demo mode** with labeled synthetic data |
| `REDIS_URL` | optional | `rediss://default:<password>@<host>.upstash.io:6379` |
| `FRONTEND_ORIGINS` | dev only | `http://localhost:5174` (CORS for the Vite dev server; irrelevant in prod because FastAPI serves the SPA same-origin) |

## 2. Database (Neon Postgres)

1. Create a project at [neon.tech](https://neon.tech) → it gives you a connection string like
   `postgres://user:pw@ep-xxx-yyy.us-east-2.aws.neon.tech/neondb?sslmode=require`
2. **Two edits** before using it as `DATABASE_URL`:
   - scheme must be `postgresql+psycopg://` (the app uses SQLAlchemy async + psycopg 3)
   - drop `?sslmode=require` — psycopg negotiates TLS itself

   ```
   DATABASE_URL=postgresql+psycopg://user:pw@ep-xxx-yyy.us-east-2.aws.neon.tech/neondb
   ```
3. Create the schema (Alembic migrations, from `backend/` with the venv active):

   ```powershell
   cd backend
   alembic upgrade head
   ```

   In production you never run this by hand — the Docker container runs
   `alembic upgrade head` on every start before uvicorn boots (see the
   `CMD` in [Dockerfile](Dockerfile)). It's idempotent; a redeploy with no
   new migrations is a no-op.

**Local alternative:** skip Neon entirely and use SQLite:
`DATABASE_URL=sqlite+aiosqlite:///./app.db` — zero setup, same commands.
The test suite already runs on SQLite.

**Adding a schema change later:** edit the model in `backend/models/`, then

```powershell
alembic revision --autogenerate -m "describe the change"
alembic upgrade head          # apply locally; prod applies on next deploy
```

## 3. Backend — local build & run

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env        # fill in FINNHUB_API_KEY, DATABASE_URL
.venv\Scripts\alembic upgrade head
.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

Verify: `http://localhost:8000/api/health` → `{"status":"ok","demoMode":false}`
(`demoMode: true` means no Finnhub key — synthetic data, clearly labeled in the UI).

Tests: `.venv\Scripts\python -m pytest -q` (36 tests, SQLite, no network).

## 4. Frontend — build

```powershell
cd getinvestage
npm ci
npm run build                 # output → getinvestage/dist
```

FastAPI automatically serves `getinvestage/dist` if it exists — open
`http://localhost:8000` and you have the full production topology locally.

For day-to-day frontend work use hot reload instead:
`npm run dev` → `http://localhost:5174`, which proxies `/api` to `:8000`
(see [vite.config.js](getinvestage/vite.config.js)).

## 5. Docker — build & run locally

The [Dockerfile](Dockerfile) is multi-stage: stage 1 (Node 20) builds the SPA,
stage 2 (Python 3.12-slim) installs the backend and copies only `dist/` in —
the final image has no Node. It runs as a non-root user and applies migrations
on start.

```powershell
docker build -t getinvestage .

docker run --rm -p 8000:8000 `
  -e SECRET_KEY="dev-only-secret" `
  -e DATABASE_URL="postgresql+psycopg://user:pw@ep-xxx.neon.tech/neondb" `
  -e FINNHUB_API_KEY="your_key" `
  getinvestage
```

Open `http://localhost:8000`. Notes:

- SQLite inside the container works (`sqlite+aiosqlite:///./app.db`) but the
  data dies with the container — fine for a smoke test, wrong for prod.
- `$PORT` is honored if the platform injects it; defaults to 8000.

## 6. Deploy — Render (primary, already wired)

The repo ships a [render.yaml](render.yaml) blueprint. This is the intended
production path: one Docker service, everything same-origin, no CORS, no
cookie headaches.

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. Render reads
   `render.yaml` and creates the service (Docker runtime, free plan,
   health check on `/api/health`).
3. `SECRET_KEY` is auto-generated once by Render (`generateValue: true`) and
   `ENVIRONMENT=production` is set by the blueprint. In the service's
   **Environment** tab add the two secrets the blueprint deliberately leaves out:
   - `DATABASE_URL` — the Neon string from step 2
   - `FINNHUB_API_KEY`
   - (optional) `REDIS_URL` — from Upstash
4. Deploy. The container boots → `alembic upgrade head` runs against Neon →
   uvicorn starts → Render flips traffic when `/api/health` returns 200.
5. Every `git push` to the default branch redeploys automatically.

That's the whole production deployment: **Render (Docker) + Neon + Upstash**.

## 7. Deploy — Vercel (optional: frontend only)

Vercel can't host this backend well — FastAPI here is a long-lived server
(startup lifespan, connection pools, background cache), not serverless
functions. So the Vercel option is a **split deployment**: static frontend on
Vercel, backend still on Render. Use it only if you specifically want Vercel's
CDN/preview deployments; otherwise step 6 alone is simpler.

1. Deploy the backend on Render first (step 6). Note its URL, e.g.
   `https://getinvestage.onrender.com`.
2. Add `getinvestage/vercel.json`:

   ```json
   {
     "rewrites": [
       { "source": "/api/:path*", "destination": "https://getinvestage.onrender.com/api/:path*" },
       { "source": "/:path*", "destination": "/index.html" }
     ]
   }
   ```

   The `/api` rewrite is load-bearing: it proxies API calls through the Vercel
   domain, so the browser sees everything as **same-origin**. That keeps the
   httpOnly refresh cookie working — sent cross-site directly, a
   `SameSite=Lax` cookie would be dropped and login would silently break.
   The second rewrite is the SPA fallback for client-side routes.
3. Vercel dashboard → **New Project** → import the repo:
   - Root Directory: `getinvestage`
   - Framework preset: Vite (build `npm run build`, output `dist`)
4. Deploy. The frontend is on Vercel; every `/api/*` request is proxied to Render.

Caveat: free-tier Render spins down on idle — the first request after a quiet
period takes ~30–60s while the container cold-starts. That applies to both
step 6 and 7.

## 8. Post-deploy checklist

- [ ] `https://<your-app>/api/health` → `{"status":"ok","demoMode":false}`
- [ ] Register a user, log out, log back in (exercises Postgres + JWT + cookie)
- [ ] Hard-refresh on `/dashboard` — the SPA fallback should render the app, not 404
- [ ] Star a symbol, reload — it persists (watchlist round-trip through Neon)
- [ ] Logs show `Cache backend: Redis (shared)` if you set `REDIS_URL`, otherwise the SQLite fallback line
