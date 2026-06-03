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
