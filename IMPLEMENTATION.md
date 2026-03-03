# Implementation vs CLAUDE.md

This document maps every built component to the requirements and sections in **CLAUDE.md**.

---

## 1. What This Is (CLAUDE.md § What This Is)

| Requirement | Implementation |
|-------------|----------------|
| Cross-chain bridge rate comparison engine | End-to-end flow: fetcher → DB → API → dashboard. |
| Fetches from aggregators (LI.FI, Rango, Bungee, Rubic) | `src/fetcher/aggregators/lifi.ts`, `rango.ts`, `bungee.ts`, `rubic.ts`; all registered in `aggregators/index.ts`. |
| Direct bridge APIs | `src/fetcher/bridges/across.ts`, `relay.ts`, `mayan.ts`, `meson.ts`; gap-fill in `bridges/index.ts`. |
| Normalizes quotes | `src/fetcher/normalizer.ts`: `rankQuotes()`, `deduplicateQuotes()`. |
| Stores in TimescaleDB | `src/db/connection.ts`, `queries.ts`, `migrate.ts`; `migrations/001_init.sql` (hypertables, continuous aggregates). |
| Exposes via REST API | `src/api/server.ts`, `routes/health.ts`, `quotes.ts`, `matrix.ts`, `opportunities.ts`. |
| 30 chains | `src/config/chains.ts`: `CHAINS`, `CHAIN_SLUGS` (30 entries). |
| 870 directional routes | `src/config/routes.ts`: `generateAllRoutes()`, `ALL_ROUTES` (30×29). |
| 17 tracked bridges | `src/config/bridges.ts`: `BRIDGES` (17 entries). |

---

## 2. Tech Stack (CLAUDE.md § Tech Stack)

| Requirement | Implementation |
|-------------|----------------|
| Node 20+ / TypeScript (strict mode) | `tsconfig.json`: `"strict": true`, `"target": "ES2022"`; `package.json` engines / docs assume Node 20+. |
| PostgreSQL 16 + TimescaleDB | `docker-compose.yml`: `timescale/timescaledb:latest-pg16`; `migrations/001_init.sql` uses TimescaleDB. |
| Fastify | `package.json` dependency; `src/api/server.ts` uses Fastify, `@fastify/cors`, `@fastify/static`. |
| pg (node-postgres) + pg-format | `src/db/connection.ts` (Pool), `src/db/queries.ts`: `insertQuotesBatch()` uses `pg-format` for multi-row INSERT. |
| Docker Compose (TimescaleDB + app) | `docker-compose.yml` (db service + volume); `Dockerfile` multi-stage for app. |
| No ORM, raw SQL, parameterized queries | All DB access in `src/db/queries.ts` and routes via `pool.query()` / parameterized `$1,$2...`; only `pg-format` for bulk INSERT template. |
| Type-safe wrappers in `src/db/queries.ts` | `insertQuotesBatch`, `upsertRouteLatest`, `updateRouteStatus`, `getQuotesForRoute`, `getMatrixData`, `insertFetchLog`, `getHealth`, `getRouteLatestMaxTs` with typed args/returns. |

---

## 3. Project Structure (CLAUDE.md § Project Structure)

| Path | Implementation |
|------|-----------------|
| `src/config/` | `chains.ts`, `routes.ts`, `bridges.ts`, `tokens.ts` — static typed configs. |
| `src/types/` | `index.ts` (NormalizedQuote, Route, RouteKey, Asset, RouteStatus, FetchLogEntry, HealthResponse, etc.); `pg-format.d.ts`. |
| `src/db/` | `connection.ts` (Pool, query, getClient), `migrate.ts`, `queries.ts`; `migrations/001_init.sql`. |
| `src/fetcher/` | Pipeline, normalizer, scheduler. |
| `src/fetcher/aggregators/` | `index.ts` (registry, fetchAllAggregators), `lifi.ts`, `rango.ts`, `bungee.ts`, `rubic.ts`. |
| `src/fetcher/bridges/` | `index.ts` (registry, gapFill), `across.ts`, `relay.ts`, `mayan.ts`, `meson.ts`. |
| `src/api/` | `server.ts`; `routes/health.ts`, `quotes.ts`, `matrix.ts`, `opportunities.ts`. |
| (Additional) | `src/lib/logger.ts`, `src/lib/utils.ts`; `src/index.ts` (entry + scheduler + server + shutdown). |

---

## 4. Architecture Rules (CLAUDE.md § Architecture Rules)

