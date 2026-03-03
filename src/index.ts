import 'dotenv/config';
import { logger } from './lib/logger.js';
import { pool } from './db/connection.js';
import { buildServer } from './api/server.js';
import { startScheduler } from './fetcher/scheduler.js';

async function main(): Promise<void> {
  logger.info('Bridge Dashboard starting...');

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
