# Bridge Rate Dashboard — Technical Architecture

*Last updated: 2026-07-13. This is the authoritative technical reference — it describes what actually runs in production, verified against the live system, not what was originally planned. `DEPLOYMENT_V1.md` describes an earlier Railway/Render/Vercel deployment plan that was superseded; see §7 for the real infrastructure.*

---

## 1. System overview

```
┌──────────────┐     ┌──────────────────────────────────────────┐     ┌─────────────┐
│  Aggregator   │◄────│                                            │     │             │
│  APIs         │     │   Fetcher / Scheduler (background workers) │     │  Frontend   │
│  (LI.FI,      │     │   - one worker per aggregator               │     │  (React,    │
│  Bungee,      │     │   - gap-fill worker for direct bridges       │     │  bundled    │
│  Rubic,       │     │   - runs continuously inside the API process│     │  into the   │
│  Squid,       │────►│                                              │     │  same       │
│  Rango*)      │     └──────────────┬───────────────────────────────┘     │  container, │
└──────────────┘                    │ writes                              │  also on    │
                                     ▼                                     │  Vercel)    │
┌──────────────┐             ┌───────────────┐            ┌────────────┐  └──────┬──────┘
│  Direct       │────────────►│  PostgreSQL 16  │◄──────────│  Fastify   │◄────────┘
│  bridge APIs  │             │  + TimescaleDB  │  reads    │  REST API  │
│  (17 tracked, │             │  (Apache/       │           │  (/api/*)  │
│  12 wired)    │             │  community ed.) │           └────────────┘
└──────────────┘             └───────────────┘

* Rango is registered but globally disabled — see §4.5.
```

One Node process does everything on the backend: it runs the Fastify HTTP server *and* the fetcher/scheduler in the same event loop (`src/index.ts` starts both). There is no separate worker service or queue — background fetching is just `setInterval`/`setTimeout`-driven async work sharing the process with API request handling.

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 20, TypeScript (strict mode) | ESM (`"type": "module"`) |
| HTTP | Fastify 5 | `@fastify/cors`, `@fastify/compress` (gzip, ~380KB→~35KB on the matrix payload), `@fastify/static` (serves the built frontend in production) |
| DB driver | `pg` (node-postgres), `pg-format` for bulk multi-row inserts | No ORM — raw parameterized SQL, typed wrapper functions in `src/db/queries/` |
| DB engine | PostgreSQL 16 + TimescaleDB | **Apache/community edition** — hypertables only; no continuous aggregates, compression, or retention policies (those are TSL-licensed) |
| Rate limiting | Bottleneck, wrapped in a custom adaptive limiter (`src/lib/rate-limiter.ts`) | Per-source, per-key, self-tuning on 429s |
| Retries | `p-retry` | 2 retries on transient errors; 429 and no-route are explicitly *not* retried |
| Validation | Zod | Runtime validation of API query params |
| Logging | pino (structured JSON) | Never `console.log` in app code |
| Frontend | React + Vite | Branded "Squid Bridge Intelligence" |
| Container | Docker (multi-stage: builds backend + frontend, ships only production deps + both `dist/` folders) | |
| Testing | Vitest | Unit tests co-located as `*.test.ts`; DB-dependent tests as `*.integration.test.ts` |

## 3. Data model

Five tables, all in one Postgres database (`bridge_dashboard`). No ORM — see `migrations/*.sql` for the source of truth and `src/db/queries/*.ts` for typed access.

### `quotes` (hypertable, 1-hour chunks)
Append-only time series — every quote ever returned by any source, one row per (route, bridge, source, timestamp). This is the raw historical record; nothing is ever updated or deleted here except by the fetch_log-style purge (quotes itself currently has no purge policy — see §8.5 open item). At time of writing this holds ~3.4M rows spanning ~35 days.

Indexes: `(src_chain, dst_chain, asset, amount_tier, ts DESC)`, `(bridge, ts DESC)`, `(batch_id)`.

