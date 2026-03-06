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

  // Compute USD from base amounts using CoinGecko prices
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

  return {
    ...q,
    inputUsd,
    outputUsd,
    totalFeeUsd: totalFeeUsd.toFixed(8),
    totalFeeBps,
    protocolFeeBps,
  };
}
