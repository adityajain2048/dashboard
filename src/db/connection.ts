// Singleton pg Pool using DATABASE_URL from env
import type { QueryResultRow } from 'pg';
import { Pool } from 'pg';

// max: must comfortably exceed the fetcher's peak concurrency (SWEEP/T1 = 24)
// so API requests never starve while a fetch cycle holds connections. With the
// bulk upsertRouteLatest (single round-trip, no held client) connections are now
// released quickly, so 30 leaves healthy headroom for the API.
// connectionTimeoutMillis: 10s lets an API request ride out a brief fetch-cycle
// burst instead of 500-ing with "timeout exceeded when trying to connect".
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

/** Shorthand for pool.query */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<{ rows: T[] }> {
  const result = await pool.query<T>(text, values);
  return { rows: result.rows };
}

/** Get a client for transactions */
export function getClient(): Promise<import('pg').PoolClient> {
  return pool.connect();
}

/** Pool instance */
export { pool };

process.on('exit', () => pool.end());
