// src/config/aggregator-support.ts
//
// Per-aggregator chain support filter. Checked BEFORE an aggregator call is
// scheduled (see fetchAllAggregators) so we never queue — and never burn a
// timeout budget on — a (route, aggregator) pair that can't return a quote.
//
// This is a static head-start. The adaptive skip map (aggregator-skip.ts) also
// learns dead pairs dynamically (timeouts now count as misses), so this list
// only needs the high-confidence cases; tune it as coverage is confirmed.
import type { AggregatorId, RouteKey } from '../types/index.js';
import { CHAINS } from './chains.js';

/** All non-EVM chain ids (Solana, Bitcoin, Cosmos, …). */
const NON_EVM: ReadonlySet<string> = new Set(
  Object.values(CHAINS)
    .filter((c) => c.type === 'non-evm')
    .map((c) => c.id),
);

/**
 * Chains each aggregator is known NOT to support. A route is skipped for that
 * aggregator if either endpoint (src or dst) is in its set.
 */
const UNSUPPORTED_CHAINS: Partial<Record<AggregatorId, ReadonlySet<string>>> = {
  // Bungee (Socket) is EVM-only, and additionally does not route these newer
  // EVM chains — observed as 100% timeouts on every gap-fill cycle.
  bungee: new Set<string>([...NON_EVM, 'peaq', 'soneium', 'monad', 'megaeth']),
};

/**
 * Returns false if `id` is known not to support either endpoint of `route`.
 * Unknown aggregators / chains default to supported (true).
 */
export function aggregatorSupportsRoute(id: AggregatorId, route: RouteKey): boolean {
  const unsupported = UNSUPPORTED_CHAINS[id];
  if (!unsupported) return true;
  return !unsupported.has(route.src) && !unsupported.has(route.dst);
}
