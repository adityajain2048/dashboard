import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getHealth, getRouteLatestMaxTs } from '../../db/queries.js';
import { getRouteTier } from '../../config/routes.js';
import { pool } from '../../db/connection.js';

const startTime = Date.now();
const STALE_T1_MS = 5 * 60 * 1000;

export default async function healthRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  app.get('/health', async (_req, reply) => {
    let dbConnected = false;
    try {
      await pool.query('SELECT 1');
      dbConnected = true;
    } catch {
      // ignore
    }

    const { quoteCount, oldestQuote } = dbConnected ? await getHealth() : { quoteCount: 0, oldestQuote: null as Date | null };
    const rows = dbConnected ? await getRouteLatestMaxTs() : [];
    let tier1: Date | null = null;
    let tier2: Date | null = null;
    let tier3: Date | null = null;
    for (const r of rows) {
      const tier = getRouteTier(r.src_chain, r.dst_chain);
      const t = r.last_ts;
      if (tier === 1 && (!tier1 || t > tier1)) tier1 = t;
      if (tier === 2 && (!tier2 || t > tier2)) tier2 = t;
      if (tier === 3 && (!tier3 || t > tier3)) tier3 = t;
    }

    let status: 'ok' | 'degraded' | 'down' = 'down';
    if (dbConnected) {
      status = tier1 && Date.now() - tier1.getTime() < STALE_T1_MS ? 'ok' : 'degraded';
    }

    const uptime = Math.floor((Date.now() - startTime) / 1000);
    return reply.send({
      status,
      uptime,
      lastFetch: {
        tier1: tier1?.toISOString() ?? null,
        tier2: tier2?.toISOString() ?? null,
        tier3: tier3?.toISOString() ?? null,
      },
      db: {
        connected: dbConnected,
        quoteCount,
        oldestQuote: oldestQuote?.toISOString() ?? null,
      },
    });
  });
}
