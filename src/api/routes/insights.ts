import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../db/connection.js';

interface BestWorstRow {
  src_chain: string; dst_chain: string; asset: string;
  amount_tier: number; best_fee_bps: number; best_bridge: string;
}
interface SpreadRow {
  src_chain: string; dst_chain: string; asset: string;
  amount_tier: number; spread_bps: number; best_bridge: string; quote_count: number;
}
interface StateRow { state: string; count: string }
interface DominanceRow { best_bridge: string; wins: string }
interface CountRow { count: string }

export default async function insightsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  app.get('/insights/daily', async (_req, reply) => {
    const [bestRes, worstRes, spreadRes, stateRes, domRes, monoRes] = await Promise.all([
      // Best route (lowest fee)
      query<BestWorstRow>(
        `SELECT src_chain, dst_chain, asset, amount_tier, best_fee_bps, best_bridge
         FROM route_status
         WHERE state = 'active' AND best_fee_bps IS NOT NULL AND best_fee_bps >= 0
         ORDER BY best_fee_bps ASC LIMIT 1`
      ),
      // Worst route (highest fee, capped at 5000 to filter junk)
      query<BestWorstRow>(
        `SELECT src_chain, dst_chain, asset, amount_tier, best_fee_bps, best_bridge
         FROM route_status
         WHERE state = 'active' AND best_fee_bps IS NOT NULL AND best_fee_bps < 5000
         ORDER BY best_fee_bps DESC LIMIT 1`
      ),
      // Biggest spreads (exclude broken routes where best fee > 10%)
      query<SpreadRow>(
        `SELECT src_chain, dst_chain, asset, amount_tier, spread_bps, best_bridge, quote_count
         FROM route_status
         WHERE state = 'active' AND spread_bps IS NOT NULL AND spread_bps > 0
           AND best_fee_bps IS NOT NULL AND best_fee_bps < 1000
         ORDER BY spread_bps DESC LIMIT 5`
      ),
      // Route health summary
      query<StateRow>(
        `SELECT state, COUNT(*) AS count FROM route_status GROUP BY state`
      ),
      // Bridge dominance
      query<DominanceRow>(
        `SELECT best_bridge, COUNT(*) AS wins
         FROM route_status
         WHERE state IN ('active', 'single-bridge') AND best_bridge IS NOT NULL
         GROUP BY best_bridge ORDER BY wins DESC LIMIT 5`
      ),
      // Monopoly routes
      query<CountRow>(
        `SELECT COUNT(*) AS count FROM route_status WHERE state = 'single-bridge'`
      ),
    ]);

    const best = bestRes.rows[0];
    const worst = worstRes.rows[0];

    const stateMap: Record<string, number> = {};
    for (const r of stateRes.rows) stateMap[r.state] = parseInt(r.count, 10);

    return reply.send({
      generatedAt: new Date().toISOString(),
      bestRoute: best ? {
        src: best.src_chain, dst: best.dst_chain, asset: best.asset,
        feeBps: best.best_fee_bps, bridge: best.best_bridge,
      } : null,
      worstRoute: worst ? {
        src: worst.src_chain, dst: worst.dst_chain, asset: worst.asset,
        feeBps: worst.best_fee_bps, bridge: worst.best_bridge,
      } : null,
      biggestSpreads: spreadRes.rows.map(r => ({
        src: r.src_chain, dst: r.dst_chain, asset: r.asset,
        spreadBps: r.spread_bps, bridge: r.best_bridge, quoteCount: r.quote_count,
      })),
      routeHealth: {
        active: stateMap['active'] ?? 0,
        dead: stateMap['dead'] ?? 0,
        stale: stateMap['stale'] ?? 0,
        singleBridge: stateMap['single-bridge'] ?? 0,
      },
      bridgeDominance: domRes.rows.map(r => ({
        bridge: r.best_bridge, wins: parseInt(r.wins, 10),
      })),
      monopolyRouteCount: parseInt(monoRes.rows[0]?.count ?? '0', 10),
    });
  });
}
