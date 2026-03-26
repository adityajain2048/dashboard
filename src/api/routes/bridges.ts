import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { query } from '../../db/connection.js';
import { normalizeBridge, BRIDGES, BRIDGE_SUPPORTED_CHAINS, getBridgeMaxRoutes } from '../../config/bridges.js';

/** Canonical display names for known bridges */
const BRIDGE_NAMES: Record<string, string> = {
  across: 'Across', stargate: 'Stargate', relay: 'Relay', debridge: 'deBridge',
  symbiosis: 'Symbiosis', hop: 'Hop', cbridge: 'cBridge', orbiter: 'Orbiter',
  mayan: 'Mayan', meson: 'Meson', everclear: 'Everclear', thorchain: 'THORChain',
  wormhole: 'Wormhole', cctp: 'CCTP', allbridge: 'Allbridge', chainflip: 'Chainflip',
  garden: 'Garden', hyperlane: 'Hyperlane', squid: 'Squid', synapse: 'Synapse',
  gaszip: 'GasZip', bridgers: 'Bridgers', changenow: 'ChangeNOW', via: 'Via Protocol',
  'arbitrum-bridge': 'Arbitrum Bridge', 'optimism-bridge': 'Optimism Bridge',
  'mantle-native-bridge': 'Mantle Bridge', near: 'NEAR', glacis: 'Glacis',
  polymer: 'Polymer', eco: 'Eco', multichain: 'Multichain',
};

function getBridgeDisplayName(slug: string): string {
  return BRIDGE_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Merge rows that map to the same canonical bridge ID */
function mergeByCanonical<T extends { bridge: string }>(
  rows: T[],
  mergeValues: (a: T, b: T) => T
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const canonical = normalizeBridge(row.bridge);
    const existing = map.get(canonical);
    if (existing) {
      map.set(canonical, mergeValues(existing, { ...row, bridge: canonical }));
    } else {
      map.set(canonical, { ...row, bridge: canonical });
    }
  }
  return Array.from(map.values());
}

interface CoverageRow { bridge: string; routes_covered: string }
interface WinRow { bridge: string; wins: string }
interface FeeRow { bridge: string; avg_fee_bps: string }
interface TotalRow { total: string }
interface TierWinRow { amount_tier: number; best_bridge: string; wins: string }
interface AggHealthRow {
  source: string; success_count: string; error_count: string;
  timeout_count: string; no_route_count: string; total_count: string;
  avg_response_ms: string | null;
}
interface BridgeLivenessRow {
  bridge: string; active_quotes: string; corridors: string; last_seen: string | null;
}
interface CorridorRow {
  src_chain: string; dst_chain: string; asset: string; amount_tier: number;
  output_usd: string; total_fee_bps: number; estimated_seconds: number; source: string;
  best_bridge: string | null; spread_bps: number | null; quote_count: number;
}

