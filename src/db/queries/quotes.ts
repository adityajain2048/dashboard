import format from 'pg-format';
import type { NormalizedQuote } from '../../types/index.js';
import { pool } from '../connection.js';

/**
 * Coerce a possibly-fractional numeric to a Postgres integer. Aggregator APIs
 * sometimes return fractional values for integer-typed fields (e.g. Squid's
 * estimatedRouteDuration = 3.5s); inserting those raw fails the ENTIRE batch
 * with "invalid input syntax for type integer". Null/undefined passes through.
 */
function toInt(v: number | null | undefined): number | null {
  return v == null ? null : Math.round(Number(v));
}

/** Insert multiple quotes in one batch. Returns number of rows inserted. */
export async function insertQuotesBatch(quotes: NormalizedQuote[]): Promise<number> {
  if (quotes.length === 0) return 0;

  const values = quotes.map((q) => [
    q.ts,
    q.batchId,
    q.srcChain,
    q.dstChain,
    q.asset,
    q.amountTier,
    q.source,
    q.bridge,
    q.inputAmount,
    q.outputAmount,
    q.inputUsd,
    q.outputUsd,
    q.gasCostUsd,
    toInt(q.protocolFeeBps),
    toInt(q.totalFeeBps),
    q.totalFeeUsd,
    toInt(q.estimatedSeconds),
    q.isMultihop,
    toInt(q.steps),
    toInt(q.rank),
    toInt(q.spreadBps),
  ]);

  const sql = format(
    `INSERT INTO quotes (
      ts, batch_id, src_chain, dst_chain, asset, amount_tier, source, bridge,
      input_amount, output_amount, input_usd, output_usd, gas_cost_usd,
      protocol_fee_bps, total_fee_bps, total_fee_usd, estimated_seconds,
      is_multihop, steps, rank_by_output, spread_bps
    ) VALUES %L`,
    values
  );
  const result = await pool.query(sql);
  return result.rowCount ?? 0;
}

/**
 * Upsert route_latest: always overwrite with the latest fetch result (no stale guard).
 *
 * Single bulk INSERT … ON CONFLICT (one round-trip via pool.query) rather than a
 * held client looping per-row. The old per-row loop held one pool connection for
 * the entire duration of N sequential inserts; at fetch concurrency 24 that could
 * pin every connection in the pool and starve the API ("timeout exceeded when
 * trying to connect"). One bulk statement releases its connection almost immediately.
 *
 * Postgres rejects ON CONFLICT touching the same row twice in one statement, so we
 * dedup by the conflict key first (last write wins) — a single duplicate would
 * otherwise abort the whole batch and leave route_latest stale.
 */
export async function upsertRouteLatest(quotes: NormalizedQuote[]): Promise<void> {
  if (quotes.length === 0) return;

  // Dedup on the route_latest PK; keep the last occurrence (matches the previous
  // loop's last-write-wins semantics).
  const byKey = new Map<string, NormalizedQuote>();
  for (const q of quotes) {
    byKey.set(`${q.srcChain}:${q.dstChain}:${q.asset}:${q.amountTier}:${q.bridge}:${q.source}`, q);
  }

  const values = [...byKey.values()].map((q) => [
    q.srcChain,
    q.dstChain,
    q.asset,
    q.amountTier,
    q.bridge,
    q.source,
    q.ts,
    q.batchId,
    q.inputAmount,
    q.outputAmount,
    q.outputUsd,
    q.inputUsd,
    q.gasCostUsd,
    toInt(q.totalFeeBps),
    q.totalFeeUsd,
    toInt(q.estimatedSeconds),
    toInt(q.rank),
    toInt(q.spreadBps),
  ]);

  const sql = format(
    `INSERT INTO route_latest (
      src_chain, dst_chain, asset, amount_tier, bridge, source,
      ts, batch_id, input_amount, output_amount, output_usd, input_usd, gas_cost_usd,
      total_fee_bps, total_fee_usd, estimated_seconds,
      rank_by_output, spread_bps
    ) VALUES %L
    ON CONFLICT (src_chain, dst_chain, asset, amount_tier, bridge, source)
    DO UPDATE SET
      ts = EXCLUDED.ts,
      batch_id = EXCLUDED.batch_id,
      input_amount = EXCLUDED.input_amount,
      output_amount = EXCLUDED.output_amount,
      output_usd = EXCLUDED.output_usd,
      input_usd = EXCLUDED.input_usd,
      gas_cost_usd = EXCLUDED.gas_cost_usd,
      total_fee_bps = EXCLUDED.total_fee_bps,
      total_fee_usd = EXCLUDED.total_fee_usd,
      estimated_seconds = EXCLUDED.estimated_seconds,
      rank_by_output = EXCLUDED.rank_by_output,
      spread_bps = EXCLUDED.spread_bps`,
    values
  );
  await pool.query(sql);
}
