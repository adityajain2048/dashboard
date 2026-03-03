# SESSION 4: Bungee + Rubic + Bridge Gap-Fill

## GOAL
Add the remaining two aggregators (Bungee and Rubic) and implement the bridge gap-fill system: after aggregator results arrive, identify which tracked bridges are missing and query them directly. By the end, all 4 aggregators + top direct bridges are fetching.

## PREREQUISITES
Sessions 1-3 complete. Verify:
```bash
npx tsc --noEmit && npx vitest run
curl -s http://localhost:3000/api/health | jq .status
# Should return "ok" or "degraded"
```

## CONTEXT
Read CLAUDE.md. Key rules for this session:
- Rubic dedup: skip routes where `provider` is `"lifi"` or `"rango"` (Rubic sub-aggregates)
- Gap-fill: only call direct bridges that were NOT seen in aggregator results for this route
- Gap-fill priority: high → medium only. Skip "low" and "phase2" in this session.
- All new aggregators/bridges register into the existing registry pattern.

---

## STEP 1: Bungee (Socket) Client

Create `src/fetcher/aggregators/bungee.ts`:

```
Bungee Quote API:
  GET https://api.socket.tech/v2/quote
  Headers:
    API-KEY: (from env BUNGEE_API_KEY — public sandbox key: 72a5b4b0-e727-48be-8aa1-5da9d62fe635)
  Query params:
    fromChainId:      EVM chainId (number)
    toChainId:        EVM chainId (number)
    fromTokenAddress: Token address
    toTokenAddress:   Token address
    fromAmount:       Amount in base units (string)
    userAddress:      Zero address placeholder
    sort:             "output"  (sort by best output)
    singleTxOnly:     "true"

  Response shape:
    {
      success: boolean,
      result: {
        routes: [{
          usedBridgeNames: [string],  // e.g. ["across"]
          toAmount: string,           // Output in base units
          totalGasFeesInUsd: number,
          serviceTime: number,        // seconds
          totalUserTx: number,
          inputValueInUsd: number,
          outputValueInUsd: number
        }]
      }
    }

  NOTE: Bungee returns MULTIPLE routes (one per bridge). Each route entry is a separate quote.
```

Implementation requirements:
1. Bungee only supports EVM chains — for non-EVM chains return empty immediately
2. Loop through `result.routes`, create one NormalizedQuote per route
3. Map `usedBridgeNames[0]` → canonical bridge ID via `resolveBridgeName('bungee', name)`
4. Handle the case where routes array is empty (valid response, no available bridges)
5. Zod validation, register into aggregator registry

## STEP 2: Rubic Client

Create `src/fetcher/aggregators/rubic.ts`:

```
Rubic Quote API:
  POST https://api-v2.rubic.exchange/api/routes/bestvariants
  Headers:
    Content-Type: application/json
  Body:
    {
      "srcTokenAddress": token address or "0x0000000000000000000000000000000000000000" for native,
      "srcTokenBlockchain": "ETH" | "ARBITRUM" | "BASE" | etc. (Rubic blockchain names),
      "srcTokenAmount": amount as string (human-readable, NOT base units — e.g. "1000" for $1000 USDC),
      "dstTokenAddress": token address,
      "dstTokenBlockchain": "ETH" | "ARBITRUM" | etc.,
      "referrer": "rubic.exchange"
    }

  Rubic blockchain identifiers:
    ethereum → "ETH", arbitrum → "ARBITRUM", base → "BASE",
    optimism → "OPTIMISM", polygon → "POLYGON", bsc → "BSC",
    avalanche → "AVALANCHE", solana → "SOLANA", tron → "TRON",
    scroll → "SCROLL", linea → "LINEA", zksync → "ZK_SYNC",
    blast → "BLAST", mantle → "MANTLE", sonic → "FANTOM",
    berachain → "BERACHAIN", starknet → "STARKNET", ton → "TON"

  Response shape:
    [
      {
        "id": string,
        "estimate": {
          "destinationTokenAmount": string,
          "destinationUsdAmount": number,
          "destinationUsdPrice": number,
          "durationInMinutes": number
        },
        "fee": {
          "fixedFee": { "amount": number, "tokenSymbol": string },
          "platformFee": { "percent": number }
        },
        "provider": {
          "id": string  // "lifi", "rango", "symbiosis", "relay", etc.
        },
        "type": "cross-chain"
      },
      ...
    ]

  CRITICAL: Rubic sub-aggregates through LI.FI and Rango.
  DEDUP RULE: Skip any route where provider.id === "lifi" OR provider.id === "rango"
  Keep only: "symbiosis", "relay", "across", "debridge", "mayan", "meson", etc.
```

