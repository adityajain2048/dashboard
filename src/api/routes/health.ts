import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getHealth, getRouteLatestMaxTs } from '../../db/queries.js';
import { pool } from '../../db/connection.js';

const startTime = Date.now();

/** A route is considered stale if its newest quote is older than 4 hours. */
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000;

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

    // Per-combo priced corridor counts — all 9 asset×tier combinations.
    // "priced" = distinct (src,dst) pairs that have at least one quote at that combo.
    // Also compute total unique corridors (any asset/tier) vs total possible (56×55).
    interface ComboRow { asset: string; amount_tier: string; priced: string }
    interface TotalRow  { unique_corridors: string }
    const [comboRes, totalRes] = dbConnected
      ? await Promise.all([
          pool.query<ComboRow>(
            `SELECT asset, amount_tier::text,
                    COUNT(DISTINCT src_chain||':'||dst_chain)::text AS priced
             FROM route_latest
             GROUP BY asset, amount_tier
             ORDER BY asset, amount_tier`
          ),
          pool.query<TotalRow>(
            `SELECT COUNT(DISTINCT src_chain||':'||dst_chain)::text AS unique_corridors
             FROM route_latest`
          ),
        ])
      : [{ rows: [] as ComboRow[] }, { rows: [{ unique_corridors: '0' }] as TotalRow[] }];

    const perCombo = comboRes.rows.map((r) => ({
      asset: r.asset,
      tier: parseInt(r.amount_tier, 10),
      priced: parseInt(r.priced, 10),
    }));
    const totalPricedCorridors = parseInt(totalRes.rows[0]?.unique_corridors ?? '0', 10);
    const TOTAL_POSSIBLE = 56 * 55; // 3080

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
        totalPricedCorridors,
        totalPossibleCorridors: TOTAL_POSSIBLE,
        zeroCoverageCorridors: TOTAL_POSSIBLE - totalPricedCorridors,
        perCombo,
      },
    });
  });
}
