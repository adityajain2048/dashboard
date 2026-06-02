import format from 'pg-format';
import type { NormalizedQuote } from '../../types/index.js';
import { pool, getClient } from '../connection.js';

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
    q.protocolFeeBps,
    q.totalFeeBps,
    q.totalFeeUsd,
    q.estimatedSeconds,
    q.isMultihop,
    q.steps,
    q.rank ?? null,
    q.spreadBps ?? null,
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

/** Upsert route_latest: always overwrite with the latest fetch result (no stale guard). */
export async function upsertRouteLatest(quotes: NormalizedQuote[]): Promise<void> {
  if (quotes.length === 0) return;

  const client = await getClient();
  try {
    for (const q of quotes) {
      await client.query(
        `INSERT INTO route_latest (
          src_chain, dst_chain, asset, amount_tier, bridge, source,
          ts, batch_id, input_amount, output_amount, output_usd, input_usd, gas_cost_usd,
          total_fee_bps, total_fee_usd, estimated_seconds,
          rank_by_output, spread_bps
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
        [
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
          q.totalFeeBps,
          q.totalFeeUsd,
          q.estimatedSeconds,
          q.rank ?? null,
          q.spreadBps ?? null,
        ]
      );
    }
  } finally {
    client.release();
  }
}
