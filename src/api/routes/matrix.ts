import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { HEATMAP_ORDER } from '../../config/chains.js';
import { pool } from '../../db/connection.js';
import { computeRouteStatus } from '../../db/queries.js';
import type { RouteLatestInput } from '../../db/queries.js';
import { logger } from '../../lib/logger.js';

/** Expected heatmap cell count: chains × (chains-1) excluding self. */
const EXPECTED_MATRIX_CELLS = HEATMAP_ORDER.length * (HEATMAP_ORDER.length - 1);

const querySchema = z.object({
  asset: z.enum(['ETH', 'USDC', 'USDT']),
  tier: z.enum(['50', '1000', '50000']),
});

/** In-memory cache: avoid hammering the DB on every matrix load. */
interface CacheEntry {
  payload: unknown;
  expiresAt: number;
}
const CACHE_TTL_MS = 20_000; // 20 s — fresh enough, fast enough
const cache = new Map<string, CacheEntry>();

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
    const cacheKey = `${asset}:${tier}`;

    // ── Serve from cache if fresh ───────────────────────────────────────────
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return reply.send(cached.payload);
    }

    // ── Query route_latest directly ─────────────────────────────────────────
    // Reading from route_latest (not route_status) ensures the matrix shows the
    // same canonical best bridge as /api/quotes, without the staleness lag of
    // the pre-computed route_status table.
    const result = await pool.query<{
      src_chain: string;
      dst_chain: string;
      bridge: string;
      source: string;
      output_usd: string;
      input_usd: string;
      total_fee_bps: number;
      estimated_seconds: number;
      ts: Date;
    }>(
      `SELECT src_chain, dst_chain, bridge, source, output_usd, input_usd,
              total_fee_bps, estimated_seconds, ts
       FROM route_latest WHERE asset = $1 AND amount_tier = $2`,
      [asset, tierNum]
    );

    // ── Group rows by src:dst ──────────────────────────────────────────────
    const routeMap = new Map<string, RouteLatestInput[]>();
    for (const row of result.rows) {
      const key = `${row.src_chain}:${row.dst_chain}`;
      if (!routeMap.has(key)) routeMap.set(key, []);
      routeMap.get(key)!.push({
        bridge: row.bridge,
        source: row.source,
        output_usd: row.output_usd,
        input_usd: row.input_usd,
        total_fee_bps: row.total_fee_bps,
        estimated_seconds: row.estimated_seconds,
        ts: row.ts,
      });
    }

    // ── Build cells ─────────────────────────────────────────────────────────
    const cells: Array<{
      src: string;
      dst: string;
      state: string;
      bestFeeBps: number | null;
      bestBridge: string | null;
      quoteCount: number;
    }> = [];
    let active = 0;
    let dead = 0;
    let stale = 0;
    let singleBridge = 0;

    for (const src of HEATMAP_ORDER) {
      for (const dst of HEATMAP_ORDER) {
        if (src === dst) continue;
        const rows = routeMap.get(`${src}:${dst}`) ?? [];
        const { state, bestBridge, bestFeeBps, quoteCount } = computeRouteStatus(rows);

        if (state === 'active') active++;
        else if (state === 'dead') dead++;
        else if (state === 'stale') stale++;
        else if (state === 'single-bridge') singleBridge++;

        cells.push({ src, dst, state, bestFeeBps, bestBridge, quoteCount });
      }
    }

    if (cells.length !== EXPECTED_MATRIX_CELLS) {
      logger.warn(
        { cellsLength: cells.length, expected: EXPECTED_MATRIX_CELLS, asset, tier },
        'Matrix cell count mismatch — possible data loss or config change'
      );
    }

    const payload = {
      asset,
      amountTier: tierNum,
      chains: [...HEATMAP_ORDER],
      cells,
      stats: { active, dead, stale, singleBridge },
    };

    // ── Store in cache ─────────────────────────────────────────────────────
    cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });

    return reply.send(payload);
  });
}
