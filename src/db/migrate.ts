// Read all .sql files from migrations/ directory (sorted by filename)
// Execute each in a transaction. Falls back to plain PG schema if TimescaleDB unavailable.
// Runnable via: npx tsx src/db/migrate.ts
import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { pool } from './connection.js';
import { logger } from '../lib/logger.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

async function hasTimescaleDB(): Promise<boolean> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'"
    );
    return res.rows.length > 0;
  } finally {
    client.release();
  }
}

async function runMigrations(): Promise<void> {
  const tsdb = await hasTimescaleDB();

  const files = await readdir(MIGRATIONS_DIR);
  let sqlFiles: string[];

  if (tsdb) {
    sqlFiles = files.filter((f) => f.endsWith('.sql') && f !== '000_init_plain.sql').sort();
    logger.info('TimescaleDB detected — using full schema');
  } else {
    sqlFiles = files.filter((f) => f === '000_init_plain.sql' || f === '003_route_status_best_fee_bps.sql').sort();
    logger.warn('TimescaleDB NOT available — using plain PostgreSQL schema (no hypertables, compression, or continuous aggregates)');
  }

  if (sqlFiles.length === 0) {
    logger.info('No migration files found');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of sqlFiles) {
      const path = join(MIGRATIONS_DIR, file);
      const sql = await readFile(path, 'utf-8');
      logger.info({ file }, 'Running migration');
      await client.query(sql);
    }
    await client.query('COMMIT');
    logger.info({ count: sqlFiles.length, files: sqlFiles }, 'Migrations completed');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.fatal(err, 'Migration failed');
    process.exit(1);
  });