Implementation requirements:
1. POST request (not GET like others)
2. Amount is human-readable, not base units (different from other aggregators!)
3. Apply the dedup filter: `if (provider.id === 'lifi' || provider.id === 'rango') continue;`
4. Map `provider.id` → canonical bridge ID
5. `durationInMinutes` → convert to seconds
6. Zod validation, register into aggregator registry

## STEP 3: Bridge Gap-Fill System

Create `src/fetcher/bridges/index.ts`:

```typescript
import type { NormalizedQuote, RouteKey } from '../../types';
import { V1_DIRECT_BRIDGES, type BridgeConfig } from '../../config/bridges';

// BridgeFetcher: given a route key, returns quotes from this specific bridge
export type BridgeFetcher = (route: RouteKey) => Promise<NormalizedQuote[]>;

// Registry of direct bridge fetchers
export const bridgeRegistry: Record<string, BridgeFetcher> = {};

export function registerBridge(id: string, fetcher: BridgeFetcher): void {
  bridgeRegistry[id] = fetcher;
}

// gapFill: given which bridges were seen in aggregator results,
// query missing high/medium priority bridges directly
export async function gapFill(
  routeKey: RouteKey,
  bridgesSeen: Set<string>,
  batchId: string,
): Promise<NormalizedQuote[]> {
  const missing = V1_DIRECT_BRIDGES.filter(b =>
    !bridgesSeen.has(b.id) &&
    (b.gapFillPriority === 'high' || b.gapFillPriority === 'medium') &&
    bridgeRegistry[b.id]  // Only if we have a fetcher registered
  );

  if (missing.length === 0) return [];

  const results = await Promise.allSettled(
    missing.map(async (bridge) => {
      try {
        return await bridgeRegistry[bridge.id](routeKey);
      } catch (err) {
        logger.warn({ bridge: bridge.id, error: err }, 'Gap-fill bridge failed');
        return [];
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<NormalizedQuote[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}
```

## STEP 4: Direct Bridge Clients (Top 4 High-Priority)

Implement direct API clients for the 4 highest-priority gap-fill bridges:

### `src/fetcher/bridges/across.ts`
```
GET https://app.across.to/api/suggested-fees
  ?token=TOKEN_ADDRESS
  &destinationChainId=CHAIN_ID
  &originChainId=CHAIN_ID
  &amount=AMOUNT_BASE_UNITS
  &skipAmountLimit=true

Response: { totalRelayFee: { total: string, pct: string }, estimatedFillTimeSec: number, ... }
NOTE: Across only supports EVM chains. Return [] for non-EVM.
Map the fee into our normalized format. Output = input - totalRelayFee.total
```

### `src/fetcher/bridges/relay.ts`
```
POST https://api.relay.link/quote
Body: { user, originChainId, destinationChainId, originCurrency, destinationCurrency, amount, tradeType: "EXACT_INPUT" }
Response: { details: { currencyOut: { amountFormatted, amountUsd }, totalFee: { amountUsd }, timeEstimate } }
```

