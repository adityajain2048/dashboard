# SESSION 3: REST API Server

## GOAL
Build the Fastify API server with all query endpoints. By the end, you can `curl` every endpoint and get real data from the database (assuming the fetcher has been running).

## PREREQUISITES
Sessions 1 + 2 must be complete. Verify:
```bash
docker compose up -d db
npx tsc --noEmit
npx vitest run
```

## CONTEXT
Read CLAUDE.md. The API reads from the database populated by the fetcher. It never calls external APIs. All endpoints return JSON with consistent shapes defined in `src/types/index.ts`.

---

## STEP 1: Fastify Server

Create `src/api/server.ts`:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { logger } from '../lib/logger';

export async function buildServer() {
  const app = Fastify({
    logger: false,  // We use our own pino instance
  });

  // CORS (allow all origins in dev)
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
  });

  // Request logging
  app.addHook('onRequest', (req, _reply, done) => {
    logger.debug({ method: req.method, url: req.url }, 'Request');
    done();
  });

  // Error handler
  app.setErrorHandler((error, _req, reply) => {
    logger.error(error, 'Request error');
    reply.status(error.statusCode ?? 500).send({
      error: error.message,
      statusCode: error.statusCode ?? 500,
    });
  });

  // Register route handlers
  await app.register(import('./routes/health'), { prefix: '/api' });
  await app.register(import('./routes/quotes'), { prefix: '/api' });
  await app.register(import('./routes/matrix'), { prefix: '/api' });
  await app.register(import('./routes/opportunities'), { prefix: '/api' });

  return app;
}
```

## STEP 2: Health Endpoint

Create `src/api/routes/health.ts`:

```
GET /api/health

Response: HealthResponse (from types)
{
  status: "ok" | "degraded" | "down",
  uptime: number (seconds since process start),
  lastFetch: {
    tier1: ISO timestamp of newest Tier 1 quote, or null,
    tier2: ...,
    tier3: ...
  },
  db: {
    connected: boolean,
    quoteCount: number (total rows in quotes),
    oldestQuote: ISO timestamp or null
  }
}

Logic:
- status = "ok" if DB connected AND tier1 quote < 5 min old
- status = "degraded" if DB connected but tier1 > 5 min old
- status = "down" if DB not connected
```

Query for lastFetch per tier: join route_latest with the tier info from config, or query fetch_log grouped by tier.

## STEP 3: Quotes Endpoint

Create `src/api/routes/quotes.ts`:

```
GET /api/quotes?src=ethereum&dst=arbitrum&asset=USDC&tier=1000

Query params (all required):
  src:   Chain slug (validate against CHAIN_SLUGS)
  dst:   Chain slug
  asset: "ETH" | "USDC" | "USDT"
  tier:  50 | 1000 | 50000

Response: QuotesResponse (from types)
{
  route: { src, dst, asset, amountTier },
  quotes: [
    {
      source: "lifi",
      bridge: "across",
      outputAmount: "999850000",
      outputUsd: "999.85",
      gasCostUsd: "0.12",
      totalFeeBps: 15,
      totalFeeUsd: "0.15",
      estimatedSeconds: 12,
      rank: 1,
      spreadBps: 0
    },
    ...
  ],
  fetchedAt: "2026-03-02T12:00:00Z",
  quoteCount: 5
}

Validation:
- Return 400 if any param is missing or invalid
- Use Zod schema for query param validation
- Return 200 with empty quotes array if no data (not 404)
```

## STEP 4: Matrix Endpoint

Create `src/api/routes/matrix.ts`:

```
GET /api/matrix?asset=USDC&tier=1000

Query params:
  asset: "ETH" | "USDC" | "USDT" (required)
  tier:  50 | 1000 | 50000 (required)

Response: MatrixResponse (from types)
{
  asset: "USDC",
  amountTier: 1000,
  chains: ["ethereum", "arbitrum", ...],  // HEATMAP_ORDER from chains.ts
  cells: [
    { src: "ethereum", dst: "arbitrum", state: "active", spreadBps: 15, bestBridge: "across", quoteCount: 5, lastSeen: "..." },
    { src: "ethereum", dst: "base", state: "active", ... },
    { src: "xrpl", dst: "osmosis", state: "dead", spreadBps: null, bestBridge: null, quoteCount: 0, lastSeen: null },
    ...
  ],
  stats: { active: 412, dead: 300, stale: 8, singleBridge: 150 }
}

