import 'dotenv/config';
import { logger } from './lib/logger.js';
import { pool } from './db/connection.js';
import { buildServer } from './api/server.js';
import { startScheduler } from './fetcher/scheduler.js';
import { runMigrations } from './db/migrate.js';

async function main(): Promise<void> {
  logger.info('Bridge Dashboard starting...');

  // Run migrations before anything else (idempotent — uses IF NOT EXISTS)
  await runMigrations();

  // One-time data flush — set FLUSH_ON_START=1 in the container env to wipe all
  // quote data on the next restart, then remove the env var to resume normally.
  if (process.env.FLUSH_ON_START === '1') {
    logger.warn('FLUSH_ON_START=1 — truncating all quote data before starting');
    await pool.query('TRUNCATE route_latest');
    await pool.query('TRUNCATE route_status');
    await pool.query('TRUNCATE quotes');
    await pool.query('TRUNCATE fetch_log');
    logger.warn('Flush complete — all tables cleared');
  }

  const result = await pool.query<{ now: string }>('SELECT NOW() as now');
  logger.info({ time: result.rows[0]?.now }, 'Database connected');

  const server = await buildServer();
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await server.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'API server listening');

  startScheduler();

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await server.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal(err, 'Fatal error');
  process.exit(1);
});