### `src/fetcher/bridges/mayan.ts`
```
GET https://price-api.mayan.finance/v3/quote
  ?amountIn=AMOUNT_HUMAN_READABLE (e.g. "1000")
  &fromToken=TOKEN_ADDRESS
  &fromChain=CHAIN_NAME (e.g. "solana", "ethereum")
  &toToken=TOKEN_ADDRESS
  &toChain=CHAIN_NAME
Response: { ... effectiveAmountOut, price, eta, ... }
NOTE: Mayan supports Solana ↔ EVM primarily.
```

### `src/fetcher/bridges/meson.ts`
```
POST https://relayer.meson.fi/api/v1/price
Body: { from: "CHAIN:TOKEN", to: "CHAIN:TOKEN", amount: "AMOUNT" }
Response: { result: { ... totalFee, lpFee, serviceFee ... } }
```

Each bridge client:
1. Validates that the route is supported by this bridge (chain type check)
2. Makes the API call with 10s timeout
3. Returns `NormalizedQuote[]` (usually 1 quote, or [] if unsupported)
4. Catches all errors and returns [] (never throws)
5. Registers via `registerBridge(id, fetcher)`

## STEP 5: Wire Gap-Fill Into Pipeline

Update `src/fetcher/pipeline.ts`:

```typescript
import { gapFill } from './bridges';

export async function processRoute(...) {
  // 1. Fetch from all aggregators (existing)
  const { quotes: aggQuotes, bridgesSeen } = await fetchAllAggregators(routeKey, batchId);

  // 2. NEW: Gap-fill missing bridges
  const gapQuotes = await gapFill(routeKey, bridgesSeen, batchId);

  // 3. Combine all quotes
  const allQuotes = [...aggQuotes, ...gapQuotes];

  // 4. Deduplicate + rank (existing)
  const deduped = deduplicateQuotes(allQuotes);
  const ranked = rankQuotes(deduped);

  // ... rest unchanged (insert, upsert, update status, log) ...
}
```

## STEP 6: Import All Modules

Ensure all aggregator and bridge modules are imported (side-effect imports for registration):

In `src/fetcher/aggregators/index.ts`, add at the top:
```typescript
import './lifi';
import './rango';
import './bungee';
import './rubic';
```

In `src/fetcher/bridges/index.ts`, add:
```typescript
import './across';
import './relay';
import './mayan';
import './meson';
```

## STEP 7: Tests

Update `tests/fetcher/normalizer.test.ts` to add:
```typescript
// Test Rubic dedup: verify quotes with source "rubic" and bridge mapped from "lifi" are filtered
```

Create `tests/fetcher/gap-fill.test.ts`:
```typescript
// Mock bridge registry with 2 bridges
// Call gapFill with bridgesSeen = Set containing 1 of them
// Verify: only the missing bridge's fetcher was called
// Verify: returned quotes have source = "direct"
```

## VERIFICATION

```bash
# 1. TypeScript compiles
npx tsc --noEmit

# 2. All tests pass
npx vitest run

# 3. Start app, let fetcher run 1 cycle
npx tsx src/index.ts &
APP_PID=$!
sleep 90  # Wait for 1 Tier 1 cycle

# 4. Check quotes endpoint has data from multiple sources
curl -s "http://localhost:3000/api/quotes?src=ethereum&dst=arbitrum&asset=USDC&tier=1000" | jq '[.quotes[].source] | unique'
# Expected: should show at least 2 different sources (e.g. ["lifi", "rango"])

# 5. Check that multiple bridges appear
curl -s "http://localhost:3000/api/quotes?src=ethereum&dst=arbitrum&asset=USDC&tier=1000" | jq '[.quotes[].bridge] | unique'
# Expected: multiple bridges (across, stargate, hop, etc.)

# 6. Check matrix has active routes
curl -s "http://localhost:3000/api/matrix?asset=USDC&tier=1000" | jq '.stats'
# Expected: active > 0

# 7. Check opportunities
curl -s "http://localhost:3000/api/opportunities?limit=5" | jq '.opportunities | length'
# Expected: > 0 if spreads exist

kill $APP_PID
```

If multiple aggregators return data and gap-fill bridges contribute additional quotes, this session is DONE.
