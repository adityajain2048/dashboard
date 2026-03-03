/**
 * Verify DB: run migrations, check tables, optionally check hypertables/caggs,
 * insert/read/delete test quote, exit 0 if all pass else 1.
 */
import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { pool } from '../src/db/connection.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const EXPECTED_TABLES = ['quotes', 'route_latest', 'route_status', 'fetch_log'];
const EXPECTED_HYPERTABLES = ['quotes', 'fetch_log'];
const EXPECTED_CAGGREGATES = ['quotes_hourly', 'bridge_daily'];

async function hasTimescaleDB(): Promise<boolean> {
  const res = await pool.query(
    "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'"
  );
  return res.rows.length > 0;
}

async function runMigrations(tsdb: boolean): Promise<void> {
  const files = await readdir(MIGRATIONS_DIR);
  let sqlFiles: string[];
  if (tsdb) {
    sqlFiles = files.filter((f) => f.endsWith('.sql') && f !== '000_init_plain.sql').sort();
  } else {
    sqlFiles = files.filter((f) => f === '000_init_plain.sql');
  }
  const client = await pool.connect();
  try {
    for (const file of sqlFiles) {
      const path = join(MIGRATIONS_DIR, file);
      const sql = await readFile(path, 'utf-8');
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

function ok(label: string): void {
  console.log(`✅ ${label}`);
}

function fail(label: string, detail?: string): void {
  console.log(`❌ ${label}${detail ? `: ${detail}` : ''}`);
}

function skip(label: string): void {
  console.log(`⏭️  ${label} (skipped — no TimescaleDB)`);
}

async function main(): Promise<number> {
  let passed = true;

  try {
    await pool.query('SELECT 1');
  } catch (e) {
    fail('Connect to DB', String(e));
    return 1;
  }
  ok('Connect to DB');

  const tsdb = await hasTimescaleDB();
  if (!tsdb) {
    console.log('⚠️  TimescaleDB not available — running plain PostgreSQL checks');
  }

  try {
    await runMigrations(tsdb);
    ok('Run migrations');
  } catch (e) {
    fail('Run migrations', String(e));
    return 1;
  }

  for (const table of EXPECTED_TABLES) {
    const r = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
      [table]
    );
    if (r.rows[0].exists) ok(`Table exists: ${table}`);
    else {
      fail(`Table exists: ${table}`);
      passed = false;
    }
  }

  if (tsdb) {
    const htRes = await pool.query(
      `SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_schema = 'public'`
    );
    const hypertables = htRes.rows.map((r: { hypertable_name: string }) => r.hypertable_name);
    for (const name of EXPECTED_HYPERTABLES) {
      if (hypertables.includes(name)) ok(`Hypertable: ${name}`);
      else {
        fail(`Hypertable: ${name}`);
        passed = false;
      }
    }

    const caggRes = await pool.query(
      `SELECT view_name FROM timescaledb_information.continuous_aggregates WHERE view_schema = 'public'`
    );
    const caggs = caggRes.rows.map((r: { view_name: string }) => r.view_name);
    for (const name of EXPECTED_CAGGREGATES) {
      if (caggs.includes(name)) ok(`Continuous aggregate: ${name}`);
      else {
        fail(`Continuous aggregate: ${name}`);
        passed = false;
      }
    }
  } else {
    for (const name of EXPECTED_HYPERTABLES) skip(`Hypertable: ${name}`);
    for (const name of EXPECTED_CAGGREGATES) skip(`Continuous aggregate: ${name}`);
  }

  const testId = randomUUID();
  try {
    await pool.query(
      `INSERT INTO quotes (
        ts, batch_id, src_chain, dst_chain, asset, amount_tier, source, bridge,
        input_amount, output_amount, input_usd, output_usd
      ) VALUES (NOW(), $1, 'ethereum', 'arbitrum', 'USDC', 1000, 'lifi', 'across', '0', '0', 1000, 999)`,
      [testId]
    );
    ok('Insert test quote');

    const sel = await pool.query(
      'SELECT batch_id FROM quotes WHERE batch_id = $1',
      [testId]
    );
    if (sel.rows.length === 1) ok('Read test quote back');
    else {
      fail('Read test quote back');
      passed = false;
    }

    await pool.query('DELETE FROM quotes WHERE batch_id = $1', [testId]);
    ok('Delete test quote');
  } catch (e) {
    fail('Insert/read/delete test quote', String(e));
    passed = false;
  }

  await pool.end();
  return passed ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
