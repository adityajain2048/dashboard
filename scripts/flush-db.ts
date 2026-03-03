#!/usr/bin/env npx tsx
/**
 * Flush all bridge quote data from the database.
 * Clears: quotes, route_latest, route_status, fetch_log
 * Run this to start fresh with new quote fetches.
 */
import 'dotenv/config';
import { pool } from '../src/db/connection.js';

async function flush(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Flushing database...');

    await client.query('TRUNCATE route_latest');
    console.log('  ✓ route_latest');

    await client.query('TRUNCATE route_status');
    console.log('  ✓ route_status');

    await client.query('TRUNCATE quotes');
    console.log('  ✓ quotes');

    await client.query('TRUNCATE fetch_log');
    console.log('  ✓ fetch_log');

    console.log('\nDatabase flushed. Run `npm run dev` to fetch fresh quotes.');
  } finally {
    client.release();
  }
}

flush().catch((err) => {
  console.error('Flush failed:', err);
  process.exit(1);
});
