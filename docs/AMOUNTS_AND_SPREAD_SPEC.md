# Amounts & Spread — Specification

## 1. What We Have (Data Sources)

### 1.1 Input (Always Known)

| Field | Value | Notes |
|-------|-------|-------|
| `amountTier` | 50, 1000, or 50000 | USD value user "sends" |
| `inputUsd` | = amountTier | We assume input is exactly the tier |
| `srcChain`, `dstChain`, `asset` | From route | ETH = native token of that chain |

### 1.2 What Each Aggregator Returns

| Aggregator | outputAmount | outputUsd | Notes |
|------------|--------------|-----------|-------|
| **LI.FI** | `toAmount` (base units) | `toAmountUSD` | Uses their own pricing |
| **Rango** | `result.outputAmount` (base units) | `outputAmount / 10^decimals * to.usdPrice` | Rango provides `from.to.usdPrice` per swap; we use first swap's `to` |
| **Bungee** | `toAmount` (base units) | Socket's `outputValueInUsd` OR our `outputAmountToUsd()` | Fallback when Socket's value is outside 50–150% of input |
| **Rubic** | `destinationTokenAmount` (base units) | `destUsd` from their API | |

### 1.3 Our Fallback: outputAmountToUsd()

When aggregator doesn't provide reliable outputUsd (Bungee fallback, etc.):

```
outputUsd = (outputAmount / 10^decimals) * price
```

- **USDC/USDT**: price = 1
- **ETH (native)**: price = `getNativePriceUsd(dstChain)` — CoinGecko or fallback

### 1.4 Chain → Native Token & Decimals

| Chain | Native | Decimals | CoinGecko ID | Fallback Price |
|-------|--------|----------|--------------|----------------|
| Ethereum, Arbitrum, Base, etc. | ETH | 18 | ethereum | 2500 |
| Polygon | POL | 18 | matic-network | 0.5 |
| BSC | BNB | 18 | binancecoin | 700 |
| Avalanche | AVAX | 18 | avalanche-2 | 35 |
| Sonic | S | 18 | **ethereum** ⚠️ | 2500 |
| Mantle | MNT | 18 | mantle | 0.6 |
| Hyperliquid | HYPE | 18 | hyperliquid | 25 |
| Berachain | BERA | 18 | ethereum | 0.1 |
| Solana | SOL | 9 | solana | — |
| Bitcoin | BTC | 8 | bitcoin | — |

**Issue**: Sonic maps to `ethereum` in CoinGecko — we use ETH price for S token. Wrong.

### 1.5 Stablecoin Decimals by Chain

| Chain | USDC | USDT |
|-------|------|------|
| Most EVM | 6 | 6 |
| BSC | **18** | **18** (Binance-pegged) |

---

## 2. What We Show (UI)

### 2.1 Route Explorer (Quote List)

| Column | Source | Calculation |
|--------|--------|-------------|
| **Output USD** | `q.outputUsd` | Stored from aggregator or our computation |
| **Output amount** | `q.outputAmount` | `formatTokenAmount(outputAmount, asset, dstChain)` |
| **Fee** | `q.totalFeeUsd` | `inputUsd - outputUsd` |
| **Spread** | `q.spreadBps` | See §3.2 |

### 2.2 formatTokenAmount(rawAmount, asset, chain)

```
decimals = getDecimals(chain, asset)
if rawAmount >= 10^decimals → treat as base units, divide by 10^decimals
else → treat as human (some aggregators return human-readable)
```

**Problem**: If aggregator returns base units but we use wrong decimals, we misformat.  
Example: BSC USDC is 18 decimals. If aggregator returns `998500000000000000000` (998.5), we divide by 10^18 → correct. If aggregator returns `998500000` (6 decimals, wrong for BSC), we'd treat as human (< 10^18) → show 998,500,000. Wrong.

**Conclusion**: Aggregators must return base units. If not, we need per-aggregator format handling.

---

## 3. Spread Calculation

### 3.1 Two Different Concepts

