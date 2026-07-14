import type { NormalizedQuote, RouteStatus, Asset } from '../../types/index.js';
import { pool, query } from '../connection.js';
import { selectBestQuote, selectWorstQuote, computeSpreadBps, reRankQuotes } from '../../lib/quoteRanking.js';

/**
 * Stale threshold: a route is marked stale after this long without a new quote.
 * Workers now run 3×/day (CYCLE_TARGET_MS ≈ 8h in scheduler.ts, cut from the
 * original 7×/day ≈ 206min to reduce DB load — see ARCHITECTURE.md §8.2). This
 * constant was never updated when that changed: it was still 4h, well under
 * the new ~8h gap between a route's refreshes, so the *majority* of genuinely
 * live routes were being marked stale (and excluded from the Leaderboard's
 * freshness filter, which imports this same constant — see bridges.ts) simply
 * for being mid-cycle, not because anything was actually wrong with them.
 * 10h ≈ one full cycle (8h) + a buffer, matching the original design's ratio
 * of "one cycle slot + buffer" to the new, longer cycle.
 */
export const STALE_THRESHOLD_MS = 10 * 60 * 60 * 1000; // 10 hours

/**
 * Hard TTL for route_latest rows. A quote no source has refreshed within this
 * window is a stale "ghost": it keeps winning the best-bridge ranking (which is
 * price-based, not freshness-based) long after its liquidity is gone, and it
 * keeps a genuinely-dead route looking alive. Pruning past this TTL means the
 * matrix shows either a fresh quote or an honest `dead` — never a days-old ghost.
 * Was 12h, calibrated for the old ~206min cycle cadence. At the current ~8h
 * cycle target, a route touched late in one cycle and late again in the next
 * can legitimately go up to ~12h between refreshes with zero margin — this was
 * pruning still-alive routes as ghosts, then relying on the next cycle to
 * re-add them, producing a net-declining corridor count whenever prune outpaced
 * re-fetch (confirmed in production: over half of route_latest's rows were
 * sitting in the 10-13h age bucket, about to be or already pruned, while only
 * ~8% were under 4h old). 24h restores a real safety margin — comfortably
 * surviving a slow cycle or a restart-interrupted one — while still being far
 * short of "forever," so genuinely dead routes are still caught within a day.
 */
export const ROUTE_LATEST_TTL_HOURS = 24;

/**
 * Delete route_latest rows older than ROUTE_LATEST_TTL_HOURS. Returns the number
 * of rows removed. Safe: rows refreshed within the window (i.e. any route a source
 * still serves) are untouched; only routes dead across every source get pruned.
 */
