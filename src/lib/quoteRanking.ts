/**
 * Canonical quote scoring helpers.
 *
 * Single source of truth for "which quote is best" used by every endpoint:
 * /api/quotes (re-rank at query time), /api/matrix (compute from route_latest),
 * /api/opportunities (compute best/worst per route).
 *
 * Canonical ordering:
 *   1. Highest outputUsd  (primary)
 *   2. Lowest totalFeeBps (tie-breaker 1)
 *   3. Lowest estimatedSeconds (tie-breaker 2)
 *   4. Alphabetical source+bridge (deterministic tie-breaker 3)
 */

export interface RankableQuote {
  bridge: string;
  source: string;
  outputUsd: string | number;
  totalFeeBps: number;
  estimatedSeconds?: number;
}

/**
 * Canonical comparator.
 * Returns negative if `a` is better, positive if `b` is better, 0 if equal.
 */
export function compareQuotesByOutput(a: RankableQuote, b: RankableQuote): number {
  const outA = Number(a.outputUsd);
  const outB = Number(b.outputUsd);

  // 1. Higher output wins
  if (Math.abs(outB - outA) > 0.0001) return outB > outA ? 1 : -1;

  // 2. Lower fee wins
  const feeDiff = (a.totalFeeBps ?? 0) - (b.totalFeeBps ?? 0);
  if (feeDiff !== 0) return feeDiff;

  // 3. Lower time wins
  const timeDiff = (a.estimatedSeconds ?? 0) - (b.estimatedSeconds ?? 0);
  if (timeDiff !== 0) return timeDiff;

  // 4. Alphabetical determinism
  return `${a.source}${a.bridge}`.localeCompare(`${b.source}${b.bridge}`);
}

/**
 * Returns the single best quote from the list using the canonical comparator.
 * Returns null if the list is empty.
 */
export function selectBestQuote<T extends RankableQuote>(quotes: T[]): T | null {
  if (quotes.length === 0) return null;
  return quotes.reduce((best, q) => (compareQuotesByOutput(q, best) < 0 ? q : best));
}

/**
 * Returns the single worst quote (lowest outputUsd) from the list.
 * Returns null if the list is empty.
 */
export function selectWorstQuote<T extends RankableQuote>(quotes: T[]): T | null {
  if (quotes.length === 0) return null;
  return quotes.reduce((worst, q) => (Number(q.outputUsd) < Number(worst.outputUsd) ? q : worst));
}

/**
 * Compute spread in basis points from the canonical best output to a quote's output.
 * Always >= 0. The best quote itself returns 0.
 */
export function computeSpreadBps(bestOutputUsd: number, quoteOutputUsd: number): number {
  if (bestOutputUsd <= 0) return 0;
  return Math.max(0, Math.round((10000 * (bestOutputUsd - quoteOutputUsd)) / bestOutputUsd));
}

/**
 * Re-rank a list of quotes globally using the canonical comparator.
 * Returns a new sorted array with `rank` (1 = best) and `spreadBps` recomputed
 * from the actual best output in the list — NOT from stored batch-local values.
 *
 * Call this in getQuotesForRoute so Explorer always reflects the real global winner.
 */
export function reRankQuotes<T extends RankableQuote>(
  quotes: T[]
): (T & { rank: number; spreadBps: number })[] {
  if (quotes.length === 0) return [];

  const sorted = [...quotes].sort(compareQuotesByOutput);
  const bestOutput = Number(sorted[0]!.outputUsd);

  return sorted.map((q, i) => ({
    ...q,
    rank: i + 1,
    spreadBps: computeSpreadBps(bestOutput, Number(q.outputUsd)),
  }));
}
