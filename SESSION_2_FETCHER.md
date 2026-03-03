# SESSION 2: Fetcher Core — LI.FI + Rango + Scheduler

## GOAL
Build the quote fetching pipeline: LI.FI and Rango aggregator clients, response normalizer, bulk DB writer, and the 3-tier scheduler. By the end, the fetcher runs continuously and quotes land in the database.

## PREREQUISITES
Session 1 must be complete. Verify:
```bash
docker compose up -d db
npx tsx src/db/migrate.ts
npx vitest run  # Config tests pass
```

## CONTEXT
Read CLAUDE.md for architecture rules. Key reminders:
- Aggregator-first. No direct bridge calls in this session.
- Bulk inserts only (pg-format).
- No `any` types. Use Zod for runtime validation of external responses.
- 10-second timeout per aggregator call.
- Log every API call to fetch_log (success, error, timeout).

---

## STEP 1: Aggregator Registry

Create `src/fetcher/aggregators/index.ts`:

```typescript
import type { NormalizedQuote, RouteKey, AggregatorId } from '../../types';

// AggregatorFetcher: given a route key, returns normalized quotes
export type AggregatorFetcher = (route: RouteKey) => Promise<NormalizedQuote[]>;

// Registry maps aggregator ID → fetch function
export const aggregatorRegistry: Record<AggregatorId, AggregatorFetcher> = {} as any;

// registerAggregator: called by each aggregator module at import time
export function registerAggregator(id: AggregatorId, fetcher: AggregatorFetcher): void {
  aggregatorRegistry[id] = fetcher;
}

// fetchAllAggregators: fan-out to all registered aggregators for a route
// Returns: { quotes: NormalizedQuote[], bridgesSeen: Set<string> }
// Each aggregator call is wrapped in try/catch with timeout
// Failed aggregators are logged but don't block others
export async function fetchAllAggregators(route: RouteKey, batchId: string): Promise<{
  quotes: NormalizedQuote[];
  bridgesSeen: Set<string>;
}> { ... }
```

Important: `fetchAllAggregators` must run all aggregators in **parallel** using `Promise.allSettled`, not sequentially.

## STEP 2: LI.FI Client

Create `src/fetcher/aggregators/lifi.ts`:

**KEY ROTATION:** We have 3 LI.FI API keys (200 req/min each = 600 req/min total). Implement round-robin rotation:

```typescript
const LIFI_KEYS = [
  process.env.LIFI_API_KEY_1,
  process.env.LIFI_API_KEY_2,
  process.env.LIFI_API_KEY_3,
].filter(Boolean) as string[];

let lifiKeyIndex = 0;
function getNextLifiKey(): string {
  const key = LIFI_KEYS[lifiKeyIndex % LIFI_KEYS.length];
  lifiKeyIndex++;
  return key;
}
```

Each request to LI.FI must call `getNextLifiKey()` and set the `x-lifi-api-key` header with the returned key. This distributes load evenly across all 3 keys.

```
LI.FI Quote API:
  GET https://li.quest/v1/quote
  Query params:
    fromChain:    EVM chainId (number) or chain key for non-EVM
    toChain:      EVM chainId (number) or chain key for non-EVM
    fromToken:    Token address on source chain
    toToken:      Token address on destination chain
    fromAmount:   Amount in base units (string)
    fromAddress:  Use a zero address placeholder: 0x0000000000000000000000000000000000000000
    order:        "RECOMMENDED"
    allowExchanges: [] (empty = bridge only, no DEX swaps)

  Headers:
    x-lifi-api-key: (rotated via getNextLifiKey() — NEVER hardcode a single key)

  Response shape (validate with Zod):
    {
      estimate: {
        toAmount: string,           // Output in base units
        toAmountUSD: string,
        fromAmount: string,
        fromAmountUSD: string,
        gasCosts: [{ amountUSD: string }],
        feeCosts: [{ amountUSD: string, percentage: string }],
        executionDuration: number   // seconds
      },
      action: {
        fromToken: { symbol, decimals, address },
        toToken: { symbol, decimals, address }
      },
      tool: string,                 // Bridge name (e.g. "across", "stargate")
      toolDetails: { name: string, key: string }
    }
```

Implementation requirements:
1. Import `getToken` from config to get addresses and decimals
2. Import `getChain` from config to get chainId
3. Convert USD amount tier to base units: `amountTier * 10^decimals` (use BigInt math for precision)
4. For non-EVM chains that LI.FI doesn't support (bitcoin, tron, osmosis, injective, xrpl, ton), return empty array immediately — don't call the API
5. Map `tool` → canonical bridge ID using `resolveBridgeName('lifi', tool)`
6. Create a Zod schema for the response and parse it. If parse fails, log warning and return []
7. Register via `registerAggregator('lifi', fetchLifi)`

Also implement `GET https://li.quest/v1/connections` variant:
- Sometimes `/quote` fails for a pair but `/connections` can tell us IF a route is supported
- Use `/quote` as primary, fall back to checking `/connections` only if needed for route_status