### `route_latest`
One row per (src, dst, asset, amount_tier, bridge, source) — the most recent quote for that exact combination, upserted on every fetch. This is what the Matrix, Route Explorer, and win-rate calculations read from for "what's the current picture" queries, instead of scanning the full `quotes` history every time.

**Primary key: `(src_chain, dst_chain, asset, amount_tier, bridge, source)`** — six columns, deliberately including both `bridge` and `source` so e.g. "Across via LI.FI" and "Across via Bungee" are kept as separate rows rather than overwriting each other (`migrations/002_route_latest_bridge_source_pk.sql`).

### `route_status`
One row per (src, dst, asset, amount_tier) — a precomputed rollup: current state (`active`/`dead`/`stale`/`single-bridge`), best/worst bridge and price, spread in bps, quote count, bridge count. This is what powers the heatmap's color-coding and the leaderboard's win/coverage counts.

**Primary key: `(src_chain, dst_chain, asset, amount_tier)`.** ⚠️ **This constraint went missing in production for an unknown period** (confirmed via `pg_constraint`: zero constraints on the table as of 2026-07-13, before `migrations/008_route_status_pk_fix.sql` restored it). See §8.3 for the full story — every `updateRouteStatus()` upsert had been silently failing without it.

### `fetch_log` (hypertable, 1-day chunks)
Every single fetch *attempt*, not just successes — one row per (route, source) per cycle, with status (`success`/`error`/`timeout`/`no_route`/`skipped`/`rate_limited`), response time, and error message. This is the reliability/health data source (`/api/bridges/health`) and is distinct from `quotes`, which only records realized outputs. Purged nightly to 7 days of retention (`purgeFetchLog`, added after this table's write volume was identified as a CPU driver — see §8.1).

### `aggregator_route_skip`
Adaptive skip tracking: per (route, aggregator), a rolling miss counter and a `skip_until` timestamp. After 5 consecutive `no_route` misses, that pair is skipped for 24h; after 11, for 7 days. Loaded into an in-memory `Map` at startup and refreshed every 30 minutes (`src/lib/aggregator-skip.ts`) — this is what stops the fetcher from repeatedly calling e.g. Bungee for a Cosmos-chain route it will never support.

## 4. Fetching & scheduling architecture

### 4.1 Aggregator-first, bridge gap-fill
Every route is queried against all applicable aggregators first (`fetchAllAggregators` in `src/fetcher/aggregators/index.ts`). A direct bridge API is only called if that bridge didn't already appear in any aggregator's results for that route (`gapFill` in `src/fetcher/bridges/index.ts`) — this avoids redundant calls for bridges that are already covered.

### 4.2 Independent worker model
Five independent async loops run inside the same process, each with its own `running` flag so they can't overlap with themselves (`src/fetcher/scheduler.ts`):

| Worker | Covers | Concurrency |
|---|---|---|
| Squid worker | All routes, Squid only, non-EVM/Cosmos/exotic chains sorted first | 50-task windows |
| LI.FI worker | All routes | 20 concurrent |
| Bungee worker | All routes it supports (EVM-only, excludes several newer chains — see `aggregator-support.ts`) | 8 concurrent |
| Rubic worker | Only 3 fallback chains with no LI.FI/Bungee coverage (`hyperliquid`, `berachain`, `abstract`) | 5 concurrent |
| Bridge (gap-fill) worker | Whatever Squid's own cycle didn't cover, driven by "gap keys" computed after each Squid pass | 8 concurrent |

**Each worker's cycle processes its entire applicable route set every time — there is no fast/medium/slow tier split in the actual scheduling code**, despite `CLAUDE.md`'s documented "Tier 1 = 5min, Tier 2 = 12min, Tier 3 = 40min" refresh intervals. That tiered design was superseded by a "run each worker N×/day, full route set every cycle" model (`buildTasks()` has no tier filtering at all) — this is a **documentation/reality mismatch worth reconciling**, not a currently-planned change (the team was explicit during this session's incident response that a return to differentiated per-tier refresh speed is *not* wanted).

### 4.3 Startup sequence
On process start (`startScheduler()`):
1. LI.FI starts immediately.
2. Bungee starts after a 2-minute delay, Rubic after 4 — staggered so their initial write bursts don't all land in the same window as Squid's own startup work (added after a CPU-exhaustion incident, see §8.1).
3. Squid's startup branches on data freshness: if the last Squid quote is within `SKIP_SWEEP_IF_FRESH_MS` (currently 6 hours), it skips the expensive full sweep and resumes from gap keys after a short (1-minute) delay. If Squid's data is stale beyond that window, it runs a full sweep of all ~18,576 tasks immediately.
4. The gap-fill Bridge worker starts 30 seconds later, using whatever gap keys are available.

### 4.4 Cycle frequency
`CYCLE_TARGET_MS` controls how often each worker repeats its full cycle: after finishing, a worker rests `max(1 min, TARGET − elapsed)` before starting again. **Currently set to run each worker 3×/day** (`24h / 3` ≈ 8h between cycle starts) — reduced from 7×/day during this session's incident response, purely to cut total daily database write volume on a capacity-constrained production tier (see §8.2). This is the main lever available for trading refresh freshness against database load without a paid tier upgrade.

### 4.5 Rango is disabled, not gapped
Rango is fully registered (`registerAggregator('rango', fetchRango)`) but sits in `DISABLED_AGGREGATORS` (`src/config/aggregator-support.ts`) — every call to it returns "unsupported" before ever reaching the network. Reason: a 97.7% timeout rate traced to Cloudflare's WAF blocking the Azure Container App's egress IP, which was burning a full 30-second timeout slot per call and stalling T3-scale cycles for hours. This is an infrastructure/networking problem, not a Rango data-quality decision — worth remembering when comparing "5 aggregators" in docs against "4 active aggregators" in any live data pull.

### 4.6 Adaptive rate limiting
`src/lib/rate-limiter.ts` wraps Bottleneck per source. `KeyedAdaptiveLimiter` supports multiple API keys per source (LI.FI uses 3, at 200 rpm each = 600 rpm combined, selected least-loaded/round-robin); everyone else uses a single anonymous key. On a 429, the limiter backs off its rate (`backoffFactor`) and recovers it gradually on sustained success (`recoveryFactor`), with a circuit breaker that opens after consecutive hard failures. A single 429's `Retry-After` is capped at 5 minutes so one slow response can't freeze a worker for the 40+ minutes some APIs (LI.FI in particular) have been observed to request.

## 5. API surface

All routes are prefixed `/api`. See `src/api/routes/*.ts` for full query-param validation (Zod schemas).

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness + DB connectivity + corridor coverage stats. Used by the frontend's status indicator and Azure's container health probe. |
| `GET /quotes?src&dst&asset&tier` | Every quote for one specific route, ranked. |
| `GET /matrix?asset&tier` | Full 56×55 heatmap for one asset/tier — cached 20s. |
| `GET /opportunities?asset&tier&minSpreadBps` | Routes with the biggest price spread between best and worst quote — the "arbitrage-style" view. Cached 30s. |
| `GET /bridges/coverage?asset&tier` | Per-bridge coverage %, win count/rate, average fee. Powers the Bridge Leaderboard. |
| `GET /bridges/win-rate-by-tier` | Win share broken down by amount tier ($50/$1K/$50K). |
| `GET /bridges/health` | Per-aggregator success/error/timeout/no-route counts and win counts over a 24h `fetch_log` window — the reliability data source. |
| `GET /history?src&dst&asset&tier&period` | Hourly price/fee trend for one route. Falls back to querying raw `quotes` with `date_trunc` when the `quotes_hourly` continuous aggregate doesn't exist (it currently doesn't — Apache edition has no TSL continuous aggregates). |
| `GET /insights/daily` | Best/worst fee route, biggest spreads, route health summary, bridge dominance, monopoly-route count. Cached 30s. |
| `GET /relay/report` | Bridge-specific competitive analysis for Relay: wins/losses with exact gap in bps, competitor breakdown, coverage gaps against Relay's own chain list. **This is a generalizable pattern currently hardcoded to one bridge** — see PRD.md §8. |

## 6. Frontend

React + Vite, branded "Squid Bridge Intelligence" (`frontend/src/squid/brand.tsx`, `meta.ts`). Single-page app, four views switched by local state (no router):

- **Insights** — daily summary, biggest spreads, route health.
- **Route Explorer** — per-corridor quote comparison; can be deep-linked from other views via an `onOpenRoute` callback.
- **Bridge Leaderboard** (`bridges` view) — the win-rate/coverage tables shown in this session's screenshots. Reads `/bridges/coverage`, `/bridges/health`, `/bridges/win-rate-by-tier`, `/matrix`.
- **Methodology** — public explanation of how prices/fees/spreads are computed.

Global state (asset/tier selection, live-status indicator) lives in `App.tsx` and polls `/api/health` every 15 seconds.

**Two deployment surfaces exist simultaneously:** the Docker image bakes the Vite build into `frontend/dist` and Fastify serves it directly (`@fastify/static`) when `NODE_ENV=production` — so the Azure Container App URL itself serves a working frontend. There is *also* a separate Vercel deployment (its URL is the value of the backend's `CORS_ORIGIN` env var) that calls the same backend API cross-origin. Both are real and both work; neither is a leftover.

## 7. Infrastructure & deployment

| Component | What it is | Notes |
|---|---|---|
| Compute | Azure Container Apps, Consumption plan | 0.25 vCPU / 0.5 GiB, single replica (`min-replicas 1, max-replicas 1`) |
| Database | Azure Database for PostgreSQL Flexible Server, `Standard_B1ms` (Burstable, 1 vCore, 2 GiB RAM, 32 GiB storage) | **Burstable tier** — this is the single biggest source of this session's incidents; see §8 |
| Container registry | Azure Container Registry (Basic tier) | |
| CI/CD | GitHub Actions (`.github/workflows/deploy-backend.yml`) | Triggers on push to `main` touching `src/`, `migrations/`, `package.json`, `package-lock.json`, `Dockerfile`, or `tsconfig.json`. Builds the Docker image, pushes to ACR, then `az containerapp update` to roll it out — this always restarts the running container. |
| Migrations | Run automatically on every container startup (`runMigrations()` in `src/index.ts`, before the server even starts listening) | **Not tracked** — there is no `schema_migrations` table. Idempotency depends entirely on each `.sql` file being written defensively (`IF NOT EXISTS`, `DROP ... IF EXISTS` before `ADD`). See §8.4 for a related gotcha. |
| Local dev | Docker Compose (`docker-compose.yml`) — TimescaleDB + app, `.env`-driven | `DATABASE_URL` in the committed `.env` points to `localhost` — **it is not the production connection string**, which lives only as an Azure Container App secret (`db-url`). |

### 7.1 Migration file registration is manual, not automatic

`src/db/migrate.ts` does **not** run every `.sql` file it finds in `migrations/` — it runs a hardcoded `COMMON_MIGRATIONS` array of filenames, filtered against what actually exists on disk. **Adding a new migration file without adding its name to that array means it silently never executes**, with no error at any point. This was discovered while fixing the `route_status` primary key (§8.3) — the new migration file had to be explicitly registered before it would ever run.

## 8. Known issues & operational history

This section exists because the same production database went down (or nearly went down) four times across roughly two days, and the root causes compounded in non-obvious ways. Read this before making further scheduling or database changes.

### 8.1 Root cause: `fetch_log` write volume + full-sweep restarts (fixed)
The B1ms tier is *burstable* — it earns CPU credit while idle and spends it while busy, and fully exhausted its credit pool (down to 1.0 remaining, ~99% sustained CPU) after roughly 48 hours of normal 7×/day cycling. Two contributing writes were identified and fixed:
- Every adaptively-skipped fetch was writing a `fetch_log` row purely to record the skip — removed; the skip state is already tracked in `aggregator_route_skip`.
- `fetch_log` had no retention policy and grew unbounded — a daily purge to 7 days was added.

### 8.2 Root cause: a restart-triggered full sweep could re-exhaust credits within the same session (fixed)
`SKIP_SWEEP_IF_FRESH_MS` (how recent Squid's data must be to skip the expensive full sweep on restart) was originally 2 minutes — meaning *any* restart beyond an immediate crash-loop, including a deliberate maintenance restart, re-triggered a full ~18,576-task sweep. That sweep's write burst alone could re-exhaust a freshly-reset credit pool within tens of minutes, forcing another restart, which re-triggered the sweep — a self-inflicted loop. Raised to 6 hours.

Cycle frequency was also cut from 7×/day to 3×/day in the same response, once monitoring confirmed steady-state load (not just restart bursts) was itself enough to exhaust credits within ~48h regardless of the sweep fix. **The team explicitly declined a paid database tier upgrade** (evaluated: B2s at $76/mo, B2ms at $152/mo, General Purpose D2s_v3 at $172/mo, vs. the current B1ms at $19/mo — all pricing pulled from Azure's live retail pricing API during this session) in favor of this frequency reduction as a zero-cost mitigation.

### 8.3 Root cause: `route_status` silently lost its primary key (fixed)
Independently of the CPU story: `route_status` had **zero constraints** in production for an unknown period (likely lost during an earlier `pg_dump`/restore cycle that also dropped the `quotes` hypertable's chunk indexes, which *was* caught and fixed at the time — this wasn't). Every `updateRouteStatus()` upsert's `ON CONFLICT (src_chain, dst_chain, asset, amount_tier)` had been failing with `no unique or exclusion constraint matching the ON CONFLICT specification` — silently, since the calling code (`pipeline.ts`) only logs a warning on write failure and continues. This is why the Bridge Leaderboard showed all-zero win counts: `route_status.last_seen` was frozen at whatever the last successful write had been, well outside the freshness window every win-rate query filters on. Fixed via `migrations/008_route_status_pk_fix.sql` (idempotent drop-then-readd, mirroring the pattern already used for `route_latest`'s PK).

### 8.4 Compounding bug: fixing #8.2 and #8.3 interacted with an existing "rest before first cycle" behavior (fixed)
When Squid's data is fresh at restart (skip the sweep, per §8.2), the scheduler used to wait a full `CYCLE_TARGET_MS` before Squid's *first* cycle — harmless when that was ~205 minutes, but after raising it to 8 hours (§8.2), it meant **Squid went completely silent for up to 8 hours after every restart** where it had recent data. Neither change alone caused this; stacking them did. Fixed by resuming after a fixed 1-minute delay instead, matching the other workers' staggered starts.

### 8.5 Open items worth the team's attention

- **`quotes` has no retention/purge policy.** It's grown to ~3.4M rows over ~35 days with nothing bounding it. `fetch_log` got a purge; `quotes` didn't. Continuous aggregates would normally handle this via TSL-licensed rollups, but this deployment runs the Apache edition, so that's not available without either a licensing change or a hand-rolled purge/rollup.
- **No `schema_migrations` tracking** (§7). Every migration file runs on every startup; correctness depends entirely on each file being idempotent by construction. A future migration that isn't written defensively will error on every subsequent restart.
- **The tiered-refresh documentation in `CLAUDE.md` doesn't match the current scheduler code** (§4.2) — worth reconciling one direction or the other so new contributors aren't misled by stale docs, which is exactly how the `route_status` PK issue went unnoticed for as long as it did.
- **Win-rate metrics conflate price-competition wins with sole-coverage wins** (see PRD.md §7) — this isn't a bug, but it's a real trap for anyone (including future BD analysis) who queries this data without separating contested from monopoly routes.
