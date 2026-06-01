import format from 'pg-format';
import type { NormalizedQuote, FetchLogEntry, RouteStatus, Asset } from '../types/index.js';
import { getRouteTier } from '../config/routes.js';
import { pool, query, getClient } from './connection.js';
import { selectBestQuote, selectWorstQuote, computeSpreadBps, reRankQuotes } from '../lib/quoteRanking.js';

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
export const STALE_THRESHOLD_MS: Record<1 | 2 | 3, number> = {
  1: 3 * 60 * 1000,   // 3 min
  2: 6 * 60 * 1000,   // 6 min
  3: 15 * 60 * 1000,  // 15 min
};

/** A single row from route_latest as consumed by computeRouteStatus. */
export interface RouteLatestInput {
  bridge: string;
  source: string;
  output_usd: string;
  input_usd: string;
  total_fee_bps: number;
  estimated_seconds?: number;
  ts: Date;
}

/** The computed values written into route_status. */
export interface ComputedRouteStatus {
  state: 'active' | 'dead' | 'stale' | 'single-bridge';
  lastSeen: Date | null;
  quoteCount: number;
  bridgeCount: number;
  bestBridge: string | null;
  worstBridge: string | null;
  bestOutputUsd: string | null;
  worstOutputUsd: string | null;
  /** null when route is stale — never show stale fees on the matrix. */
  bestFeeBps: number | null;
  spreadBps: number | null;
}

/**
 * Pure function: compute route_status fields from raw route_latest rows.
 *
 * Design rules:
 * 1. STATE is driven by the most-recent quote timestamp vs the tier threshold.
 *    (freshRows are used only for state, not for ranking.)
 * 2. BEST BRIDGE is the canonical winner across ALL valid rows — not filtered by
 *    freshness — so it matches what /api/quotes returns as row[0].
 *    "Valid" means: output_usd > 0.01 AND total_fee_bps ≤ 1000.
 * 3. bestFeeBps is always computed when a best row exists (stale or not) — the
 *    matrix shows the last known fee for stale routes in a dimmed colour.
 *    It is the stored total_fee_bps of the best quote, clamped to ≥ 0. When
 *    storedFee = 0 the fee is derived from (input − output) / input.
 *    Negative values (output > input) are clamped to 0.
 * 4. SPREAD is computed from all valid rows (best vs worst).
 *
 * Exported so it can be unit-tested without a database.
 */
export function computeRouteStatus(
  rows: RouteLatestInput[],
  refreshTier: 1 | 2 | 3,
  now: Date = new Date()
): ComputedRouteStatus {
  const thresholdMs = STALE_THRESHOLD_MS[refreshTier];

  // ── Valid rows: filter out garbage (broken output / fee outliers) ──────────
  const validRows = rows.filter(
    (r) => Number(r.output_usd) > 0.01 && (r.total_fee_bps == null || r.total_fee_bps <= 1000)
  );

  // ── Basic counts (all rows, including invalid — counts reflect DB reality) ─
  const quoteCount = rows.length;
  const bridgeCount = new Set(rows.map((r) => r.bridge)).size;
  const lastSeen = quoteCount > 0
    ? rows.reduce((newest, r) => (r.ts > newest ? r.ts : newest), rows[0].ts)
    : null;

  // ── State — driven by freshness of the most-recent quote ──────────────────
  // bridgeCount uses ALL rows (fresh + stale): it reflects whether the route
  // has ever had multiple bridges quoting (competition vs monopoly).
  let state: ComputedRouteStatus['state'];
  if (quoteCount === 0) {
    state = 'dead';
  } else if (lastSeen && (now.getTime() - lastSeen.getTime()) > thresholdMs) {
    state = 'stale';
  } else if (bridgeCount === 1) {
    state = 'single-bridge';
  } else {
    state = 'active';
  }

  // ── Best / worst selection from ALL valid rows ─────────────────────────────
  // RouteLatestInput uses snake_case (output_usd, total_fee_bps) but the
  // canonical helpers expect camelCase RankableQuote. Map once here.
  const rankable = validRows.map((r) => ({
    bridge: r.bridge,
    source: r.source,
    outputUsd: r.output_usd,                       // output_usd → outputUsd
    totalFeeBps: r.total_fee_bps,                  // total_fee_bps → totalFeeBps
    estimatedSeconds: r.estimated_seconds ?? 0,    // optional field
  }));

  const bestRanked = selectBestQuote(rankable);
  const worstRanked = selectWorstQuote(rankable);

  // Resolve back to original rows (bridge+source is unique per route_latest PK)
  const bestRow = bestRanked
    ? (validRows.find((r) => r.bridge === bestRanked.bridge && r.source === bestRanked.source) ?? null)
    : null;
  const worstRow = worstRanked
    ? (validRows.find((r) => r.bridge === worstRanked.bridge && r.source === worstRanked.source) ?? null)
    : null;

  const bestBridge = bestRow?.bridge ?? null;
  const worstBridge = worstRow?.bridge ?? null;
  const bestOutputUsd = bestRow?.output_usd ?? null;
  const worstOutputUsd = worstRow?.output_usd ?? null;

  // ── bestFeeBps — always computed when a best row exists (stale or not) ─────
  let bestFeeBps: number | null = null;
  if (bestRow) {
    const storedFee = bestRow.total_fee_bps;
    const inputUsd = Number(bestRow.input_usd ?? 0);
    if (storedFee != null && storedFee > 0) {
      bestFeeBps = storedFee;
    } else {
      // storedFee = 0 or null → derive from output delta; clamp to ≥ 0 so
      // a positive-output route never shows as a "negative fee".
      bestFeeBps = inputUsd > 0 && Number(bestOutputUsd) > 0
        ? Math.max(0, Math.round((10000 * (inputUsd - Number(bestOutputUsd))) / inputUsd))
        : 0;
    }
  }

  // ── Spread — null when stale; 0 when only one valid row ──────────────────
  let spreadBps: number | null = null;
  if (state !== 'stale' && bestOutputUsd != null && worstOutputUsd != null) {
    spreadBps = computeSpreadBps(Number(bestOutputUsd), Number(worstOutputUsd));
  }

  return {
    state,
    lastSeen,
    quoteCount,
    bridgeCount,
    bestBridge,
    worstBridge,
    bestOutputUsd,
    worstOutputUsd,
    bestFeeBps,
    spreadBps,
  };
}