| Rule | Implementation |
|------|-----------------|
| **Aggregator-first, bridge gap-fill** | `src/fetcher/pipeline.ts`: calls `fetchAllAggregators()` first, then `gapFill(routeKey, bridgesSeen, batchId)`; `bridges/index.ts` only calls bridges not in `bridgesSeen`. |
| **Rubic dedup** | `src/fetcher/aggregators/rubic.ts`: skips variants where `provider.id === 'lifi'` or `provider.id === 'rango'`. |
| **Bulk inserts only** | `src/db/queries.ts`: `insertQuotesBatch()` uses `pg-format` for a single multi-row INSERT; no per-row INSERT in application code. |
| **No floating point for money** | Amounts as strings in types and DB (input_amount, output_amount, etc.); fees as integers (basis points); USD as `NUMERIC(20,8)` in schema and string in TS where needed. |
| **Every function typed, no `any`** | Typed interfaces in `types/index.ts`; Zod for external APIs in aggregators/bridges; explicit return types on public functions. |

---

## 5. Key Constants (CLAUDE.md § Key Constants)

| Constant | Implementation |
|----------|----------------|
| Refresh: Tier 1 = 60s, Tier 2 = 120s, Tier 3 = 300s | `src/config/routes.ts`: `REFRESH_INTERVALS` `{ 1: 60_000, 2: 120_000, 3: 300_000 }`; used in `src/fetcher/scheduler.ts`. |
| Amount tiers: 50, 1000, 50000 (USD) | `src/config/routes.ts`: T2_AMOUNTS `[50, 1000, 50000]`; T1/T3 use 1000; API and frontend support 50, 1000, 50000. |
| Assets: ETH, USDC, USDT | `src/types/index.ts`: `Asset = 'ETH' | 'USDC' | 'USDT'`; `src/config/tokens.ts` and routes use these. |
| Stale thresholds (T1 > 3min, T2 > 6min, T3 > 15min) | `src/db/queries.ts`: `STALE_THRESHOLD_MS`; `updateRouteStatus()` sets `state = 'stale'` when quote age exceeds tier threshold. Health also uses a 5‑min threshold for “degraded.” |

---

## 6. Build & Run (CLAUDE.md § Build & Run)

| Command | Implementation |
|---------|----------------|
| `docker compose up -d` | `docker-compose.yml`: db service (TimescaleDB pg16, port 5432, volume pgdata). |
| `npm run migrate` | `package.json` script runs `tsx src/db/migrate.ts`; `migrate.ts` runs all `migrations/*.sql` in a transaction. |
| `npm run dev` | `package.json`: `tsx watch src/index.ts` (fetcher + API). |
| `npm run build && npm start` | `tsc` → `dist/`; `node dist/src/index.js`; `Dockerfile` uses same build. |
| `npm test` | `package.json`: `vitest run`; tests under `tests/`. |

---

## 7. Testing (CLAUDE.md § Testing)

| Requirement | Implementation |
|-------------|----------------|
| Unit tests (vitest) | `tests/config/routes.test.ts`, `tests/fetcher/normalizer.test.ts`, `tests/fetcher/pipeline.test.ts`, `tests/fetcher/gap-fill.test.ts`; API tests in `tests/api/quotes.test.ts`. |
| Verify fetcher | `package.json`: `"verify:fetcher": "tsx scripts/verify-fetcher.ts"`; script runs one route (ethereum→arbitrum, USDC, $1000), prints quotes and DB state. |
| Verify DB | `package.json`: `"verify:db": "tsx scripts/verify-db.ts"`; script checks tables, hypertables, continuous aggregates, insert/read/delete test row. |
| Integration tests (*.integration.test.ts) | No files named `*.integration.test.ts`; API tests act as integration tests but live under `tests/api/`. |

---

## 8. Environment Variables (CLAUDE.md § Environment Variables)

| Variable | Implementation |
|----------|----------------|
| DATABASE_URL, LIFI_API_KEY_1/2/3, RANGO_API_KEY, BUNGEE_API_KEY, RUBIC_API_KEY, PORT, NODE_ENV, LOG_LEVEL | `.env.example` lists all; `src/index.ts` uses `dotenv/config`; connection uses `DATABASE_URL`; aggregators use respective env vars. |

---

## 9. LI.FI Key Rotation (CLAUDE.md § LI.FI Key Rotation)

| Requirement | Implementation |
|-------------|----------------|
| 3 keys, round-robin | `src/fetcher/aggregators/lifi.ts`: `LIFI_KEYS` from `LIFI_API_KEY_1`, `_2`, `_3`; `getNextLifiKey()` round-robin; used on every LI.FI request. |
| Header `x-lifi-api-key` | `lifi.ts`: fetch options `headers: apiKey ? { 'x-lifi-api-key': apiKey } : {}`. |

---