| Term | Meaning | Formula |
|------|---------|---------|
| **best_fee_bps** | Fee of the best quote | `(inputUsd - bestOutputUsd) / inputUsd * 10000` |
| **spread_bps** | How much worse each quote is vs best | `(bestOutputUsd - worstOutputUsd) / bestOutputUsd * 10000` |

### 3.2 Per-Quote spreadBps (Normalizer)

After ranking all quotes by outputUsd descending:

```
bestOutput = max(quotes.outputUsd)
spreadBps(quote) = (bestOutput - quote.outputUsd) / bestOutput * 10000
```

### 3.3 Route-Level spread_bps (Route Status)

```
spread_bps = (bestOutputUsd - worstOutputUsd) / bestOutputUsd * 10000
```

### 3.4 Matrix Display

Shows `best_fee_bps` (best quote's fee). Fallback to `spread_bps` when `best_fee_bps` is null.

---

## 4. Root Causes of Wrong Amounts

### 4.1 Price Issues (outputUsd wrong)

| Chain | Cause | Fix |
|-------|-------|-----|
| Sonic | `CHAIN_TO_COINGECKO_ID['sonic'] = 'ethereum'` | Map to Sonic S token if listed, else use fallback |
| Polygon, Avalanche, BSC, Mantle, Hyperliquid | CoinGecko cache empty or rate-limited | Use `CHAIN_FALLBACK_NATIVE_PRICE` |
| All | Fallback prices may be stale | Document and refresh periodically |

### 4.2 Decimal Issues (outputAmount display wrong)

| Chain | Cause | Fix |
|-------|-------|-----|
| BSC | USDC/USDT are 18 decimals | `getDecimals(bsc, USDC) = 18` ✓ |
| Solana | SOL is 9 decimals | `getDecimals(solana, ETH) = 9` ✓ |
| All | Aggregator returns human instead of base | Heuristic: if num >= 10^decimals treat as base |

### 4.3 Aggregator-Specific

| Aggregator | Known issue | Mitigation |
|------------|-------------|------------|
| Bungee | Socket's outputValueInUsd wrong for BNB, AVAX, etc. | Use our outputAmountToUsd when 50–150% check fails |
| Rango | outputPrice from first swap may be 0 for some chains | Fallback to our computation when outputUsd = 0 |
| LI.FI | Generally reliable | Trust toAmountUSD |

---

## 5. Recommended Fixes

### 5.1 Always treat outputAmount as base units

Remove the heuristic. Assume aggregators return base units. If we get garbage, the aggregator is wrong.

```ts
// formatTokenAmount: always divide by 10^decimals
const human = Number(rawAmount) / 10 ** getDecimals(chain, asset);
```

### 5.2 Fix Sonic native price

- Add Sonic S to CoinGecko mapping if it exists
- Or use a dedicated fallback (e.g. 0.01 for S if not listed)

### 5.3 Single source of truth for outputUsd

When aggregator provides outputUsd:
- **LI.FI, Rubic**: Use as-is (they compute correctly)
- **Rango**: Use when `outputPrice > 0`; else compute from outputAmount + our price
- **Bungee**: Use Socket when 50–150% of input; else compute from outputAmount + our price

For our computation, ensure `getNativePriceUsd(dstChain)` returns the **destination chain's native token price**, not a generic fallback.

### 5.4 Spread consistency

- **best_fee_bps** = fee of best quote (what user pays)
- **spread_bps** = range between best and worst (for comparison)

Matrix should show best_fee_bps. Route Explorer should show per-quote spreadBps.

---

## 6. Summary

| What | Where | Fix |
|------|-------|-----|
| outputUsd wrong | Bungee fallback, Rango when price=0 | Correct native prices per chain |
| outputAmount display wrong | formatTokenAmount | Always treat as base units; verify decimals config |
| Sonic | prices.ts | Map to correct CoinGecko id or fallback |
| BSC USDC/USDT | decimals config | Already 18 ✓ |
