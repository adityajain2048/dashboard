// Singleton pg Pool using DATABASE_URL from env
import type { QueryResultRow } from 'pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