## 10. Error Handling (CLAUDE.md § Error Handling)

| Requirement | Implementation |
|-------------|----------------|
| Aggregator timeout 10s, log + skip | `src/fetcher/aggregators/index.ts`: `AGGREGATOR_TIMEOUT_MS = 10_000`, `withTimeout()`; `Promise.allSettled`; failed calls logged and logged to `fetch_log` via `insertFetchLog`. |
| Bridge API error: log + skip, no retry | `src/fetcher/bridges/index.ts`: `gapFill()` uses `Promise.allSettled`; per-bridge try/catch in registry calls; `logger.warn` on failure; no inline retry. |
| DB write failure: log batch to fetch_log, don’t crash | Not fully implemented: pipeline does not catch `insertQuotesBatch` (or other DB) failures or write a consolidated error entry to `fetch_log`. |
| All errors via pino, no console.log | `src/lib/logger.ts` (pino); aggregators, bridges, pipeline, API use `logger`; no `console.log` in app code. |

---

## 11. Code Style (CLAUDE.md § Code Style)

| Requirement | Implementation |
|-------------|----------------|
| Named exports only | All modules use named exports; API route modules use `export default` for Fastify plugin only (Fastify convention). |
| Explicit return types on public functions | Return types declared on exported functions in queries, pipeline, normalizer, aggregators, bridges, API routes. |
| Zod for external API responses | `lifi.ts`, `rango.ts`, `bungee.ts`, `rubic.ts` use Zod schemas to parse and validate responses. |
| Constants in SCREAMING_SNAKE_CASE | e.g. `LIFI_KEYS`, `AGGREGATOR_TIMEOUT_MS`, `CONCURRENCY`, `REFRESH_INTERVALS`, `HEATMAP_ORDER`. |
| Files &lt; 300 lines | Files kept within reasonable size; larger modules (e.g. config) are single-purpose. |

---

## 12. Component-by-Component Summary

### Config (`src/config/`)

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `chains.ts` | Project structure, 30 chains | CHAINS, CHAIN_SLUGS, getChain, getChainByChainId, HEATMAP_ORDER, EVM_CHAINS, NON_EVM_CHAINS. |
| `routes.ts` | 870 routes, key constants | TIER definitions, generateAllRoutes, ALL_ROUTES, TIER1/2/3_ROUTES, REFRESH_INTERVALS, getRouteTier, routeId, fullRouteKey. |
| `bridges.ts` | 17 bridges, LI.FI rotation location | AGGREGATORS, BRIDGES, V1_DIRECT_BRIDGES, getMissingBridges, LIFI/RANGO/BUNGEE_BRIDGE_MAP, resolveBridgeName. |
| `tokens.ts` | Assets, tokens | TOKENS (90 entries), getToken, isPlaceholder, getValidTokens. |

### Types (`src/types/`)

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `index.ts` | Project structure, no float for money | Chain, Route, RouteKey, Asset, NormalizedQuote, RouteStatus, FetchLogEntry, HealthResponse, QuotesResponse, MatrixResponse, etc. |
| `pg-format.d.ts` | — | Module declaration for `pg-format`. |

### DB (`src/db/`)

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `connection.ts` | Tech stack (pg, type-safe) | Singleton Pool (max 20, idle 30s, connect 5s), query(), getClient(), pool.end() on exit. |
| `migrate.ts` | Build & run (migrate) | Reads `migrations/*.sql` (sorted), runs each in one transaction, logs. |
| `queries.ts` | Tech stack, bulk inserts, no float | insertQuotesBatch (pg-format), upsertRouteLatest, updateRouteStatus, getQuotesForRoute, getMatrixData, insertFetchLog, getHealth, getRouteLatestMaxTs. |
| `migrations/001_init.sql` | Tech stack (TimescaleDB) | Extensions, quotes (hypertable), route_latest, route_status, fetch_log (hypertable), quotes_hourly & bridge_daily (continuous aggregates), compression & retention policies. |

### Fetcher – aggregators (`src/fetcher/aggregators/`)

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `index.ts` | Architecture (aggregator-first), error handling | aggregatorRegistry, registerAggregator, fetchAllAggregators (parallel, 10s timeout, insertFetchLog per call). |
| `lifi.ts` | LI.FI, key rotation, Zod | getNextLifiKey(), GET li.quest/v1/quote, Zod parse, resolveBridgeName('lifi'), skip unsupported chains. |
| `rango.ts` | Aggregators, Zod | GET api.rango.exchange/routing/best, Rango blockchain IDs, Zod, resolveBridgeName('rango'). |
| `bungee.ts` | Aggregators, Zod | GET api.socket.tech/v2/quote, EVM-only, one quote per route, Zod, resolveBridgeName('bungee'). |
| `rubic.ts` | Aggregators, Rubic dedup, Zod | POST api-v2.rubic.exchange/api/routes/bestvariants, skip provider.id lifi/rango, Zod, human-readable amount. |

