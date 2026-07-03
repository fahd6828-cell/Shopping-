# Souqly — Deployment Guide

## Topology

```
                 ┌─────────────┐
   clients ────► │  api        │  node dist/server.js   (stateless, scale N)
 (ext + mobile)  └──────┬──────┘
                        │ enqueue scrape / read catalog
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌──────────┐    ┌───────────┐
   │ Postgres │    │  Redis   │    │  worker   │  node dist/worker.js
   │ catalog, │    │ cache +  │◄───│ scraping, │  (1 instance; scale only with
   │ coupons, │    │ BullMQ   │    │ alerts    │   per-store proxy strategy)
   │ users    │    └──────────┘    └───────────┘
   └─────────┘
```

Both containers come from `backend/Dockerfile`:
- **target `api`** — slim Alpine, `HEALTHCHECK` on `/health`, port 3000.
- **target `worker`** — same code plus system Chromium (`CHROMIUM_PATH` preset)
  for the Playwright scrapers.

## Quick start (single host)

```bash
docker compose --profile app up -d --build
curl http://localhost:3000/health          # → {"status":"ok"}
```

Postgres applies `backend/db/schema.sql` + `seed.sql` automatically on first
boot. For an **existing** database, apply migrations instead:

```bash
psql "$DATABASE_URL" -f backend/db/migrations/002_iteration2.sql
```

## Environment variables

| Variable | Service | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | api, worker | compose-internal | Postgres connection string |
| `REDIS_URL` | api, worker | compose-internal | cache + BullMQ |
| `QUEUE_MODE` | api | `inline` | **set `queue` in production** (worker consumes jobs) |
| `SEARCH_CACHE_TTL_SECONDS` | api | `10800` | 3h price cache (product spec) |
| `SCRAPE_WAIT_MS` | api | `4000` | how long a search waits for in-flight scrapes |
| `SCRAPER_ENABLED` | worker | `false` | real Playwright scraping (Noon) |
| `CHROMIUM_PATH` | worker | preset in image | override only for custom browsers |
| `AMAZON_PAAPI_ACCESS_KEY` / `_SECRET_KEY` / `_PARTNER_TAG` | worker (and api in inline mode) | empty | empty = mock Amazon data |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | worker | empty | empty = dry-run pushes (logged, not sent) |
| `PORT` | api | `3000` | |

## Go-live checklist

1. **Amazon**: put PA-API credentials in the worker/api env → real signed
   SearchItems calls immediately (signature already verified against the
   `aws4` reference implementation).
2. **Noon**: set `SCRAPER_ENABLED=true`, verify the selector table in
   `backend/src/adapters/noonScraper.ts` against the live site once, and put
   rotating residential proxies in front of the worker before real volume.
3. **Push**: paste the Firebase service-account JSON (single line) into
   `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. **CORS**: restrict the wildcard in `backend/src/server.ts` to the
   extension origin and app domains.
5. **Rate limiting**: add a reverse proxy (nginx/Caddy) or express-rate-limit
   in front of `/api/*`; `X-Device-Id` is a bearer secret — HTTPS only.
6. **Extension**: point `extension/shared/settings.js` default `apiBaseUrl`
   (and `manifest.json` `host_permissions`) at the deployed API origin.
7. **Mobile**: set the API base URL in `mobile/src/api/client.ts` for release
   builds.

## Scaling notes

- **api** is stateless — scale horizontally behind a load balancer; Redis
  keeps cache coherent across replicas.
- **worker** should stay at one replica until per-store politeness is managed
  with a proxy pool; BullMQ's per-queue limiter is process-local.
- The hourly `price-check` job self-registers via BullMQ's job scheduler; it
  is idempotent across worker restarts (`upsertJobScheduler`).
- Postgres: `price_history` is append-only and will dominate growth — add
  monthly partitioning when it passes ~10M rows.
