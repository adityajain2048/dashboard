# SESSION 1: Project Scaffold + Docker + Database

## GOAL
Set up the complete project skeleton: npm init, TypeScript config, Docker Compose with TimescaleDB, SQL migrations, DB connection pool, logger, and utility functions. By the end, `docker compose up` works and all tables exist.

## CONTEXT
You are building a cross-chain bridge rate comparison dashboard backend. This session is ONLY about project setup and database. No fetching, no API server — those come in later sessions.

Read CLAUDE.md for full project context before starting.

## STEP 1: Initialize Project

Create the project root `bridge-dashboard/` with:

```
package.json with:
  - name: "bridge-dashboard"
  - scripts: dev, build, start, migrate, test, verify:db, verify:fetcher
  - dependencies: pg, pg-format, fastify, pino, pino-pretty, zod, dotenv, uuid
  - devDependencies: typescript, @types/node, @types/pg, @types/uuid, tsx, vitest
tsconfig.json with:
  - strict: true, target: ES2022, module: NodeNext, moduleResolution: NodeNext
  - outDir: dist, rootDir: src
  - paths: { "@/*": ["./src/*"] }
.env.example (copy the one from CLAUDE.md — note LIFI_API_KEY_1/2/3, not single key)
.gitignore (node_modules, dist, .env, *.log)
```

Run `npm install`.

## STEP 2: Docker Compose

Create `docker-compose.yml`:
- Service `db`: image `timescale/timescaledb:latest-pg16`, port 5432:5432, env POSTGRES_USER=bridge, POSTGRES_PASSWORD=bridge, POSTGRES_DB=bridge_dashboard, volume `pgdata:/var/lib/postgresql/data`
- Service `app`: build context `.`, depends_on db, env_file .env, ports 3000:3000 (commented out for now — we run locally in dev)
- Named volume `pgdata`

Create `Dockerfile` (multi-stage):
- Stage 1: node:20-slim, npm ci, npm run build
- Stage 2: node:20-slim, copy dist + node_modules, CMD ["node", "dist/index.js"]

Run `docker compose up -d db` and verify the container starts.

## STEP 3: Copy Config Files

Place these files exactly as provided (they are pre-built, do NOT modify):

- `src/types/index.ts` — from the provided `src_types_index.ts`
- `src/config/chains.ts` — from the provided `src_config_chains.ts`
- `src/config/routes.ts` — from the provided `src_config_routes.ts`
- `src/config/bridges.ts` — from the provided `src_config_bridges.ts`
- `src/config/tokens.ts` — from the provided `src_config_tokens.ts`

These are the source of truth. Do not regenerate them.

## STEP 4: Library Files

Create `src/lib/logger.ts`:
```typescript
// Pino logger with structured JSON in production, pretty in dev
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

Create `src/lib/utils.ts`:
```typescript
// sleep(ms): Promise-based delay
// chunk<T>(arr, size): Split array into chunks
// retry<T>(fn, maxRetries, delayMs): Retry with exponential backoff
// generateBatchId(): UUID v4 string
```
Implement all four. `retry` should accept an async function, retry up to `maxRetries` times with `delayMs * 2^attempt` backoff, and throw the last error if all retries fail.

## STEP 5: Database Connection

Create `src/db/connection.ts`:
```typescript
// Singleton pg Pool using DATABASE_URL from env
// Pool config: max 20, idleTimeoutMillis 30000, connectionTimeoutMillis 5000
// Export: pool (Pool instance), query (shorthand), getClient (for transactions)
// On process exit: pool.end()
```

Create `src/db/migrate.ts`:
```typescript
// Read all .sql files from migrations/ directory (sorted by filename)
// Execute each in a transaction
// Log which migrations ran
// Runnable via: npx tsx src/db/migrate.ts
```

Place the provided `migrations/001_init.sql` in the `migrations/` directory.

## STEP 6: Database Query Functions

Create `src/db/queries.ts` with these typed functions:

```typescript
// insertQuotesBatch(quotes: NormalizedQuote[]): Promise<number>
//   - Uses pg-format for multi-row INSERT into quotes table
//   - Returns number of rows inserted
//   - Handles empty array gracefully (returns 0)

// upsertRouteLatest(quotes: NormalizedQuote[]): Promise<void>
//   - For each unique (src, dst, asset, tier, bridge), keep best output
//   - INSERT ... ON CONFLICT (src_chain, dst_chain, asset, amount_tier, bridge)
//     DO UPDATE SET ... WHERE excluded.output_usd > route_latest.output_usd

// updateRouteStatus(src: string, dst: string, asset: string, tier: number, quotes: NormalizedQuote[]): Promise<void>
//   - Compute state: quotes.length === 0 → 'dead', 1 bridge → 'single-bridge', else 'active'
//   - Compute spread_bps from best/worst output
//   - UPSERT into route_status