export default async function bridgesRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {

  // ─── GET /bridges/coverage ───
  app.get('/bridges/coverage', async (req, reply) => {
    const bridgeParam = (req.query as Record<string, string>).bridge;

    if (bridgeParam) {
      const parsed = z.string().min(1).max(50).safeParse(bridgeParam);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid bridge param' });
      const canonical = normalizeBridge(parsed.data);

      const { rows } = await query<CorridorRow>(
        `SELECT rl.src_chain, rl.dst_chain, rl.asset, rl.amount_tier,
                rl.output_usd, rl.total_fee_bps, rl.estimated_seconds, rl.source,
                rs.best_bridge, rs.spread_bps, rs.quote_count
         FROM route_latest rl
         LEFT JOIN route_status rs
           ON rl.src_chain = rs.src_chain AND rl.dst_chain = rs.dst_chain
           AND rl.asset = rs.asset AND rl.amount_tier = rs.amount_tier
         WHERE rl.bridge = $1
         ORDER BY rl.total_fee_bps ASC`,
        [canonical]
      );
      return reply.send({ bridge: canonical, corridors: rows });
    }

    // Overview mode — 4 queries in parallel
    const [coverageRes, winsRes, feeRes, totalRes] = await Promise.all([
      query<CoverageRow>(
        `SELECT bridge, COUNT(DISTINCT src_chain || ':' || dst_chain) AS routes_covered
         FROM route_latest GROUP BY bridge ORDER BY routes_covered DESC`
      ),
      query<WinRow>(
        `SELECT best_bridge AS bridge, COUNT(*) AS wins
         FROM route_status
         WHERE state IN ('active', 'single-bridge') AND best_bridge IS NOT NULL
         GROUP BY best_bridge`
      ),
      query<FeeRow>(
        `SELECT best_bridge AS bridge, AVG(best_fee_bps) AS avg_fee_bps
         FROM route_status
         WHERE state IN ('active', 'single-bridge') AND best_bridge IS NOT NULL AND best_fee_bps IS NOT NULL
         GROUP BY best_bridge`
      ),
      query<TotalRow>(
        `SELECT COUNT(*) AS total FROM route_status WHERE state IN ('active', 'single-bridge')`
      ),
    ]);

    const totalActiveRoutes = parseInt(totalRes.rows[0]?.total ?? '0', 10);

    // Merge coverage rows by canonical bridge
    const mergedCoverage = mergeByCanonical(coverageRes.rows, (a, b) => ({
      ...a,
      routes_covered: String(parseInt(a.routes_covered, 10) + parseInt(b.routes_covered, 10)),
    }));
    // Merge wins by canonical
    const mergedWins = mergeByCanonical(winsRes.rows, (a, b) => ({
      ...a,
      wins: String(parseInt(a.wins, 10) + parseInt(b.wins, 10)),
    }));
    // Merge fees by canonical (average)
    const feeAccum = new Map<string, { sum: number; count: number }>();
    for (const r of feeRes.rows) {
      const canonical = normalizeBridge(r.bridge);
      const existing = feeAccum.get(canonical);
      const val = parseFloat(r.avg_fee_bps);
      if (existing) {
        existing.sum += val;
        existing.count += 1;
      } else {
        feeAccum.set(canonical, { sum: val, count: 1 });
      }
    }
    const feeMap = new Map<string, number>();
    for (const [k, v] of feeAccum) {
      feeMap.set(k, v.sum / v.count);
    }

    const winsMap = new Map(mergedWins.map(r => [r.bridge, parseInt(r.wins, 10)]));

    // Sort by routes covered descending
    mergedCoverage.sort((a, b) => parseInt(b.routes_covered, 10) - parseInt(a.routes_covered, 10));

    const bridges = mergedCoverage.map(r => {
      const id = r.bridge;
      const routesCovered = parseInt(r.routes_covered, 10);
      const wins = winsMap.get(id) ?? 0;
      const supportedChains = BRIDGE_SUPPORTED_CHAINS[id] ?? [];
      const maxRoutes = getBridgeMaxRoutes(id);
      return {
        id,
        name: getBridgeDisplayName(id),
        routesCovered,
        routesCoveredPct: totalActiveRoutes > 0 ? Math.round(routesCovered / totalActiveRoutes * 1000) / 10 : 0,
        wins,
        winRate: totalActiveRoutes > 0 ? Math.round(wins / totalActiveRoutes * 1000) / 10 : 0,
        avgFeeBps: feeMap.get(id) ?? null,
        avgResponseMs: null as number | null,
        successRate: null as number | null,
        supportedChains: supportedChains as string[],
        maxRoutes,
        chainCoveragePct: maxRoutes > 0 ? Math.round(routesCovered / maxRoutes * 1000) / 10 : 0,
      };
    });

    return reply.send({
      bridges,
      totalActiveRoutes,
      totalTrackedBridges: Object.keys(BRIDGES).length,
    });
  });

  // ─── GET /bridges/win-rate-by-tier ───
  app.get('/bridges/win-rate-by-tier', async (_req, reply) => {
    const { rows } = await query<TierWinRow>(
      `SELECT amount_tier, best_bridge, COUNT(*) AS wins
       FROM route_status
       WHERE state IN ('active', 'single-bridge') AND best_bridge IS NOT NULL
       GROUP BY amount_tier, best_bridge
       ORDER BY amount_tier, wins DESC`
    );

    // Normalize and merge
    const tierMap = new Map<number, Map<string, number>>();
    for (const r of rows) {
      const canonical = normalizeBridge(r.best_bridge);
      const wins = parseInt(r.wins, 10);
      if (!tierMap.has(r.amount_tier)) tierMap.set(r.amount_tier, new Map());
      const bridgeMap = tierMap.get(r.amount_tier)!;
      bridgeMap.set(canonical, (bridgeMap.get(canonical) ?? 0) + wins);
    }

    const tiers = Array.from(tierMap.entries()).map(([amountTier, bridgeMap]) => {
      const bridgeList = Array.from(bridgeMap.entries())
        .map(([bridge, wins]) => ({ bridge, wins }))
        .sort((a, b) => b.wins - a.wins);
      const totalWins = bridgeList.reduce((s, b) => s + b.wins, 0);
      return {
        amountTier,
        bridges: bridgeList.map(b => ({
          bridge: b.bridge,
          wins: b.wins,
          pct: totalWins > 0 ? Math.round(b.wins / totalWins * 1000) / 10 : 0,
        })),
      };
    });

    return reply.send({ tiers });
  });

  // ─── GET /bridges/health ───
  app.get('/bridges/health', async (_req, reply) => {
    const [aggRes, livenessRes] = await Promise.all([
      query<AggHealthRow>(
        `SELECT source,
           COUNT(*) FILTER (WHERE status = 'success') AS success_count,
           COUNT(*) FILTER (WHERE status = 'error') AS error_count,
           COUNT(*) FILTER (WHERE status = 'timeout') AS timeout_count,
           COUNT(*) FILTER (WHERE status = 'no_route') AS no_route_count,
           COUNT(*) AS total_count,
           AVG(response_ms) FILTER (WHERE status = 'success') AS avg_response_ms
         FROM fetch_log
         WHERE ts > NOW() - INTERVAL '24 hours'
         GROUP BY source`
      ),
      query<BridgeLivenessRow>(
        `SELECT bridge, COUNT(*) AS active_quotes,
           MAX(ts) AS last_seen,
           COUNT(DISTINCT src_chain || ':' || dst_chain) AS corridors
         FROM route_latest
         GROUP BY bridge`
      ),
    ]);

    const now = Date.now();
    const STALE_MS = 15 * 60 * 1000;

    const aggregators = aggRes.rows.map(r => {
      const successCount = parseInt(r.success_count, 10);
      const errorCount = parseInt(r.error_count, 10);
      const timeoutCount = parseInt(r.timeout_count, 10);
      const noRouteCount = parseInt(r.no_route_count, 10);
      const totalCount = parseInt(r.total_count, 10);
      const actionable = totalCount - noRouteCount;
      return {
        id: r.source,
        successCount, errorCount, timeoutCount, noRouteCount, totalCount,
        successRate: actionable > 0 ? Math.round(successCount / actionable * 1000) / 10 : 0,
        avgResponseMs: r.avg_response_ms ? Math.round(parseFloat(r.avg_response_ms)) : null,
      };
    });

    // Merge liveness by canonical bridge
    const livenessMap = new Map<string, { activeQuotes: number; corridors: number; lastSeen: string | null }>();
    for (const r of livenessRes.rows) {
      const canonical = normalizeBridge(r.bridge);
      const existing = livenessMap.get(canonical);
      const lastSeen = r.last_seen ? new Date(r.last_seen).toISOString() : null;
      if (existing) {
        existing.activeQuotes += parseInt(r.active_quotes, 10);
        existing.corridors += parseInt(r.corridors, 10);
        if (lastSeen && (!existing.lastSeen || lastSeen > existing.lastSeen)) {
          existing.lastSeen = lastSeen;
        }
      } else {
        livenessMap.set(canonical, {
          activeQuotes: parseInt(r.active_quotes, 10),
          corridors: parseInt(r.corridors, 10),
          lastSeen,
        });
      }
    }

    const bridges = Array.from(livenessMap.entries()).map(([id, data]) => ({
      id,
      activeQuotes: data.activeQuotes,
      corridors: data.corridors,
      lastSeen: data.lastSeen,
      isStale: data.lastSeen ? (now - new Date(data.lastSeen).getTime()) > STALE_MS : true,
    }));

    return reply.send({ aggregators, bridges });
  });
}
