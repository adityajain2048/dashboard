import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/connection.js';
import { computeRouteStatus } from '../../db/queries.js';
import type { RouteLatestInput } from '../../db/queries.js';
import { getRouteTier } from '../../config/routes.js';

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  minSpreadBps: z.coerce.number().min(0).default(0),
  asset: z.enum(['ETH', 'USDC', 'USDT']).optional(),
  tier: z.enum(['50', '1000', '50000']).optional(),
});

/** 30 s cache — opportunities are computed from route_latest which is large. */
interface CacheEntry { payload: unknown; expiresAt: number }
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

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

    const cacheKey = `${asset ?? '*'}:${tier ?? '*'}:${minSpreadBps}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      // Apply limit to cached result (limit may differ between callers)
      const cachedData = cached.payload as { opportunities: unknown[]; total: number };
      return reply.send({
        opportunities: cachedData.opportunities.slice(0, limit),
        total: cachedData.total,
      });
    }

    // ── Query route_latest ─────────────────────────────────────────────────
    // Compute best/worst per route in application code using the canonical
    // comparator so Opportunities always agrees with /api/quotes and /api/matrix.
    const params: (string | number)[] = [];
    let sql = `SELECT src_chain, dst_chain, asset, amount_tier,
                      bridge, source, output_usd, input_usd, total_fee_bps, estimated_seconds, ts
               FROM route_latest`;
    const conditions: string[] = [];
    if (asset) {
      params.push(asset);
      conditions.push(`asset = $${params.length}`);
    }
    if (tier) {
      params.push(parseInt(tier, 10));
      conditions.push(`amount_tier = $${params.length}`);
    }
    if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query<{
      src_chain: string;
      dst_chain: string;
      asset: string;
      amount_tier: number;
      bridge: string;
      source: string;
      output_usd: string;
      input_usd: string;
      total_fee_bps: number;
      estimated_seconds: number;
      ts: Date;
    }>(sql, params);

    // ── Group by (src, dst, asset, tier) ──────────────────────────────────
    const routeMap = new Map<string, RouteLatestInput[]>();
    const routeMeta = new Map<string, { src: string; dst: string; asset: string; amountTier: number }>();

    for (const row of result.rows) {
      const key = `${row.src_chain}:${row.dst_chain}:${row.asset}:${row.amount_tier}`;
      if (!routeMap.has(key)) {
        routeMap.set(key, []);
        routeMeta.set(key, {
          src: row.src_chain,
          dst: row.dst_chain,
          asset: row.asset,
          amountTier: row.amount_tier,
        });
      }
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

    // ── Compute per-route status and filter ────────────────────────────────
    const opportunities: Array<{
      src: string; dst: string; asset: string; amountTier: number;
      spreadBps: number; bestBridge: string | null; worstBridge: string | null;
      bestOutputUsd: string | null; worstOutputUsd: string | null;
      quoteCount: number; lastSeen: string | null;
    }> = [];

    for (const [key, rows] of routeMap) {
      const meta = routeMeta.get(key)!;
      const refreshTier = getRouteTier(meta.src, meta.dst);
      const {
        state, bestBridge, worstBridge, bestOutputUsd, worstOutputUsd,
        spreadBps, bestFeeBps, quoteCount, lastSeen,
      } = computeRouteStatus(rows, refreshTier);

      // Only include live routes with meaningful spread and reasonable fee
      if (state !== 'active' && state !== 'single-bridge') continue;
      if ((spreadBps ?? 0) < minSpreadBps) continue;
      if (bestFeeBps == null || bestFeeBps >= 1000) continue;

      opportunities.push({
        src: meta.src,
        dst: meta.dst,
        asset: meta.asset,
        amountTier: meta.amountTier,
        spreadBps: spreadBps ?? 0,
        bestBridge,
        worstBridge,
        bestOutputUsd,
        worstOutputUsd,
        quoteCount,
        lastSeen: lastSeen?.toISOString() ?? null,
      });
    }

    // Sort by spread DESC (largest arbitrage first)
    opportunities.sort((a, b) => b.spreadBps - a.spreadBps);
    const total = opportunities.length;

    const payload = { opportunities, total };
    cache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });

    return reply.send({
      opportunities: opportunities.slice(0, limit),
      total,
    });
  });
}
