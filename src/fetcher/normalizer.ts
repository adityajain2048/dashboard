import type { NormalizedQuote } from '../types/index.js';

/** Sort by output_usd descending, assign rank, compute spread_bps. */
export function rankQuotes(quotes: NormalizedQuote[]): NormalizedQuote[] {
  if (quotes.length === 0) return [];

  const sorted = [...quotes].sort(
    (a, b) => Number(b.outputUsd) - Number(a.outputUsd)
  );
  const bestOutput = Number(sorted[0]!.outputUsd);
  if (bestOutput <= 0) return sorted.map((q, i) => ({ ...q, rank: i + 1, spreadBps: 0 }));

  return sorted.map((q, i) => {
    const rank = i + 1;
    const out = Number(q.outputUsd);
    const spreadBps = bestOutput > 0 ? Math.round((10000 * (bestOutput - out)) / bestOutput) : 0;
    return { ...q, rank, spreadBps };
  });
}

/** Deduplicate by (bridge, source): keep best output per bridge per aggregator so we store all routes. */
export function deduplicateQuotes(quotes: NormalizedQuote[]): NormalizedQuote[] {
  const key = (q: NormalizedQuote) => `${q.bridge}\t${q.source}`;
  const byBridgeSource = new Map<string, NormalizedQuote>();
  for (const q of quotes) {
    const k = key(q);
    const existing = byBridgeSource.get(k);
    if (!existing || Number(q.outputUsd) > Number(existing.outputUsd)) {
      byBridgeSource.set(k, q);
    }
  }
  return Array.from(byBridgeSource.values());
}