// getQuotesForRoute(src, dst, asset, tier): Promise<NormalizedQuote[]>
//   - SELECT from route_latest WHERE match, ORDER BY output_usd DESC

// getMatrixData(asset, tier): Promise<RouteStatus[]>
//   - SELECT * from route_status WHERE asset AND tier

// insertFetchLog(entry: FetchLogEntry): Promise<void>
//   - Single INSERT into fetch_log

// getHealth(): Promise<{ quoteCount, oldestQuote }>
//   - SELECT count(*), min(ts) FROM quotes
```

All functions must use parameterized queries ($1, $2...) — NEVER string interpolation for values. Only use pg-format for the multi-row INSERT column/value template.

## STEP 7: Entry Point Stub

Create `src/index.ts`:
```typescript
import 'dotenv/config';
import { logger } from './lib/logger';
import { pool } from './db/connection';

async function main() {
  logger.info('Bridge Dashboard starting...');

  // Verify DB connection
  const result = await pool.query('SELECT NOW()');
  logger.info({ time: result.rows[0].now }, 'Database connected');

  // TODO: Session 2 will add fetcher scheduler
  // TODO: Session 3 will add API server

  logger.info('Ready. Ctrl+C to exit.');
}

main().catch((err) => {
  logger.fatal(err, 'Fatal error');
  process.exit(1);
});
```

## STEP 8: Verification Script

Create `scripts/verify-db.ts`:
```typescript
// 1. Connect to DB
// 2. Run migration (src/db/migrate.ts logic)
// 3. Check all expected tables exist: quotes, route_latest, route_status, fetch_log
// 4. Check hypertables: SELECT * FROM timescaledb_information.hypertables
// 5. Check continuous aggregates exist: quotes_hourly, bridge_daily
// 6. Insert a test quote row, read it back, delete it
// 7. Print ✅ or ❌ for each check
// 8. Exit 0 if all pass, 1 if any fail
```

Add to package.json scripts: `"verify:db": "tsx scripts/verify-db.ts"`

## STEP 9: Config Validation Test

Create `tests/config/routes.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ALL_ROUTES, TIER1_ROUTES, TIER2_ROUTES, TIER3_ROUTES } from '../../src/config/routes';
import { CHAIN_SLUGS } from '../../src/config/chains';
import { TOKENS, getToken } from '../../src/config/tokens';

describe('Route Config', () => {
  it('generates exactly 870 routes (30 chains × 29 destinations)', () => {
    expect(ALL_ROUTES.length).toBe(870);
  });

  it('has no self-routes', () => {
    const selfRoutes = ALL_ROUTES.filter(r => r.src === r.dst);
    expect(selfRoutes.length).toBe(0);
  });

  it('covers all chain pairs bidirectionally', () => {
    const pairs = new Set(ALL_ROUTES.map(r => `${r.src}:${r.dst}`));
    for (const a of CHAIN_SLUGS) {
      for (const b of CHAIN_SLUGS) {
        if (a !== b) expect(pairs.has(`${a}:${b}`)).toBe(true);
      }
    }
  });

  it('tier counts are reasonable', () => {
    // Tier 1 should be biggest explicit set (high-volume pairs)
    expect(TIER1_ROUTES.length).toBeGreaterThan(50);
    expect(TIER1_ROUTES.length).toBeLessThan(200);
    // Tier 2 should cover Bitcoin, Monad, MegaETH, etc.
    expect(TIER2_ROUTES.length).toBeGreaterThan(50);
    // Tier 3 should be the remainder
    expect(TIER3_ROUTES.length).toBeGreaterThan(200);
    // All tiers sum to 870
    expect(TIER1_ROUTES.length + TIER2_ROUTES.length + TIER3_ROUTES.length).toBe(870);
  });
});

describe('Chain Config', () => {
  it('has exactly 30 chains', () => {
    expect(CHAIN_SLUGS.length).toBe(30);
  });
});

describe('Token Config', () => {
  it('has 3 entries per chain (90 total)', () => {
    expect(TOKENS.length).toBe(90);
  });

  it('getToken works for known chain+asset', () => {
    const eth_usdc = getToken('ethereum', 'USDC');
    expect(eth_usdc.decimals).toBe(6);
    expect(eth_usdc.address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  });
});
```

## VERIFICATION (Claude Code must run all of these before completing)

```bash
# 1. TypeScript compiles
npx tsc --noEmit

# 2. Tests pass
npx vitest run

# 3. Docker DB is running
docker compose up -d db
sleep 3

# 4. Migration runs
npx tsx src/db/migrate.ts

# 5. Verification script passes
npm run verify:db

# 6. Entry point starts and connects
timeout 5 npx tsx src/index.ts || true  # Should print "Database connected" then we kill it
```

ALL SIX must succeed. If any fail, fix and re-run before completing the session.
