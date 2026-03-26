import format from 'pg-format';
import type { NormalizedQuote, FetchLogEntry, RouteStatus, Asset } from '../types/index.js';
import { getRouteTier } from '../config/routes.js';
import { pool, query, getClient } from './connection.js';

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

/** Stale thresholds by refresh tier (CLAUDE.md): T1 > 3min, T2 > 6min, T3 > 15min */
const STALE_THRESHOLD_MS: Record<1 | 2 | 3, number> = {
  1: 3 * 60 * 1000,   // 3 min
  2: 6 * 60 * 1000,   // 6 min
  3: 15 * 60 * 1000,  // 15 min
};

/**
 * Compute state and spread from route_latest (not just current cycle),
 * then upsert route_status.
 *
 * Key insight: if the current fetch cycle returns 0 quotes for a route,
 * that does NOT mean the route is dead — route_latest may still have
 * recent data from a previous cycle. We use route_latest as the source
 * of truth for state computation.
 */
export async function updateRouteStatus(
  src: string,
  dst: string,
  asset: string,
  tier: number,
  _currentCycleQuotes: NormalizedQuote[]
): Promise<void> {
  const refreshTier = getRouteTier(src, dst);

  // Query route_latest for ALL known quotes for this route (from any cycle)
  const latestResult = await pool.query<{
    bridge: string;
    source: string;
    output_usd: string;
    input_usd: string;
    total_fee_bps: number;
    ts: Date;
  }>(
    `SELECT bridge, source, output_usd, input_usd, total_fee_bps, ts
     FROM route_latest
     WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4`,
    [src, dst, asset, tier]
  );

  const latestRows = latestResult.rows;
  const bridgeCount = new Set(latestRows.map((r) => r.bridge)).size;
  const quoteCount = latestRows.length;

  // Find the most recent timestamp across all bridges for this route
  const lastSeen = latestRows.length > 0
    ? latestRows.reduce((newest, r) => (r.ts > newest ? r.ts : newest), latestRows[0].ts)
    : null;

  // Determine state based on route_latest data
  let state: 'active' | 'dead' | 'stale' | 'single-bridge';
  if (quoteCount === 0) {
    state = 'dead';
  } else if (bridgeCount === 1) {
    state = 'single-bridge';
  } else {
    state = 'active';
  }

  // Check staleness against the most recent data
  if (state !== 'dead' && lastSeen) {
    const ageMs = Date.now() - lastSeen.getTime();
    if (ageMs > STALE_THRESHOLD_MS[refreshTier]) {
      state = 'stale';
    }
  }

  let spreadBps: number | null = null;
  let bestFeeBps: number | null = null;
  let bestOutputUsd: string | null = null;
  let worstOutputUsd: string | null = null;
  let bestBridge: string | null = null;

  if (latestRows.length > 0) {
    // Filter out zero/negative output quotes — these are broken/stale and skew spread
    const validRows = latestRows.filter((r) => Number(r.output_usd) > 0.01);

    const best = latestRows.reduce((a, b) =>
      Number(b.output_usd) > Number(a.output_usd) ? b : a
    );
    bestBridge = best.bridge;
    bestOutputUsd = best.output_usd;

    // For worst, only consider valid (non-zero) rows
    if (validRows.length > 0) {
      const worst = validRows.reduce((a, b) =>
        Number(b.output_usd) < Number(a.output_usd) ? b : a
      );
      worstOutputUsd = worst.output_usd;
    } else {
      worstOutputUsd = bestOutputUsd;
    }

    // Use total_fee_bps when present; otherwise derive from (input - output) / input
    const storedFee = best.total_fee_bps;
    const inputUsd = Number(best.input_usd ?? 0);
    if (storedFee != null && storedFee > 0) {
      bestFeeBps = storedFee;
    } else if (inputUsd > 0 && Number(bestOutputUsd) > 0) {
      bestFeeBps = Math.round((10000 * (inputUsd - Number(bestOutputUsd))) / inputUsd);
    }
    // When we have quotes but couldn't compute fee, use 0 so matrix shows a value instead of dash
    if (bestFeeBps == null) bestFeeBps = 0;
    // Only compute spread when the best quote is reasonable (< 10% loss vs input).
    // Routes where best output is far below input are broken, not arbitrage opportunities.
    const bestIsReasonable = bestFeeBps != null && bestFeeBps < 1000;

    if (bestIsReasonable && Number(bestOutputUsd) > 0 && validRows.length > 1) {
      spreadBps = Math.round(
        (10000 * (Number(bestOutputUsd) - Number(worstOutputUsd))) / Number(bestOutputUsd)
      );
    } else {
      spreadBps = 0;
    }
  }

  await pool.query(
    `INSERT INTO route_status (
      src_chain, dst_chain, asset, amount_tier,
      state, last_seen, quote_count, bridge_count, best_bridge,
      best_output_usd, worst_output_usd, spread_bps, best_fee_bps, refresh_tier
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (src_chain, dst_chain, asset, amount_tier)
    DO UPDATE SET
      state = EXCLUDED.state,
      last_seen = COALESCE(EXCLUDED.last_seen, route_status.last_seen),
      quote_count = EXCLUDED.quote_count,
      bridge_count = EXCLUDED.bridge_count,
      best_bridge = EXCLUDED.best_bridge,
      best_output_usd = EXCLUDED.best_output_usd,
      worst_output_usd = EXCLUDED.worst_output_usd,
      spread_bps = EXCLUDED.spread_bps,
      best_fee_bps = EXCLUDED.best_fee_bps,
      refresh_tier = EXCLUDED.refresh_tier`,
    [
      src,
      dst,
      asset,
      tier,
      state,
      lastSeen,
      quoteCount,
      bridgeCount,
      bestBridge,
      bestOutputUsd,
      worstOutputUsd,
      spreadBps,
      bestFeeBps,
      refreshTier,
    ]
  );
}

