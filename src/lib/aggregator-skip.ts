/**
 * In-memory skip map for per-(route, aggregator) adaptive skipping.
 *
 * When an aggregator consistently returns no_route for a route, we stop querying
 * it for a cooldown period (24h after 8 consecutive misses, 7 days after 11).
 * This eliminates wasted API calls for the ~3,000+ route × aggregator pairs that
 * never return results.
 *
 * The map is populated from the DB at startup and refreshed every 30 minutes.
 * DB writes are fire-and-forget — a write failure never blocks fetching.
 */
import type { RouteKey, AggregatorId } from '../types/index.js';
import {
  loadAggregatorSkip,
  upsertAggregatorMiss,
  resetAggregatorMiss,
} from '../db/queries.js';
import { logger } from './logger.js';

/** Key format: "${aggregator}:${src}:${dst}:${asset}:${amountTier}" */
function makeSkipKey(aggregator: string, route: RouteKey): string {
  return `${aggregator}:${route.src}:${route.dst}:${route.asset}:${route.amountTier}`;
}

/**
 * In-memory skip map: key → skip_until timestamp.
 * If Date.now() < skipMap.get(key), skip this aggregator+route pair.
 */
export const skipMap = new Map<string, Date>();

/**
 * Load active skips from the DB and replace the in-memory map.
 * Called at scheduler startup and every 30 minutes.
 */
export async function loadSkipMap(): Promise<void> {
  try {
    const rows = await loadAggregatorSkip();
    skipMap.clear();
    for (const row of rows) {
      if (row.skip_until) {
        const key = makeSkipKey(
          row.aggregator,
          {
            src: row.src_chain,
            dst: row.dst_chain,
            asset: row.asset as RouteKey['asset'],
            amountTier: row.amount_tier,
          }
        );
        skipMap.set(key, new Date(row.skip_until));
      }
    }
    logger.info(
      { component: 'aggregator-skip', activeSkips: skipMap.size },
      `Aggregator skip map loaded — ${skipMap.size} active skips`
    );
  } catch (err) {
    logger.warn({ err }, 'Failed to load aggregator skip map — skipping will be disabled this cycle');
  }
}

/**
 * Returns true if this aggregator+route is currently within its skip window.
 * Automatically evicts expired entries from the in-memory map.
 */
export function isSkipped(aggregator: AggregatorId, route: RouteKey): boolean {
  const key = makeSkipKey(aggregator, route);
  const until = skipMap.get(key);
  if (!until) return false;
  if (Date.now() >= until.getTime()) {
    // Skip window has expired — remove from map so this cycle probes the route.
    skipMap.delete(key);
    return false;
  }
  return true;
}

/**
 * Record a no_route miss for a (route, aggregator) pair.
 * Increments the DB counter and updates the in-memory map if a skip threshold is crossed.
 * Fire-and-forget — never throws.
 */
export function recordMiss(aggregator: AggregatorId, route: RouteKey): void {
  upsertAggregatorMiss(route.src, route.dst, route.asset, route.amountTier, aggregator)
    .then(({ missCount, skipUntil }) => {
      if (skipUntil) {
        const key = makeSkipKey(aggregator, route);
        skipMap.set(key, skipUntil);
        const days = missCount >= 11 ? '7 days' : '24 hours';
        logger.debug(
          { aggregator, src: route.src, dst: route.dst, asset: route.asset, amountTier: route.amountTier, missCount },
          `Aggregator skip: ${aggregator} on ${route.src}→${route.dst} ${route.asset} skipped for ${days} (${missCount} consecutive misses)`
        );
      }
    })
    .catch(() => {
      // DB write failure is non-critical — just skip the update silently
    });
}

/**
 * Record a successful quote for a (route, aggregator) pair, resetting miss count.
 * Clears any active skip from the in-memory map.
 * Fire-and-forget — never throws.
 */
export function recordHit(aggregator: AggregatorId, route: RouteKey): void {
  const key = makeSkipKey(aggregator, route);
  // Only reset if we were actually tracking this pair (avoid unnecessary DB writes)
  const hadEntry = skipMap.has(key);
  skipMap.delete(key);

  if (hadEntry) {
    resetAggregatorMiss(route.src, route.dst, route.asset, route.amountTier, aggregator)
      .catch(() => {});
  } else {
    // Also reset in DB if this pair had a miss_count (even without an active skip)
    // by checking asynchronously. Keep it fire-and-forget.
    resetAggregatorMiss(route.src, route.dst, route.asset, route.amountTier, aggregator)
      .catch(() => {});
  }
}
