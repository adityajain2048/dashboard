import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { HEATMAP_ORDER } from '../../config/chains.js';
import { pool } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';

/** Expected heatmap cell count: chains × (chains-1) excluding self. */
const EXPECTED_MATRIX_CELLS = HEATMAP_ORDER.length * (HEATMAP_ORDER.length - 1);

const querySchema = z.object({
  asset: z.enum(['ETH', 'USDC', 'USDT']),
  tier: z.enum(['50', '1000', '50000']),
});

export default async function matrixRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  app.get('/matrix', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid or missing query params', details: parsed.error.flatten() });
    }
    const { asset, tier } = parsed.data;
    const tierNum = parseInt(tier, 10);

    const result = await pool.query<{
      src_chain: string;
      dst_chain: string;
      state: string;
      last_seen: Date | null;
      quote_count: number;
      best_bridge: string | null;
      best_fee_bps: number | null;
      spread_bps: number | null;
    }>(
      'SELECT src_chain, dst_chain, state, last_seen, quote_count, best_bridge, best_fee_bps, spread_bps FROM route_status WHERE asset = $1 AND amount_tier = $2',
      [asset, tierNum]
    );
    const byKey = new Map<string, (typeof result.rows)[0]>();
    for (const row of result.rows) {
      byKey.set(`${row.src_chain}:${row.dst_chain}`, row);
    }

    const cells: Array<{
      src: string;
      dst: string;
      state: string;
      bestFeeBps: number | null;
      bestBridge: string | null;
      quoteCount: number;
      lastSeen: string | null;
    }> = [];
    let active = 0;
    let dead = 0;
    let stale = 0;
    let singleBridge = 0;
    for (const src of HEATMAP_ORDER) {
      for (const dst of HEATMAP_ORDER) {
        if (src === dst) continue;
        const row = byKey.get(`${src}:${dst}`);
        const state = row?.state ?? 'dead';
        if (state === 'active') active++;
        else if (state === 'dead') dead++;
        else if (state === 'stale') stale++;
        else if (state === 'single-bridge') singleBridge++;
        // Use spread_bps as fallback when best_fee_bps is null — fills more cells with data
        const displayBps = row?.best_fee_bps ?? row?.spread_bps ?? null;
        cells.push({
          src,
          dst,
          state,
          bestFeeBps: displayBps,
          bestBridge: row?.best_bridge ?? null,
          quoteCount: row?.quote_count ?? 0,
          lastSeen: row?.last_seen?.toISOString() ?? null,
        });
      }
    }

    if (cells.length !== EXPECTED_MATRIX_CELLS) {
      logger.warn(
        { cellsLength: cells.length, expected: EXPECTED_MATRIX_CELLS, asset, tier },
        'Matrix cell count mismatch — possible data loss or config change'
      );
    }

    return reply.send({
      asset,
      amountTier: tierNum,
      chains: [...HEATMAP_ORDER],
      cells,
      stats: { active, dead, stale, singleBridge },
    });
  });
}