export async function pruneStaleRouteLatest(): Promise<number> {
  const res = await pool.query(
    `DELETE FROM route_latest WHERE ts < NOW() - ($1 || ' hours')::interval`,
    [ROUTE_LATEST_TTL_HOURS]
  );
  return res.rowCount ?? 0;
}

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
  now: Date = new Date()
): ComputedRouteStatus {

  // ── Valid rows: canonical validity filter ─────────────────────────────────
  // Canonical spec: output_usd > 0.01 AND (total_fee_bps IS NULL OR total_fee_bps <= 1000).
  // No inflation multiplier — recalcUsd.ts already gates ingestion at 1.5× at write time.
  const validRows = rows.filter((r) => {
    if (Number(r.output_usd) <= 0.01) return false;
    if (r.total_fee_bps != null && r.total_fee_bps > 1000) return false;
    return true;
  });

  // ── Counts and freshness — driven by VALID rows only ─────────────────────
  // Using validRows ensures matrix quoteCount/bridgeCount/state match what
  // /api/quotes returns. A route whose only rows fail validity filters is
  // treated as dead — not as single-bridge with phantom quotes.
  const quoteCount = validRows.length;
  const bridgeCount = new Set(validRows.map((r) => r.bridge)).size;
  const lastSeen = quoteCount > 0
    ? validRows.reduce((newest, r) => (r.ts > newest ? r.ts : newest), validRows[0]!.ts)
    : null;

  // ── State — driven by freshness of the most-recent VALID quote ────────────
  let state: ComputedRouteStatus['state'];
  if (quoteCount === 0) {
    state = 'dead';
  } else if (lastSeen && (now.getTime() - lastSeen.getTime()) > STALE_THRESHOLD_MS) {
    state = 'stale';
  } else if (bridgeCount === 1) {
    state = 'single-bridge';
  } else {
    state = 'active';
  }

  // ── Best / worst selection — all valid rows ──────────────────────────────
  // Canonical spec: rank ALL valid rows regardless of individual timestamp.
  // Using all valid rows ensures the best-priced bridge always wins even if
  // its quote is older than a recently-arrived inferior quote.
  // (Audit confirmed: freshness-windowed ranking was the sole cause of 1,528
  // opportunity mismatches — canonical always got equal or better output.)
  const rankingRows = validRows;

  // RouteLatestInput uses snake_case (output_usd, total_fee_bps) but the
  // canonical helpers expect camelCase RankableQuote. Map once here.
  const rankable = rankingRows.map((r) => ({
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
  const latestResult = await pool.query<RouteLatestInput>(
    `SELECT bridge, source, output_usd, input_usd, total_fee_bps, estimated_seconds, ts
     FROM route_latest
     WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4`,
    [src, dst, asset, tier]
  );

  const {
    state, lastSeen, quoteCount, bridgeCount,
    bestBridge, worstBridge, bestOutputUsd, worstOutputUsd, bestFeeBps, spreadBps,
  } = computeRouteStatus(latestResult.rows);

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
      1, // refresh_tier legacy column — always 1 (tier system removed)
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
  price_impact_bps: number | null;
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
            estimated_seconds, rank_by_output, spread_bps, price_impact_bps
     FROM route_latest
     WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4`,
    [src, dst, asset, tier]
  );

  const quotes: NormalizedQuote[] = result.rows
    .filter((row) => {
      // Canonical validity: output_usd > 0.01 AND fee_bps <= 1000 (or null)
      if (Number(row.output_usd) <= 0.01) return false;
      if (row.total_fee_bps != null && row.total_fee_bps > 1000) return false;
      return true;
    })
    .map((row: RouteLatestRow) => ({
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
      priceImpactBps: row.price_impact_bps,
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
}

/** Get matrix data for heatmap: all route_status rows for asset and amount tier. */
export async function getMatrixData(
  asset: Asset,
  tier: number
): Promise<RouteStatus[]> {
  const result = await query<RouteStatusRow>(
    `SELECT src_chain, dst_chain, asset, amount_tier, state, last_seen,
            quote_count, bridge_count, best_bridge, best_output_usd, worst_output_usd,
            spread_bps
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
  }));
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

/**
 * Returns task keys ("src:dst:asset:amountTier") for routes that Squid does NOT
 * currently cover in route_latest. Used to initialise squidGapKeys so gap fill
 * correctly identifies non-Squid routes even when the startup sweep was skipped.
 */
export async function getSquidGapKeys(allTaskKeys: string[]): Promise<string[]> {
  if (allTaskKeys.length === 0) return [];

  const result = await pool.query<{ key: string }>(
    `SELECT DISTINCT
       src_chain || ':' || dst_chain || ':' || asset || ':' || amount_tier::text AS key
     FROM route_latest
     WHERE source = 'squid'`
  );

  const squidCovered = new Set(result.rows.map((r) => r.key));
  return allTaskKeys.filter((key) => !squidCovered.has(key));
}

/** Health check: quote count, oldest quote timestamp, and live aggregator/bridge counts. */
export async function getHealth(): Promise<{
  quoteCount: number;
  oldestQuote: Date | null;
  aggregatorCount: number;
  bridgeCount: number;
}> {
  const [quoteRes, countRes] = await Promise.all([
    query<{ count: string; min_ts: Date | null }>(
      "SELECT COUNT(*)::text AS count, MIN(ts) AS min_ts FROM quotes WHERE ts > NOW() - INTERVAL '24 hours'"
    ),
    query<{ agg_count: string; bridge_count: string }>(
      'SELECT COUNT(DISTINCT source)::text AS agg_count, COUNT(DISTINCT bridge)::text AS bridge_count FROM route_latest'
    ),
  ]);
  const quoteRow = quoteRes.rows[0];
  const countRow = countRes.rows[0];
  return {
    quoteCount: quoteRow ? parseInt(quoteRow.count, 10) : 0,
    oldestQuote: quoteRow?.min_ts ?? null,
    aggregatorCount: countRow ? parseInt(countRow.agg_count, 10) : 0,
    bridgeCount: countRow ? parseInt(countRow.bridge_count, 10) : 0,
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

/**
 * Returns true if Squid specifically has any quotes newer than `withinMs` ms.
 * Used by the scheduler to decide whether to skip the Squid sweep on restart.
 * Unlike hasRecentQuotes, this ignores LI.FI / Bungee / Rango freshness — only
 * Squid data counts. This prevents the sweep from being skipped just because
 * other aggregators have fresh data while Squid's data is completely stale.
 */
export async function hasRecentSquidQuotes(withinMs: number): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM route_latest
       WHERE source = 'squid' AND ts > NOW() - $1::interval
     ) AS exists`,
    [`${withinMs} milliseconds`]
  );
  return result.rows[0]?.exists ?? false;
}
