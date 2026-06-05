/**
 * Post-processing step: recalculate inputUsd, outputUsd, and all fee fields
 * using our CoinGecko-sourced prices instead of trusting aggregator USD values.
 *
 * This ensures consistent, accurate USD valuations across all sources (LI.FI, Rango,
 * Bungee, Rubic, direct bridges) using a single price feed.
 */
import type { NormalizedQuote, Asset } from '../types/index.js';
import { getToken } from '../config/tokens.js';
import { computeAmountUsd } from '../lib/amounts.js';
import { logger } from '../lib/logger.js';

/**
 * Sanity bound: if outputUsd > inputUsd × this factor for native-asset routes,
 * the quote is dropped. A bridge cannot create value — any such result means
 * our CoinGecko price for the source or destination chain is stale/wrong.
 * We allow a generous 3% margin (1.03) for price feed lag.
 */
const MAX_OUTPUT_RATIO = 1.03;

/**
 * Maximum plausible fee in basis points (10% = 1000bps).
 * Any quote exceeding this is almost certainly garbage — either from an API
 * returning corrupted data during an outage, a DEX with near-zero liquidity
 * at the requested amount, or a mis-routed cross-asset swap.
 * No legitimate bridge charges >10% for the routes we track; drop these to
 * keep the matrix clean and avoid surfacing misleading spread/fee data.
 */
const MAX_FEE_BPS = 1000;

/** Recalculate USD values for a batch of quotes using CoinGecko prices.
 *  Replaces inputUsd, outputUsd, and all derived fee fields.
 *  Drops quotes whose output exceeds input by more than MAX_OUTPUT_RATIO (price mismatch). */
export function recalcQuotesUsd(quotes: NormalizedQuote[]): NormalizedQuote[] {
  const result: NormalizedQuote[] = [];
  for (const q of quotes) {
    const recalced = recalcSingleQuoteUsd(q);
    if (recalced) result.push(recalced);
  }
  return result;
}

function recalcSingleQuoteUsd(q: NormalizedQuote): NormalizedQuote | null {
  const srcToken = getToken(q.srcChain, q.asset);
  const dstToken = getToken(q.dstChain, q.asset);

  // Cross-asset detection: when asset is 'ETH' (native token slot) and the src/dst
  // chains have DIFFERENT native tokens (e.g. STRD on Stride → ETH on Ethereum via Squid),
  // our CoinGecko prices for each side are independent tokens. Comparing them to derive
  // fees gives wrong results (prices fluctuate independently, output can appear > input).
  // In this case, trust the aggregator's own USD values — they know the actual swap math.
  const isCrossAsset =
    q.asset === 'ETH' &&
    srcToken.address !== dstToken.address &&
    srcToken.address !== 'native' &&
    dstToken.address !== 'native';

  if (isCrossAsset) {
    // Use aggregator-provided USD values directly; only recompute fee bps from those.
    const inUsd = Number(q.inputUsd);
    const outUsd = Number(q.outputUsd);
    if (inUsd <= 0) return q; // can't compute, keep as-is
    // Cross-asset sanity: no bridge gives 50% more than you put in.
    // Threshold of 1.5× catches SEI-style inflation (ratio ~1.98 slipped under
    // the old 2× threshold) while keeping legitimate routes (max seen: ~1.25×).
    if (outUsd > inUsd * 1.5 && outUsd > 10) {
      logger.debug(
        { bridge: q.bridge, src: q.srcChain, dst: q.dstChain, asset: q.asset, inUsd, outUsd },
        'Dropping cross-asset quote: outputUsd > 1.5× inputUsd (price-feed error)'
      );
      return null;
    }
    const totalFeeUsd = Math.max(0, inUsd - outUsd);
    const gasUsd = Number(q.gasCostUsd);
    const protocolFeeUsd = Math.max(0, totalFeeUsd - gasUsd);
    const totalFeeBps = Math.round((10000 * totalFeeUsd) / inUsd);
    const protocolFeeBps = Math.round((10000 * protocolFeeUsd) / inUsd);
    if (totalFeeBps > MAX_FEE_BPS) {
      logger.debug(
        { bridge: q.bridge, src: q.srcChain, dst: q.dstChain, asset: q.asset, totalFeeBps },
        'Dropping quote: fee exceeds MAX_FEE_BPS (bad route/no liquidity)'
      );
      return null;
    }
    return { ...q, totalFeeUsd: totalFeeUsd.toFixed(8), totalFeeBps, protocolFeeBps };
  }

  // Same-asset route (USDC→USDC, ETH→ETH, native→same-native):
  // Recalculate USD from raw token amounts using CoinGecko prices for consistency.
  const inputUsd = computeAmountUsd(q.inputAmount, srcToken.decimals, q.asset, q.srcChain);
  const outputUsd = computeAmountUsd(q.outputAmount, dstToken.decimals, q.asset, q.dstChain);

  const inUsd = Number(inputUsd);
  const outUsd = Number(outputUsd);

  // Sanity: a bridge cannot return more USD than it receives.
  // If it does, our price feed for source or destination is wrong/stale.
  // Drop such quotes to avoid showing misleading negative fees.
  if (inUsd > 0 && outUsd > inUsd * MAX_OUTPUT_RATIO) {
    logger.debug(
      { bridge: q.bridge, src: q.srcChain, dst: q.dstChain, asset: q.asset, inUsd, outUsd },
      'Dropping quote: outputUsd exceeds inputUsd (price feed mismatch)'
    );
    return null;
  }

  // Keep the original gasUsd from the aggregator (we don't have a better source for gas)
  const gasUsd = Number(q.gasCostUsd);

  // Recalculate fee fields from corrected USD values
  const totalFeeUsd = Math.max(0, inUsd - outUsd);
  const protocolFeeUsd = Math.max(0, totalFeeUsd - gasUsd);
  const totalFeeBps = inUsd > 0 ? Math.round((10000 * totalFeeUsd) / inUsd) : 0;
  const protocolFeeBps = inUsd > 0 ? Math.round((10000 * protocolFeeUsd) / inUsd) : 0;

  // Drop quotes with implausibly high fees — these are garbage from API outages,
  // zero-liquidity DEX routes, or corrupted responses.
  if (totalFeeBps > MAX_FEE_BPS) {
    logger.debug(
      { bridge: q.bridge, src: q.srcChain, dst: q.dstChain, asset: q.asset, totalFeeBps },
      'Dropping quote: fee exceeds MAX_FEE_BPS (bad route/no liquidity)'
    );
    return null;
  }

  return {
    ...q,
    inputUsd,
    outputUsd,
    totalFeeUsd: totalFeeUsd.toFixed(8),
    totalFeeBps,
    protocolFeeBps,
  };
}
