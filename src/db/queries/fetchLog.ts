import type { FetchLogEntry } from '../../types/index.js';
import { pool, query } from '../connection.js';

/** Insert a single fetch_log entry. */
export async function insertFetchLog(entry: FetchLogEntry): Promise<void> {
  await pool.query(
    `INSERT INTO fetch_log (
      batch_id, ts, src_chain, dst_chain, asset, amount_tier,
      source, bridge, status, response_ms, error_message, quote_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      entry.batchId,
      entry.ts,
      entry.srcChain,
      entry.dstChain,
      entry.asset,
      entry.amountTier,
      entry.source,
      entry.bridge,
      entry.status,
      entry.responseMs,
      entry.errorMessage,
      entry.quoteCount,
    ]
  );
}

/** Delete fetch_log rows older than the given number of days. Returns deleted row count. */
export async function purgeFetchLog(olderThanDays: number): Promise<number> {
  const result = await query<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM fetch_log WHERE ts < NOW() - ($1 || ' days')::INTERVAL
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM deleted`,
    [olderThanDays]
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// ─── Aggregator skip tracking ─────────────────────────────────────────────────

export interface AggregatorSkipRow {
  src_chain: string;
  dst_chain: string;
  asset: string;
  amount_tier: number;
  aggregator: string;
  skip_until: Date | null;
}

/**
 * Load all active skips (skip_until > NOW()) from the DB.
 * Called at startup and refreshed every 30 minutes.
 */
export async function loadAggregatorSkip(): Promise<AggregatorSkipRow[]> {
  const result = await query<AggregatorSkipRow>(
    `SELECT src_chain, dst_chain, asset, amount_tier::float AS amount_tier,
            aggregator, skip_until
     FROM aggregator_route_skip
     WHERE skip_until > NOW()`
  );
  return result.rows;
}

/**
 * Increment miss_count for a (route, aggregator) pair and set skip_until.
 *
 * miss_count climbs every cycle until the first skip, then advances ~once per
 * 24h skip window (the pair isn't called while skipped), so past the first skip
 * each +1 ≈ one more day of continuous failure:
 *   ≥ 8  misses → skip 24 hours (just went dead → re-probe daily)
 *   ≥ 11 misses → skip 7 days   (≈3 days of daily failures → re-probe weekly)
 *
 * The old 7-day threshold of 20 was effectively unreachable: the 24h skip freezes
 * the counter, so climbing from 8 to 20 would take ~12 days of daily re-probes.
 */
export async function upsertAggregatorMiss(
  src: string,
  dst: string,
  asset: string,
  amountTier: number,
  aggregator: string
): Promise<{ missCount: number; skipUntil: Date | null }> {
  const result = await query<{ miss_count: number; skip_until: Date | null }>(
    `INSERT INTO aggregator_route_skip
       (src_chain, dst_chain, asset, amount_tier, aggregator, miss_count, skip_until, last_miss_at)
     VALUES ($1, $2, $3, $4, $5, 1, NULL, NOW())
     ON CONFLICT (src_chain, dst_chain, asset, amount_tier, aggregator)
     DO UPDATE SET
       miss_count   = aggregator_route_skip.miss_count + 1,
       last_miss_at = NOW(),
       skip_until   = CASE
         WHEN aggregator_route_skip.miss_count + 1 >= 8  THEN NOW() + INTERVAL '7 days'
         WHEN aggregator_route_skip.miss_count + 1 >= 5  THEN NOW() + INTERVAL '24 hours'
         ELSE NULL
       END
     RETURNING miss_count, skip_until`,
    [src, dst, asset, amountTier, aggregator]
  );
  const row = result.rows[0];
  return { missCount: row?.miss_count ?? 1, skipUntil: row?.skip_until ?? null };
}

/**
 * Clear ALL Squid skip entries from the DB. Called at startup before the sweep
 * so every route gets a fresh probe — stale skip entries from a previous session
 * (e.g. when the sweep was broken) cannot block current calls.
 * Returns the number of rows cleared.
 */
export async function clearAllSquidSkips(): Promise<number> {
  const result = await query<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM aggregator_route_skip
       WHERE aggregator = 'squid'
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM deleted`
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Reset miss tracking for a (route, aggregator) pair after a successful quote.
 * Clears skip_until so the aggregator is probed again on the next cycle.
 */
export async function resetAggregatorMiss(
  src: string,
  dst: string,
  asset: string,
  amountTier: number,
  aggregator: string
): Promise<void> {
  await query(
    `UPDATE aggregator_route_skip
     SET miss_count = 0, skip_until = NULL
     WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3
       AND amount_tier = $4 AND aggregator = $5`,
    [src, dst, asset, amountTier, aggregator]
  );
}