## STEP 3: Rango Client

Create `src/fetcher/aggregators/rango.ts`:

```
Rango Quote API:
  GET https://api.rango.exchange/routing/best
  Query params:
    apiKey:             (from env, or use "free" for limited access)
    from:               Blockchain.TOKEN_SYMBOL (e.g. "ETH.USDC", "ARBITRUM.USDC", "SOLANA.SOL")
    to:                 Blockchain.TOKEN_SYMBOL
    amount:             Amount in base units (string)
    slippage:           "1" (1%)
    disableEstimate:    "false"

  Rango blockchain identifiers (map from our chain slugs):
    ethereum → "ETH", arbitrum → "ARBITRUM", base → "BASE", optimism → "OPTIMISM",
    polygon → "POLYGON", bsc → "BSC", avalanche → "AVAX", solana → "SOLANA",
    bitcoin → "BTC", tron → "TRON", scroll → "SCROLL", linea → "LINEA",
    zksync → "ZKEVM", blast → "BLAST", mantle → "MANTLE", sonic → "FANTOM" (verify),
    berachain → "BERACHAIN", sei → "SEI", monad → "MONAD", megaeth → "MEGAETH",
    sui → "SUI", aptos → "APTOS", osmosis → "OSMOSIS", injective → "INJECTIVE",
    starknet → "STARKNET", ton → "TON", hyperliquid → "HYPEREVM",
    abstract → "ABSTRACT", unichain → "UNICHAIN", xrpl → "XRPL"

  Response shape (validate with Zod):
    {
      result: {
        outputAmount: string,
        outputAmountUsd: string | null,
        requestAmount: string,
        swaps: [{
          from: { blockchain, symbol, address, decimals },
          to: { blockchain, symbol, address, decimals },
          swapperGroup: string,       // Bridge name (e.g. "Across", "Symbiosis")
          swapperType: "BRIDGE",
          estimatedTimeInSeconds: number
        }],
        fee: [{ expenseType: "FROM_SOURCE_WALLET" | ..., amount: string, asset: {...} }]
      },
      error: string | null
    }
```

Implementation requirements:
1. Build Rango-style `from`/`to` strings: `BLOCKCHAIN.ASSET_SYMBOL`
2. For non-supported chains, return empty immediately
3. Extract bridge name from `swaps[0].swapperGroup`, map via `resolveBridgeName('rango', name)`
4. Calculate fees from the `fee` array
5. `estimatedTimeInSeconds` from the swap entry
6. Zod schema validation, log + skip on failure
7. Register via `registerAggregator('rango', fetchRango)`

## STEP 4: Normalizer

Create `src/fetcher/normalizer.ts`:

