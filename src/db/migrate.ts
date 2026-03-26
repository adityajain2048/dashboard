// Read all .sql files from migrations/ directory (sorted by filename)
// Execute each in a transaction. Falls back to plain PG schema if TimescaleDB unavailable.
// Runnable via: npx tsx src/db/migrate.ts
import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { pool } from './connection.js';
import { logger } from '../lib/logger.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

type TsdbEdition = 'none' | 'apache' | 'tsl';

async function detectTimescaleDB(): Promise<TsdbEdition> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'"
    );
    if (res.rows.length === 0) return 'none';

    // Check if the extension is already loaded and what license it runs under
    try {
      const licRes = await client.query("SHOW timescaledb.license");
      const license = licRes.rows[0]?.timescaledb_license ?? licRes.rows[0]?.['timescaledb.license'] ?? '';
      if (license === 'apache') return 'apache';
      return 'tsl';
    } catch {
      // Extension available but not yet loaded — check if shared_preload_libraries includes it
      // If not loadable, treat as apache (safe default — no TSL features)
      return 'apache';
    }
  } finally {
    client.release();
  }
}

const COMMON_MIGRATIONS = [
  '002_route_latest_bridge_source_pk.sql',
  '003_route_status_best_fee_bps.sql',
  '004_route_latest_input_amount.sql',
];

async function runMigrations(): Promise<void> {
  const edition = await detectTimescaleDB();

  const files = await readdir(MIGRATIONS_DIR);
  let sqlFiles: string[];

  if (edition === 'tsl') {
    // Full TimescaleDB with Timescale License — use full schema (hypertables + continuous aggregates + compression)
    sqlFiles = ['001_init.sql', ...COMMON_MIGRATIONS].filter((f) => files.includes(f));
    logger.info('TimescaleDB (TSL) detected — using full schema');
  } else if (edition === 'apache') {
    // TimescaleDB Apache/community edition — hypertables yes, but no continuous aggregates/compression/retention
    sqlFiles = ['001_init_community.sql', ...COMMON_MIGRATIONS].filter((f) => files.includes(f));
    logger.info('TimescaleDB (Apache/community) detected — using community schema (hypertables only, no continuous aggregates)');
  } else {
    // No TimescaleDB — plain PostgreSQL tables
    sqlFiles = ['000_init_plain.sql', ...COMMON_MIGRATIONS].filter((f) => files.includes(f));
    logger.warn('TimescaleDB NOT available — using plain PostgreSQL schema (no hypertables)');
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

export { runMigrations };

// Only run standalone when executed directly (npm run migrate)
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.fatal(err, 'Migration failed');
      process.exit(1);
    });
}
