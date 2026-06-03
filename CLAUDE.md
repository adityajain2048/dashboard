# Bridge Rate Dashboard

## What This Is
Cross-chain bridge rate comparison engine. Fetches quotes from aggregators (LI.FI, Rango, Bungee, Rubic, Squid) and direct bridge APIs, normalizes them, stores in TimescaleDB, exposes via REST API. 56 chains, 3,080 directional routes (56×55), 5 aggregators, 17 tracked bridges.

## Tech Stack
- **Runtime:** Node 20+ / TypeScript (strict mode)
- **DB:** PostgreSQL 16 + TimescaleDB extension
- **HTTP:** Fastify
- **Rate limiting:** Bottleneck (adaptive, per-key) + p-retry for transient retries
- **Driver:** pg (node-postgres) + pg-format for bulk inserts
- **Container:** Docker Compose (TimescaleDB + app)
- **No ORM.** Raw SQL with parameterized queries. Type-safe wrappers in `src/db/queries.ts`.

## Project Structure
```
src/
  config/         # Static typed configs — chains, routes, bridges, tokens
  types/          # Shared TypeScript interfaces (NormalizedQuote, Route, etc.)
  db/             # Connection pool, migrations, typed query functions
  fetcher/        # Scheduler + aggregator/bridge fetch + normalizer
    aggregators/  # One file per aggregator (lifi.ts, rango.ts, etc.)
    bridges/      # One file per direct bridge API (across.ts, stargate.ts, etc.)
  api/            # Fastify server + route handlers
```

## Architecture Rules
1. **Aggregator-first, bridge gap-fill.** Always query aggregators first. Only call a bridge directly if it didn't appear in aggregator results for that route (`gapFill` in `src/fetcher/bridges/index.ts`, runs inside every `processRoute`). Scheduler-level flow: a one-time **Squid sweep** of all tasks on startup, then **gap-fill cycles** (non-Squid aggregators) for routes Squid doesn't cover, plus recurring T1/T2/T3 tier cycles.
2. **Rubic dedup.** Skip any Rubic route where `provider` is `"lifi"` or `"rango"`.
3. **Bulk inserts only.** Never INSERT one row at a time. Use pg-format multi-row INSERT.
4. **No floating point for money.** Store amounts as strings (bigint-compatible). Fees in basis points (integer). USD values as numeric(20,8).
5. **Every function is typed.** No `any`. Use discriminated unions for aggregator responses.

## Key Constants
- Refresh: Tier 1 = 5min, Tier 2 = 12min, Tier 3 = 40min (`REFRESH_INTERVALS` in `src/config/routes.ts`)
- Amount tiers: 50, 1000, 50000 (USD). All tiers use all three amounts. T3 uses a reduced asset set (USDC + ETH only, no USDT) to limit API volume on long-tail routes.
- Assets: ETH, USDC, USDT
- Tasks per cycle: T1 ≈ 648, T2 ≈ 714, T3 ≈ 17,214; full Squid sweep ≈ 18,576. A task = one (src, dst, asset, amountTier); each task fans out to multiple provider API calls.
- Stale threshold: > 47min for all tiers (one full refresh cycle); before that, routes stay active with live data

## Build & Run
```bash
docker compose up -d                    # Start TimescaleDB
npm run migrate                         # Run SQL migrations
npm run dev                             # Start fetcher + API (ts-node)
npm run build && npm start              # Production build
npm test                                # Run tests
```

## Testing
- Unit tests: `src/**/*.test.ts` (vitest)
- Integration tests: `src/**/*.integration.test.ts` (needs DB)
- Verify fetcher: `npm run verify:fetcher` — fetches 1 route, prints normalized quotes
- Verify DB: `npm run verify:db` — checks tables exist, inserts test row, reads back

## Environment Variables (.env)
```
DATABASE_URL=postgresql://bridge:bridge@localhost:5432/bridge_dashboard
LIFI_API_KEY_1=c4efa07b-1833-4be8-805c-f3c19c9505ca.02ed2862-2d19-4c86-8c7f-7bce482eb73d
LIFI_API_KEY_2=db172bc8-daef-4277-8480-8541ea31aa40.371afcda-2f75-4e0a-ae4a-53ba6a68979a
LIFI_API_KEY_3=0f38064d-076f-4f22-a938-44bbd0f08aeb.139194ff-d0cd-415f-9450-834b3b4f9a58
RANGO_API_KEY=c6381a79-2817-4602-83bf-6a641a409e32
BUNGEE_API_KEY=72a5b4b0-e727-48be-8aa1-5da9d62fe635
RUBIC_API_KEY=
# Native token prices: fetched from CoinGecko (no key) at the start of each cycle; fallback 2500 if fetch fails.
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

## Rate Limiting (adaptive, `src/lib/rate-limiter.ts`)
Every aggregator/bridge is rate-limited via **Bottleneck** wrapped in a `KeyedAdaptiveLimiter`:
- **LI.FI** uses `KeyedAdaptiveLimiter` with **3 keys** (200 rpm each = 600 rpm total). Key selection is **least-loaded / round-robin at the limiter layer** — there is no longer a manual `getNextLifiKey()`; just call the LI.FI fetcher and the limiter picks the key.
- Every other source uses `KeyedAdaptiveLimiter` with a single (`''`) key.
- The limiter **adapts**: on 429 it drops its reservoir/rate and pauses, then **recovers** the rate as calls succeed (the `… rate recovering → X req/s` logs). Limiters are named `<source>:<keyTier>` (e.g. `squid:anon`, `hop:anon`).

## Error Handling
- Aggregator timeout: 30s hard cap on the entire p-retry loop per call (`AGGREGATOR_TIMEOUT_MS`; LI.FI can be slow on complex routes). On timeout, log + skip (don't block batch).
- Retries: transient failures (network, 5xx) retry via **p-retry** (2 retries, jittered backoff). 400/404 = no_route and 429 = rate-limit are NOT retried and do NOT trip the circuit/skip logic.
- Bridge API error: log + skip bridge for this cycle.
- DB write failure: log full batch to `fetch_log` with error. Don't crash.
- All errors go through structured logger (pino). Never console.log.

## Code Style
- Named exports only (no default exports)
- Explicit return types on all public functions
- Zod for runtime validation of external API responses
- Constants in SCREAMING_SNAKE_CASE
- Files < 300 lines. If bigger, split.