Logic:
- Read from route_status table
- If route_status has no row for a pair, treat as "dead"
- Return cells in HEATMAP_ORDER for both axes (for frontend rendering)
- cells array has exactly 870 entries (30×30 minus 30 diagonal)
```

The matrix endpoint should return ALL 870 cells including dead ones. The frontend uses this to render the full heatmap. If route_status doesn't have a row yet (fetcher hasn't run), fill in dead cells programmatically using the chain list.

## STEP 5: Opportunities Endpoint

Create `src/api/routes/opportunities.ts`:

```
GET /api/opportunities?limit=20&minSpreadBps=30

Query params:
  limit:        Number of results (default 20, max 100)
  minSpreadBps: Minimum spread to include (default 0)
  asset:        Optional filter
  tier:         Optional filter

Response:
{
  opportunities: [
    {
      src: "solana",
      dst: "base",
      asset: "USDC",
      amountTier: 1000,
      spreadBps: 85,
      bestBridge: "debridge",
      bestOutputUsd: "999.15",
      worstBridge: "wormhole",
      worstOutputUsd: "990.65",
      quoteCount: 4,
      lastSeen: "2026-03-02T12:00:00Z"
    },
    ...
  ],
  total: 150
}

Logic:
- Query route_status WHERE state = 'active' AND spread_bps >= minSpreadBps
- Order by spread_bps DESC (widest spread = biggest solver opportunity)
- Apply asset/tier filters if provided
```

## STEP 6: Wire Server Into Entry Point

Update `src/index.ts`:

```typescript
import { buildServer } from './api/server';

async function main() {
  // ... DB connection check ...

  // Start API server
  const server = await buildServer();
  const port = parseInt(process.env.PORT ?? '3000');
  await server.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'API server listening');

  // Start fetcher scheduler
  startScheduler();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

## STEP 7: Integration Test

Create `tests/api/quotes.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/api/server';

describe('API Endpoints', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => { app = await buildServer(); });
  afterAll(async () => { await app.close(); });

  it('GET /api/health returns status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('db');
  });

  it('GET /api/quotes validates params', async () => {
    // Missing params → 400
    const res = await app.inject({ method: 'GET', url: '/api/quotes' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/quotes returns array for valid route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quotes?src=ethereum&dst=arbitrum&asset=USDC&tier=1000'
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('quotes');
    expect(Array.isArray(body.quotes)).toBe(true);
  });

  it('GET /api/matrix returns 870 cells', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/matrix?asset=USDC&tier=1000'
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.cells.length).toBe(870);
    expect(body).toHaveProperty('stats');
  });

  it('GET /api/opportunities returns sorted results', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/opportunities?limit=10'
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('opportunities');
    expect(Array.isArray(body.opportunities)).toBe(true);
  });

  it('rejects invalid chain slug', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/quotes?src=fakechain&dst=arbitrum&asset=USDC&tier=1000'
    });
    expect(res.statusCode).toBe(400);
  });
});
```

## VERIFICATION (Claude Code must run all before completing)

```bash
# 1. TypeScript compiles
npx tsc --noEmit

# 2. All tests pass (unit + integration)
npx vitest run

# 3. Server starts
npx tsx src/index.ts &
SERVER_PID=$!
sleep 3

# 4. Health endpoint
curl -s http://localhost:3000/api/health | jq .
# Expected: { status: "ok" or "degraded", db: { connected: true } }

# 5. Quotes endpoint (valid params)
curl -s "http://localhost:3000/api/quotes?src=ethereum&dst=arbitrum&asset=USDC&tier=1000" | jq .
# Expected: 200 with quotes array (possibly empty if fetcher hasn't run)

# 6. Quotes endpoint (bad params)
curl -s "http://localhost:3000/api/quotes" | jq .
# Expected: 400 error

# 7. Matrix endpoint
curl -s "http://localhost:3000/api/matrix?asset=USDC&tier=1000" | jq '.stats'
# Expected: { active: N, dead: N, stale: N, singleBridge: N }

# 8. Matrix has 870 cells
curl -s "http://localhost:3000/api/matrix?asset=USDC&tier=1000" | jq '.cells | length'
# Expected: 870

# 9. Opportunities endpoint
curl -s "http://localhost:3000/api/opportunities?limit=5" | jq .
# Expected: 200 with opportunities array

# 10. Cleanup
kill $SERVER_PID
```

ALL curl commands must return valid JSON with correct status codes. The data may be empty if the fetcher hasn't populated the DB yet — that's OK. The API structure and validation must be correct.
