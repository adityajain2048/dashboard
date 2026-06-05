/**
 * Backfill route_status by recomputing all rows from route_latest.
 *
 * ⚠️  REQUIRES EXPLICIT AUTHORIZATION BEFORE RUNNING ⚠️
 *
 * This script reads every distinct (src_chain, dst_chain, asset, amount_tier)
 * combination from route_latest and calls updateRouteStatus for each, writing
 * the corrected best_bridge, worst_bridge, spread_bps, and best_fee_bps values
 * back into route_status.
 *
 * Run ONLY after deploying the computeRouteStatus fix (freshness window removal).
 * Without the code fix this script will write the same wrong values.
 *
 * Usage (from repo root, after `npm run build`):
 *   node --experimental-specifier-resolution=node dist/scripts/backfillRouteStatus.js
 * Or with ts-node:
 *   npx ts-node --esm src/scripts/backfillRouteStatus.ts
 *
 * The matrix and /api/opportunities endpoints do NOT need this backfill —
 * both read route_latest directly and recompute on each request.
 * This backfill only repairs the route_status table, which feeds:
 *   - /api/insights/daily
 *   - /api/bridges/coverage and /api/bridges/health (wins/state queries)
 *   - /api/relay (competitive positioning)
 */

import { pool } from '../db/connection.js';
import { updateRouteStatus } from '../db/queries.js';
import { logger } from '../lib/logger.js';

interface RouteKey {
  src_chain: string;
  dst_chain: string;
  asset: string;
  amount_tier: number;
}

async function run(): Promise<void> {
  logger.info('backfillRouteStatus: starting — reading distinct routes from route_latest');

  const { rows } = await pool.query<RouteKey>(
    `SELECT DISTINCT src_chain, dst_chain, asset, amount_tier::int AS amount_tier
     FROM route_latest
     ORDER BY src_chain, dst_chain, asset, amount_tier`
  );

  logger.info({ routeCount: rows.length }, 'backfillRouteStatus: routes found');

  let done = 0;
  let errors = 0;

  for (const r of rows) {
    try {
      await updateRouteStatus(r.src_chain, r.dst_chain, r.asset, r.amount_tier, []);
      done++;
      if (done % 500 === 0) {
        logger.info({ done, total: rows.length }, 'backfillRouteStatus: progress');
      }
    } catch (err) {
      errors++;
      logger.error({ err, src: r.src_chain, dst: r.dst_chain, asset: r.asset, tier: r.amount_tier },
        'backfillRouteStatus: failed to update route');
    }
  }

  logger.info({ done, errors, total: rows.length }, 'backfillRouteStatus: complete');
  await pool.end();
}

run().catch((err) => {
  logger.error({ err }, 'backfillRouteStatus: fatal error');
  process.exit(1);
});
