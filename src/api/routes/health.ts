import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getHealth, getRouteLatestMaxTs } from '../../db/queries.js';
import { pool } from '../../db/connection.js';

const startTime = Date.now();

/** A route is considered stale if its newest quote is older than 3 hours. */
const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000;

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

    const { quoteCount, oldestQuote, aggregatorCount, bridgeCount } = dbConnected
      ? await getHealth()
      : { quoteCount: 0, oldestQuote: null as Date | null, aggregatorCount: 0, bridgeCount: 0 };

    // Most-recent quote timestamp across all routes (any tier)
    const rows = dbConnected ? await getRouteLatestMaxTs() : [];
    let lastRefresh: Date | null = null;
    for (const r of rows) {
      if (!lastRefresh || r.last_ts > lastRefresh) lastRefresh = r.last_ts;
    }

    let status: 'ok' | 'degraded' | 'down' = 'down';
    if (dbConnected) {
      status = lastRefresh && Date.now() - lastRefresh.getTime() < STALE_THRESHOLD_MS
        ? 'ok'
        : 'degraded';
    }

    const uptime = Math.floor((Date.now() - startTime) / 1000);
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    return reply.send({
      status,
      uptime,
      lastFetch: {
        lastRefresh: lastRefresh?.toISOString() ?? null,
      },
      db: {
        connected: dbConnected,
        quoteCount,
        oldestQuote: oldestQuote?.toISOString() ?? null,
        aggregatorCount,
        bridgeCount,
      },
    });
  });
}
