// Singleton pg Pool using DATABASE_URL from env
import type { QueryResultRow } from 'pg';
import { Pool } from 'pg';

// pg-connection-string ≥2.7 treats sslmode=require as sslmode=verify-full
// (full cert + hostname verification), which causes "Connection terminated
// unexpectedly" against Azure PostgreSQL Flexible Server's non-public CA.
// The module's own migration guide says to append uselibpqcompat=true to
// restore standard libpq semantics (sslmode=require = encrypt, no cert check).
// We also keep ssl: { rejectUnauthorized: false } as belt-and-suspenders.
const rawUrl = process.env.DATABASE_URL ?? '';
const connectionString =
  rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'uselibpqcompat=true';

// max: must comfortably exceed the fetcher's peak concurrency (SWEEP/T1 = 24)
// so API requests never starve while a fetch cycle holds connections. With the
// bulk upsertRouteLatest (single round-trip, no held client) connections are now
// released quickly, so 30 leaves healthy headroom for the API.
// connectionTimeoutMillis: 10s lets an API request ride out a brief fetch-cycle
// burst instead of 500-ing with "timeout exceeded when trying to connect".
// keepAlive: TCP keepalive probes prevent Azure's network layer (or any NAT/LB)
// from silently dropping idle connections — avoids "Connection terminated" errors
// on the next request after a quiet period.
const pool = new Pool({
  connectionString,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

// Log idle client errors so we know when connections drop — pg auto-removes
// the broken client from the pool, so no action needed here.
pool.on('error', (err) => {
  // Use console.error as a fallback — logger isn't importable here without
  // a circular dep (logger → connection → logger). The structured logger at
  // the call sites will capture query-level errors; this handles pool-level ones.
  console.error('[pool] idle client error:', err.message);
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