### Fetcher – bridges (`src/fetcher/bridges/`)

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `index.ts` | Architecture (gap-fill) | bridgeRegistry, registerBridge, gapFill (high/medium priority, not in bridgesSeen); registers across, relay, mayan, meson. |
| `across.ts` | Direct bridge APIs | GET app.across.to/api/suggested-fees, EVM-only, source 'direct'. |
| `relay.ts` | Direct bridge APIs | POST api.relay.link/quote, source 'direct'. |
| `mayan.ts` | Direct bridge APIs | GET price-api.mayan.finance/v3/quote, source 'direct'. |
| `meson.ts` | Direct bridge APIs | POST relayer.meson.fi/api/v1/price, source 'direct'. |

### Fetcher – core

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `normalizer.ts` | Normalizes quotes | rankQuotes (sort by output_usd, rank, spread_bps), deduplicateQuotes (by bridge, keep best). |
| `pipeline.ts` | Architecture, bulk insert | processRoute: fetchAllAggregators → gapFill → merge → dedupe → rank → insertQuotesBatch, upsertRouteLatest, updateRouteStatus. |
| `scheduler.ts` | Key constants (refresh) | runTierCycle (expand routes × assets × tiers, chunk concurrency 10), startScheduler (T1 0s+60s, T2 20s+120s, T3 40s+300s). |

### API (`src/api/`)

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `server.ts` | Tech stack (Fastify) | buildServer: Fastify, @fastify/cors, request hook, error handler, route registration; production: @fastify/static for frontend/dist, SPA fallback. |
| `routes/health.ts` | — | GET /api/health → status (ok/degraded/down), uptime, lastFetch per tier, db (connected, quoteCount, oldestQuote). |
| `routes/quotes.ts` | — | GET /api/quotes (src, dst, asset, tier) → QuotesResponse; Zod validation, 400 on invalid. |
| `routes/matrix.ts` | — | GET /api/matrix (asset, tier) → 870 cells (HEATMAP_ORDER), stats (active, dead, stale, singleBridge). |
| `routes/opportunities.ts` | — | GET /api/opportunities (limit, minSpreadBps, asset?, tier?) → active routes by spread_bps DESC. |

### Lib & entry

| File | CLAUDE reference | Purpose |
|------|------------------|---------|
| `lib/logger.ts` | Error handling (pino) | Pino logger, pretty in dev, JSON in production, LOG_LEVEL. |
| `lib/utils.ts` | — | sleep, chunk, retry (exponential backoff), generateBatchId (UUID). |
| `index.ts` | Build & run | dotenv, DB check, buildServer, listen, startScheduler, SIGINT/SIGTERM shutdown (server.close, pool.end). |

### Scripts & frontend

| Path | CLAUDE reference | Purpose |
|------|------------------|---------|
| `scripts/verify-db.ts` | Testing (verify:db) | Connect, migrate, check tables/hypertables/continuous aggregates, insert/read/delete test quote. |
| `scripts/verify-fetcher.ts` | Testing (verify:fetcher) | processRoute one route, print quotes table, route_latest, route_status. |
| `frontend/` | Not in CLAUDE; Session 5 | Vite React-TS, Tailwind; Route Explorer, Heatmap, Opportunities; API client; proxy /api → backend; production build served by Fastify. |

---

## 13. Gaps / Deviations from CLAUDE.md

| CLAUDE requirement | Status |
|--------------------|--------|
| DB write failure: log full batch to fetch_log, don’t crash | Not implemented; pipeline does not catch DB errors or write error entry to fetch_log. |
| Stale thresholds (T1 > 3min, T2 > 6min, T3 > 15min) | **Fixed:** `updateRouteStatus()` in `queries.ts` now sets `state = 'stale'` when quote age exceeds tier threshold; matrix/health reflect stale counts. |
| Matrix 870-cell sanity check | **Fixed:** `routes/matrix.ts` logs a warning when `cells.length !== 870` to detect data loss or config drift. |
| Unit tests under `src/**/*.test.ts` | Tests live under `tests/` (config, fetcher, api); behavior equivalent. |
| Integration tests `*.integration.test.ts` | No files with this naming. |
| Direct bridge APIs “(across.ts, stargate.ts, etc.)” | Four direct clients: across, relay, mayan, meson. Stargate and others only via aggregators. |

---

*Generated from CLAUDE.md and the current codebase.*
