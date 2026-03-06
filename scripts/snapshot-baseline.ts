#!/usr/bin/env npx tsx
/**
 * Snapshot main DB → baseline DB.
 * Copies quotes, route_latest, route_status, fetch_log.
 * Run migrate:baseline first so baseline has the same schema.
 */
import 'dotenv/config';
import format from 'pg-format';
import { Pool } from 'pg';

const TABLES = ['quotes', 'route_latest', 'route_status', 'fetch_log'] as const;
const BATCH_SIZE = 500;

async function snapshot(): Promise<void> {
  const mainUrl = process.env.DATABASE_URL;
  const baselineUrl = process.env.BASELINE_DATABASE_URL;

  if (!mainUrl || !baselineUrl) {
    console.error('Need both DATABASE_URL and BASELINE_DATABASE_URL in .env');
    process.exit(1);
  }

  const mainPool = new Pool({ connectionString: mainUrl });
  const baselinePool = new Pool({ connectionString: baselineUrl });

  try {
    for (const table of TABLES) {
      console.log(`Copying ${table}...`);

      const colsResult = await mainPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table]
      );
      const columns = colsResult.rows.map((r) => r.column_name);
      if (columns.length === 0) {
        console.log(`  ⚠ ${table} not found, skipping`);
        continue;
      }

      const colList = columns.join(', ');
      await baselinePool.query(`TRUNCATE ${table}`);

      let offset = 0;
      let total = 0;
      let rows: Record<string, unknown>[];

      do {
        const res = await mainPool.query(
          `SELECT ${colList} FROM ${table} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
        );
        rows = res.rows as Record<string, unknown>[];

        if (rows.length > 0) {
          const values = rows.map((row) => columns.map((c) => row[c]));
          const colListQuoted = columns.map((c) => format('%I', c)).join(', ');
          const insertSql = format(
            'INSERT INTO %I (' + colListQuoted + ') VALUES %L',
            table,
            values
          );
          await baselinePool.query(insertSql);
          total += rows.length;
        }
        offset += BATCH_SIZE;
      } while (rows.length === BATCH_SIZE);

      console.log(`  ✓ ${table}: ${total} rows`);
    }

    console.log('\nBaseline snapshot complete.');
  } finally {
    await mainPool.end();
    await baselinePool.end();
  }
}

snapshot().catch((err) => {
  console.error('Snapshot failed:', err);
  process.exit(1);
});