interface RouteLatestRow {
  ts: Date;
  batch_id: string;
  src_chain: string;
  dst_chain: string;
  asset: string;
  amount_tier: number;
  bridge: string;
  source: string;
  input_amount: string;
  output_amount: string;
  output_usd: string;
  input_usd: string;
  gas_cost_usd: string;
  total_fee_bps: number;
  total_fee_usd: string;
  estimated_seconds: number;
  rank_by_output: number | null;
  spread_bps: number | null;
}

/** Get best quotes for a route from route_latest, ordered by output_usd DESC. */
export async function getQuotesForRoute(
  src: string,
  dst: string,
  asset: Asset,
  tier: number
): Promise<NormalizedQuote[]> {
  const result = await query<RouteLatestRow>(
    `SELECT ts, batch_id, src_chain, dst_chain, asset, amount_tier, bridge, source,
            input_amount, output_amount, output_usd, input_usd, gas_cost_usd, total_fee_bps, total_fee_usd,
            estimated_seconds, rank_by_output, spread_bps
     FROM route_latest
     WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4
     ORDER BY output_usd DESC`,
    [src, dst, asset, tier]
  );

  return result.rows.map((row: RouteLatestRow) => ({
    batchId: row.batch_id,
    ts: row.ts,
    srcChain: row.src_chain,
    dstChain: row.dst_chain,
    asset: row.asset as Asset,
    amountTier: row.amount_tier,
    source: row.source as NormalizedQuote['source'],
    bridge: row.bridge,
    inputAmount: row.input_amount,
    outputAmount: row.output_amount,
    inputUsd: row.input_usd,
    outputUsd: row.output_usd,
    gasCostUsd: row.gas_cost_usd,
    protocolFeeBps: 0,
    totalFeeBps: row.total_fee_bps,
    totalFeeUsd: row.total_fee_usd,
    estimatedSeconds: row.estimated_seconds,
    isMultihop: false,
    steps: 1,
    rank: row.rank_by_output ?? undefined,
    spreadBps: row.spread_bps ?? undefined,
  }));
}

interface RouteStatusRow {
  src_chain: string;
  dst_chain: string;
  asset: string;
  amount_tier: number;
  state: string;
  last_seen: Date | null;
  quote_count: number;
  bridge_count: number;
  best_bridge: string | null;
  best_output_usd: string | null;
  worst_output_usd: string | null;
  spread_bps: number | null;
  refresh_tier: number;
}

/** Get matrix data for heatmap: all route_status rows for asset and tier. */
export async function getMatrixData(
  asset: Asset,
  tier: number
): Promise<RouteStatus[]> {
  const result = await query<RouteStatusRow>(
    `SELECT src_chain, dst_chain, asset, amount_tier, state, last_seen,
            quote_count, bridge_count, best_bridge, best_output_usd, worst_output_usd,
            spread_bps, refresh_tier
     FROM route_status
     WHERE asset = $1 AND amount_tier = $2`,
    [asset, tier]
  );

  return result.rows.map((row: RouteStatusRow) => ({
    srcChain: row.src_chain,
    dstChain: row.dst_chain,
    asset: row.asset as Asset,
    amountTier: row.amount_tier,
    state: row.state as RouteStatus['state'],
    lastSeen: row.last_seen,
    quoteCount: row.quote_count,
    bridgeCount: row.bridge_count,
    bestBridge: row.best_bridge,
    bestOutputUsd: row.best_output_usd,
    worstOutputUsd: row.worst_output_usd,
    spreadBps: row.spread_bps,
    refreshTier: row.refresh_tier as RouteStatus['refreshTier'],
  }));
}

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

/** Health check: quote count and oldest quote timestamp. */
export async function getHealth(): Promise<{ quoteCount: number; oldestQuote: Date | null }> {
  const result = await query<{ count: string; min_ts: Date | null }>(
    'SELECT COUNT(*)::text AS count, MIN(ts) AS min_ts FROM quotes'
  );
  const row = result.rows[0];
  return {
    quoteCount: row ? parseInt(row.count, 10) : 0,
    oldestQuote: row?.min_ts ?? null,
  };
}

/** Per-route latest ts from route_latest for health lastFetch. */
export async function getRouteLatestMaxTs(): Promise<
  Array<{ src_chain: string; dst_chain: string; last_ts: Date }>
> {
  const result = await query<{ src_chain: string; dst_chain: string; last_ts: Date }>(
    'SELECT src_chain, dst_chain, MAX(ts) AS last_ts FROM route_latest GROUP BY src_chain, dst_chain'
  );
  return result.rows;
}