This module is NOT about parsing API responses (that's done inside each aggregator file). This is about post-processing the collected quotes for a single route:

```typescript
export function rankQuotes(quotes: NormalizedQuote[]): NormalizedQuote[] {
  // 1. Sort by output_usd descending (highest output = best deal)
  // 2. Assign rank: 1, 2, 3... (ties get same rank)
  // 3. Compute spread_bps for each: ((best_output - this_output) / best_output) * 10000
  // 4. Return the ranked array
}

export function deduplicateQuotes(quotes: NormalizedQuote[]): NormalizedQuote[] {
  // If same bridge appears from multiple sources, keep the one with higher output
  // Key: bridge (not source) — e.g. if "across" appears from both lifi and rango, keep better one
}
```

## STEP 5: Pipeline (per-route orchestrator)

Create `src/fetcher/pipeline.ts`:

```typescript
import { fetchAllAggregators } from './aggregators';
import { rankQuotes, deduplicateQuotes } from './normalizer';
import { insertQuotesBatch, upsertRouteLatest, updateRouteStatus, insertFetchLog } from '../db/queries';

// processRoute: the core function called by the scheduler for each route+asset+tier combo
export async function processRoute(
  src: string,
  dst: string,
  asset: Asset,
  amountTier: number,
  batchId: string,
): Promise<void> {
  const startMs = Date.now();
  const routeKey: RouteKey = { src, dst, asset, amountTier };

  // 1. Fetch from all aggregators (parallel)
  const { quotes: rawQuotes, bridgesSeen } = await fetchAllAggregators(routeKey, batchId);

  // 2. Deduplicate (same bridge from multiple aggregators → keep best)
  const deduped = deduplicateQuotes(rawQuotes);

  // 3. Rank by output
  const ranked = rankQuotes(deduped);

  // 4. Bulk insert into quotes table
  if (ranked.length > 0) {
    await insertQuotesBatch(ranked);
  }

  // 5. Upsert route_latest
  if (ranked.length > 0) {
    await upsertRouteLatest(ranked);
  }

  // 6. Update route_status
  await updateRouteStatus(src, dst, asset, amountTier, ranked);

  // 7. Log
  const elapsed = Date.now() - startMs;
  logger.info({ src, dst, asset, amountTier, quotes: ranked.length, ms: elapsed }, 'Route processed');
}
```

## STEP 6: Scheduler

Create `src/fetcher/scheduler.ts`:

```typescript
import { TIER1_ROUTES, TIER2_ROUTES, TIER3_ROUTES, REFRESH_INTERVALS } from '../config/routes';
import { processRoute } from './pipeline';
import { generateBatchId } from '../lib/utils';
import { chunk } from '../lib/utils';

const CONCURRENCY = 10;  // Max simultaneous route fetches per tier cycle

export async function runTierCycle(tier: RefreshTier): Promise<void> {
  const routes = tier === 1 ? TIER1_ROUTES : tier === 2 ? TIER2_ROUTES : TIER3_ROUTES;
  const batchId = generateBatchId();

  logger.info({ tier, routes: routes.length, batchId }, `Tier ${tier} cycle starting`);

  // For each route, expand into route × asset × amountTier combinations
  const tasks: Array<{ src: string; dst: string; asset: Asset; amountTier: number }> = [];
  for (const route of routes) {
    for (const asset of route.assets) {
      for (const tier of route.amountTiers) {
        tasks.push({ src: route.src, dst: route.dst, asset, amountTier: tier });
      }
    }
  }

  // Process in chunks with concurrency limit
  for (const batch of chunk(tasks, CONCURRENCY)) {
    await Promise.allSettled(
      batch.map(t => processRoute(t.src, t.dst, t.asset, t.amountTier, batchId))
    );
  }

  logger.info({ tier, tasks: tasks.length, batchId }, `Tier ${tier} cycle complete`);
}

export function startScheduler(): void {
  // Run each tier on its own interval
  // Tier 1: every 60s
  // Tier 2: every 120s
  // Tier 3: every 300s
  // IMPORTANT: Stagger start times so they don't all fire at once
  //   Tier 1: starts immediately
  //   Tier 2: starts after 20s
  //   Tier 3: starts after 40s

  logger.info('Scheduler starting...');

  // Initial runs (staggered)
  setTimeout(() => { runTierCycle(1); }, 0);
  setTimeout(() => { runTierCycle(2); }, 20_000);
  setTimeout(() => { runTierCycle(3); }, 40_000);

  // Recurring
  setInterval(() => { runTierCycle(1); }, REFRESH_INTERVALS[1]);
  setInterval(() => { runTierCycle(2); }, REFRESH_INTERVALS[2]);
  setInterval(() => { runTierCycle(3); }, REFRESH_INTERVALS[3]);
}
```

## STEP 7: Wire Into Entry Point

Update `src/index.ts`:
```typescript
import { startScheduler } from './fetcher/scheduler';

async function main() {
  // ... existing DB connection check ...
  startScheduler();
  logger.info('Fetcher scheduler started. Ctrl+C to exit.');
}
```

## STEP 8: Verification Script

Create `scripts/verify-fetcher.ts`:

```typescript
// 1. Process a SINGLE route: ethereum → arbitrum, USDC, $1000
// 2. Call processRoute directly (not the scheduler)
// 3. Print all returned quotes in a table:
//    | Source | Bridge | Output USDC | Fee (bps) | Time (s) | Rank |
// 4. Query route_latest for this route and print
// 5. Query route_status for this route and print
// 6. Exit 0 if at least 1 quote was found, 1 if none
```

Add to package.json: `"verify:fetcher": "tsx scripts/verify-fetcher.ts"`

## STEP 9: Unit Tests

Create `tests/fetcher/normalizer.test.ts`:
```typescript
// Test rankQuotes:
//   - Input: 3 quotes with different output_usd values
//   - Verify: rank 1 has highest output, spread_bps for rank 1 is 0
//   - Verify: spread_bps increases for lower ranks

// Test deduplicateQuotes:
//   - Input: 2 quotes for same bridge ("across") from different sources
//   - Verify: only 1 quote remains (the one with higher output_usd)
```

Create `tests/fetcher/pipeline.test.ts`:
```typescript
// Mock the aggregator registry to return known quotes
// Call processRoute
// Verify: insertQuotesBatch was called with ranked quotes
// Verify: upsertRouteLatest was called
// Verify: updateRouteStatus was called
```

## VERIFICATION (Claude Code must run all before completing)

```bash
# 1. TypeScript compiles cleanly
npx tsc --noEmit

# 2. Unit tests pass
npx vitest run

# 3. DB is running and migrated
docker compose up -d db
npx tsx src/db/migrate.ts

# 4. Fetcher verification (needs network access for real API calls)
npm run verify:fetcher
# Expected: prints a table with at least 1 quote for ETH→ARB USDC $1000
# If network is unavailable, this is OK — the test should still exit cleanly with a "no quotes" message

# 5. Full app starts without crash
timeout 15 npx tsx src/index.ts 2>&1 | head -20
# Expected: "Database connected", "Scheduler starting...", "Tier 1 cycle starting"
```

If verify:fetcher returns quotes, this session is DONE. If network is unavailable, verify the pipeline logic passes unit tests and move on.
