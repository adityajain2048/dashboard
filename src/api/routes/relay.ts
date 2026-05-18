import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../../db/connection.js';
import { BRIDGE_SUPPORTED_CHAINS } from '../../config/bridges.js';

// All known slugs for Relay in route_latest (normalization may not be deployed yet)
const RELAY_SLUGS = ['relay', 'relaydepository', 'relay_bridge', 'relaybridge', 'relay-bridge'];

export default async function relayRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  app.get('/relay/report', async (_req, reply) => {
    const [winsRes, statsRes, marketRes, lossesRes, competitorsRes, matrixRes] = await Promise.all([
      // Q1: Relay wins
      pool.query<{ wins: string }>(
        `SELECT COUNT(*) AS wins FROM route_status
         WHERE best_bridge = ANY($1) AND state IN ('active','single-bridge')`,
        [RELAY_SLUGS]
      ),

      // Q2: Relay quote stats
      pool.query<{ total_quotes: string; relay_avg_fee: string; relay_corridors: string }>(
        `SELECT COUNT(*) AS total_quotes,
                AVG(total_fee_bps) AS relay_avg_fee,
                COUNT(DISTINCT src_chain || ':' || dst_chain) AS relay_corridors
         FROM route_latest WHERE bridge = ANY($1)`,
        [RELAY_SLUGS]
      ),

      // Q3: Market average fee
      pool.query<{ market_avg_fee: string }>(
        `SELECT AVG(best_fee_bps) AS market_avg_fee FROM route_status
         WHERE state IN ('active','single-bridge') AND best_fee_bps IS NOT NULL AND best_fee_bps < 5000`
      ),

      // Q4: Losses (routes where Relay loses)
      pool.query<{
        src_chain: string; dst_chain: string; asset: string; amount_tier: number;
        relay_output: string; relay_fee_bps: number;
        best_output_usd: string; best_fee_bps: number;
        winner: string; gap_bps: number; bridge_count: number;
      }>(
        `SELECT rs.src_chain, rs.dst_chain, rs.asset, rs.amount_tier,
                rl.output_usd AS relay_output, rl.total_fee_bps AS relay_fee_bps,
                rs.best_output_usd, rs.best_fee_bps, rs.best_bridge AS winner,
                ROUND((CAST(rs.best_output_usd AS NUMERIC) - CAST(rl.output_usd AS NUMERIC))
                      / NULLIF(CAST(rs.best_output_usd AS NUMERIC), 0) * 10000) AS gap_bps,
                rs.bridge_count
         FROM route_status rs
         JOIN route_latest rl ON rs.src_chain = rl.src_chain AND rs.dst_chain = rl.dst_chain
           AND rs.asset = rl.asset AND rs.amount_tier = rl.amount_tier
         WHERE rl.bridge = ANY($1) AND rs.best_bridge != ALL($1)
           AND rs.state IN ('active','single-bridge')
           AND CAST(rl.output_usd AS NUMERIC) > 0
         ORDER BY gap_bps DESC`,
        [RELAY_SLUGS]
      ),

      // Q5: Competitor breakdown
      pool.query<{ competitor: string; beat_count: string; avg_gap_bps: string }>(
        `SELECT rs.best_bridge AS competitor, COUNT(*) AS beat_count,
                AVG(ROUND((CAST(rs.best_output_usd AS NUMERIC) - CAST(rl.output_usd AS NUMERIC))
                    / NULLIF(CAST(rs.best_output_usd AS NUMERIC), 0) * 10000)) AS avg_gap_bps
         FROM route_status rs
         JOIN route_latest rl ON rs.src_chain = rl.src_chain AND rs.dst_chain = rl.dst_chain
           AND rs.asset = rl.asset AND rs.amount_tier = rl.amount_tier
         WHERE rl.bridge = ANY($1) AND rs.best_bridge != ALL($1)
           AND rs.state IN ('active','single-bridge')
           AND CAST(rl.output_usd AS NUMERIC) > 0
         GROUP BY rs.best_bridge ORDER BY beat_count DESC`,
        [RELAY_SLUGS]
      ),

      // Q6: Chain pair fee matrix
      pool.query<{
        src_chain: string; dst_chain: string;
        relay_avg_fee_bps: string; quote_count: string; has_win: boolean;
      }>(
        `SELECT rl.src_chain, rl.dst_chain,
                AVG(rl.total_fee_bps) AS relay_avg_fee_bps,
                COUNT(*) AS quote_count,
                BOOL_OR(rs.best_bridge = ANY($1)) AS has_win
         FROM route_latest rl
         LEFT JOIN route_status rs ON rl.src_chain = rs.src_chain AND rl.dst_chain = rs.dst_chain
           AND rl.asset = rs.asset AND rl.amount_tier = rs.amount_tier
         WHERE rl.bridge = ANY($1)
         GROUP BY rl.src_chain, rl.dst_chain`,
        [RELAY_SLUGS]
      ),
    ]);

    // Parse results
    const wins = parseInt(winsRes.rows[0]?.wins ?? '0', 10);
    const totalQuotes = parseInt(statsRes.rows[0]?.total_quotes ?? '0', 10);
    const relayAvgFee = parseFloat(statsRes.rows[0]?.relay_avg_fee ?? '0');
    const relayCorridors = parseInt(statsRes.rows[0]?.relay_corridors ?? '0', 10);
    const marketAvgFee = parseFloat(marketRes.rows[0]?.market_avg_fee ?? '0');

    const losses = lossesRes.rows.length;
    const totalRoutes = wins + losses;
    const winRate = totalRoutes > 0 ? Math.round(wins / totalRoutes * 1000) / 10 : 0;

    // Coverage gaps
    const relayChains = BRIDGE_SUPPORTED_CHAINS['relay'] ?? [];
    const maxRoutes = relayChains.length * (relayChains.length - 1);
    const activeChainPairs = new Set(matrixRes.rows.map(r => `${r.src_chain}:${r.dst_chain}`));
    const coverageGaps: string[] = [];
    for (const src of relayChains) {
      for (const dst of relayChains) {
        if (src !== dst && !activeChainPairs.has(`${src}:${dst}`)) {
          coverageGaps.push(`${src}:${dst}`);
        }
      }
    }

    return reply.send({
      generatedAt: new Date().toISOString(),
      summary: {
        totalRelayQuotes: totalQuotes,
        relayCorridors,
        wins,
        losses,
        winRate,
        relayAvgFeeBps: Math.round(relayAvgFee),
        marketAvgFeeBps: Math.round(marketAvgFee),
        feeAdvantage: Math.round(marketAvgFee - relayAvgFee),
        maxPossibleRoutes: maxRoutes,
        coveragePct: maxRoutes > 0 ? Math.round(relayCorridors / maxRoutes * 1000) / 10 : 0,
      },
      losses: lossesRes.rows.map(r => ({
        srcChain: r.src_chain, dstChain: r.dst_chain,
        asset: r.asset, amountTier: r.amount_tier,
        relayOutput: r.relay_output, relayFeeBps: r.relay_fee_bps,
        bestOutput: r.best_output_usd, bestFeeBps: r.best_fee_bps,
        winner: r.winner, gapBps: Number(r.gap_bps), bridgeCount: r.bridge_count,
      })),
      competitors: competitorsRes.rows.map(r => ({
        bridge: r.competitor,
        beatCount: parseInt(r.beat_count, 10),
        avgGapBps: Math.round(parseFloat(r.avg_gap_bps)),
      })),
      chainPairMatrix: matrixRes.rows.map(r => ({
        srcChain: r.src_chain, dstChain: r.dst_chain,
        relayAvgFeeBps: Math.round(parseFloat(r.relay_avg_fee_bps)),
        quoteCount: parseInt(r.quote_count, 10),
        hasWin: r.has_win,
      })),
      coverageGaps,
    });
  });
}
