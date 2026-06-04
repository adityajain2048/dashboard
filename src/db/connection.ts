// Singleton pg Pool using DATABASE_URL from env
import type { QueryResultRow } from 'pg';
import { Pool } from 'pg';

// Parse DATABASE_URL manually to avoid pg-connection-string's SSL handling.
// pg-connection-string ≥2.7 treats sslmode=require as sslmode=verify-full, then
// uselibpqcompat=true changes the TLS startup order in a way that confuses
// Azure PostgreSQL Flexible Server's connection proxy — the server resets the
// TCP connection before the SSL handshake completes.
// By passing host/port/user/password/database individually, we bypass
// pg-connection-string entirely and control SSL ourselves.
const rawUrl = process.env.DATABASE_URL ?? '';
let pgConfig: {
  host: string; port: number; database: string; user: string; password: string;
};
try {
  const url = new URL(rawUrl);
  pgConfig = {
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    database: url.pathname.replace(/^\//, ''),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
} catch {
  // Fallback: pass the raw string and let pg handle it
  pgConfig = { host: 'localhost', port: 5432, database: '', user: '', password: '' };
  console.error('[pool] Could not parse DATABASE_URL — check env var');
}

// max: must comfortably exceed the fetcher's peak concurrency (SWEEP/T1 = 24)
// so API requests never starve while a fetch cycle holds connections. With the
// bulk upsertRouteLatest (single round-trip, no held client) connections are now
// released quickly, so 30 leaves healthy headroom for the API.
// connectionTimeoutMillis: 10s lets an API request ride out a brief fetch-cycle
// burst instead of 500-ing with "timeout exceeded when trying to connect".
// keepAlive: TCP keepalive probes prevent Azure's network layer (or any NAT/LB)
// from silently dropping idle connections — avoids "Connection terminated" errors
// on the next request after a quiet period.
// ssl: only enabled in production (Azure PostgreSQL Flexible Server requires SSL).
// Local Docker Postgres has no SSL — hardcoding ssl here crashes the local dev
// server on startup. DB_SSL=true can force SSL on in any env if needed.
const useSSL =
  process.env.DB_SSL === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false');

const pool = new Pool({
  ...pgConfig,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
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
