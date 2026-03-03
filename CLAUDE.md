# Bridge Rate Dashboard

## What This Is
Cross-chain bridge rate comparison engine. Fetches quotes from aggregators (LI.FI, Rango, Bungee, Rubic) and direct bridge APIs, normalizes them, stores in TimescaleDB, exposes via REST API. 30 chains, 870 directional routes, 17 tracked bridges.

## Tech Stack
- **Runtime:** Node 20+ / TypeScript (strict mode)
- **DB:** PostgreSQL 16 + TimescaleDB extension
- **HTTP:** Fastify
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
1. **Aggregator-first, bridge gap-fill.** Always query aggregators first. Only call a bridge directly if it didn't appear in aggregator results for that route.
2. **Rubic dedup.** Skip any Rubic route where `provider` is `"lifi"` or `"rango"`.
3. **Bulk inserts only.** Never INSERT one row at a time. Use pg-format multi-row INSERT.
4. **No floating point for money.** Store amounts as strings (bigint-compatible). Fees in basis points (integer). USD values as numeric(20,8).
5. **Every function is typed.** No `any`. Use discriminated unions for aggregator responses.

## Key Constants
- Refresh: Tier 1 = 60s, Tier 2 = 120s, Tier 3 = 300s
- Amount tiers: 50, 1000, 50000 (USD). **Implementation note:** T1 and T3 use a reduced set (T1: $1K only; T3: $1K only, USDC+ETH) to limit API volume; T2 uses all three amounts and all three assets.
- Assets: ETH, USDC, USDT
- Stale thresholds: T1 > 3min, T2 > 6min, T3 > 15min

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

## LI.FI Key Rotation
3 keys × 200 req/min = 600 req/min capacity. Use round-robin rotation:
```typescript
const LIFI_KEYS = [process.env.LIFI_API_KEY_1, process.env.LIFI_API_KEY_2, process.env.LIFI_API_KEY_3].filter(Boolean);
let lifiKeyIndex = 0;
function getNextLifiKey(): string { return LIFI_KEYS[lifiKeyIndex++ % LIFI_KEYS.length]!; }
```
Call `getNextLifiKey()` on every LI.FI request. This lives in `src/config/bridges.ts` or `src/fetcher/aggregators/lifi.ts`.

## Error Handling
- Aggregator timeout: 10s per call. On timeout, log + skip (don't block batch).
- Bridge API error: log + skip bridge for this cycle. Never retry inline.
- DB write failure: log full batch to `fetch_log` with error. Don't crash.
- All errors go through structured logger (pino). Never console.log.

## Code Style
- Named exports only (no default exports)
- Explicit return types on all public functions
- Zod for runtime validation of external API responses
- Constants in SCREAMING_SNAKE_CASE
- Files < 300 lines. If bigger, split.
