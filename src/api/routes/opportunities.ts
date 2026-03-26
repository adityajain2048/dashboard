import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/connection.js';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  minSpreadBps: z.coerce.number().min(0).default(0),
  asset: z.enum(['ETH', 'USDC', 'USDT']).optional(),
  tier: z.enum(['50', '1000', '50000']).optional(),
});

export default async function opportunitiesRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  app.get('/opportunities', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten() });
    }
    const { limit, minSpreadBps, asset, tier } = parsed.data;

    let sql = `SELECT src_chain, dst_chain, asset, amount_tier, spread_bps, best_bridge, best_output_usd, worst_output_usd, quote_count, last_seen
      FROM route_status WHERE state = 'active' AND spread_bps >= $1
      AND best_fee_bps IS NOT NULL AND best_fee_bps < 1000`;
    const params: (string | number)[] = [minSpreadBps];
    if (asset) {
      params.push(asset);
      sql += ` AND asset = $${params.length}`;
    }
    if (tier) {
      params.push(parseInt(tier, 10));
      sql += ` AND amount_tier = $${params.length}`;
    }
    sql += ` ORDER BY spread_bps DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query<{
      src_chain: string;
      dst_chain: string;
      asset: string;
      amount_tier: number;
      spread_bps: number;
      best_bridge: string | null;
      best_output_usd: string | null;
      worst_output_usd: string | null;
      quote_count: number;
      last_seen: Date | null;
    }>(sql, params);

    const countParams: (string | number)[] = ['active', minSpreadBps];
    let countSql = 'SELECT COUNT(*)::text FROM route_status WHERE state = $1 AND spread_bps >= $2 AND best_fee_bps IS NOT NULL AND best_fee_bps < 1000';
    if (asset) {
      countParams.push(asset);
      countSql += ` AND asset = $${countParams.length}`;
    }
    if (tier) {
      countParams.push(parseInt(tier, 10));
      countSql += ` AND amount_tier = $${countParams.length}`;
    }
    const countResult = await pool.query<{ count: string }>(countSql, countParams);
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const opportunities = result.rows.map((r) => ({
      src: r.src_chain,
      dst: r.dst_chain,
      asset: r.asset,
      amountTier: r.amount_tier,
      spreadBps: r.spread_bps,
      bestBridge: r.best_bridge,
      bestOutputUsd: r.best_output_usd,
      worstBridge: null as string | null,
      worstOutputUsd: r.worst_output_usd,
      quoteCount: r.quote_count,
      lastSeen: r.last_seen?.toISOString() ?? null,
    }));

    return reply.send({ opportunities, total });
  });
}