/**
 * Compute state and spread from route_latest (not just current cycle),
 * then upsert route_status.
 */
export async function updateRouteStatus(
  src: string,
  dst: string,
  asset: string,
  tier: number,
  _currentCycleQuotes: NormalizedQuote[]
): Promise<void> {
  const refreshTier = getRouteTier(src, dst);

  const latestResult = await pool.query<RouteLatestInput>(
    `SELECT bridge, source, output_usd, input_usd, total_fee_bps, ts
     FROM route_latest
     WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4`,
    [src, dst, asset, tier]
  );

  const {
    state, lastSeen, quoteCount, bridgeCount,
    bestBridge, worstBridge, bestOutputUsd, worstOutputUsd, bestFeeBps, spreadBps,
  } = computeRouteStatus(latestResult.rows, refreshTier);

  await pool.query(
    `INSERT INTO route_status (
      src_chain, dst_chain, asset, amount_tier,
      state, last_seen, quote_count, bridge_count, best_bridge, worst_bridge,
      best_output_usd, worst_output_usd, spread_bps, best_fee_bps, refresh_tier
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (src_chain, dst_chain, asset, amount_tier)
    DO UPDATE SET
      state = EXCLUDED.state,
      last_seen = COALESCE(EXCLUDED.last_seen, route_status.last_seen),
      quote_count = EXCLUDED.quote_count,
      bridge_count = EXCLUDED.bridge_count,
      best_bridge = EXCLUDED.best_bridge,
      worst_bridge = EXCLUDED.worst_bridge,
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
      worstBridge,
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

/**
 * Get quotes for a route from route_latest, re-ranked globally at query time.
 *
 * Stored rank/spreadBps in route_latest are batch-local (computed per aggregator
 * run) and can make multiple quotes appear as "BEST". This function recomputes
 * canonical rank and spreadBps from the actual sorted results so Explorer
 * always shows exactly one BEST badge and correct relative spreads.
 */
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
     WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4`,
    [src, dst, asset, tier]
  );

  const quotes: NormalizedQuote[] = result.rows.map((row: RouteLatestRow) => ({
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
    // rank and spreadBps are recomputed below — do not use stored values
    rank: undefined,
    spreadBps: undefined,
  }));

  // Re-rank globally using the canonical comparator (highest output wins).
  // This replaces batch-local stored rank/spreadBps with correct global values.
  return reRankQuotes(quotes);
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

/**
 * For a list of "src:dst:asset:amountTier" task keys (Squid gaps), return a map
 * of which non-Squid aggregators have historically provided quotes for each.
 * Used by gap-fill scheduler to only call aggregators that have shown coverage.
 */
export async function getGapCoverage(
  taskKeys: string[]
): Promise<Map<string, string[]>> {
  const coverage = new Map<string, string[]>();
  if (taskKeys.length === 0) return coverage;

  const result = await pool.query<{
    src_chain: string;
    dst_chain: string;
    asset: string;
    amount_tier: number;
    source: string;
  }>(
    `SELECT DISTINCT src_chain, dst_chain, asset, amount_tier::int, source
     FROM quotes
     WHERE source != 'squid'
       AND ts > NOW() - INTERVAL '7 days'
       AND (src_chain || ':' || dst_chain || ':' || asset || ':' || amount_tier::text) = ANY($1::text[])`,
    [taskKeys]
  );

  for (const row of result.rows) {
    const key = `${row.src_chain}:${row.dst_chain}:${row.asset}:${row.amount_tier}`;
    if (!coverage.has(key)) coverage.set(key, []);
    coverage.get(key)!.push(row.source);
  }
  return coverage;
}

/** Health check: quote count and oldest quote timestamp. */
export async function getHealth(): Promise<{ quoteCount: number; oldestQuote: Date | null }> {
  const result = await query<{ count: string; min_ts: Date | null }>(
    "SELECT COUNT(*)::text AS count, MIN(ts) AS min_ts FROM quotes WHERE ts > NOW() - INTERVAL '24 hours'"
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

/**
 * Returns true if there are any quotes newer than `withinMs` milliseconds.
 * Used by the scheduler to skip the Squid sweep on restart when fresh data
 * already exists (avoids thundering-herd rate-limit blowout on redeploy).
 */
export async function hasRecentQuotes(withinMs: number): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM route_latest WHERE ts > NOW() - $1::interval
     ) AS exists`,
    [`${withinMs} milliseconds`]
  );
  return result.rows[0]?.exists ?? false;
}
