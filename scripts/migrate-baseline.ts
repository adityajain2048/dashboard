#!/usr/bin/env npx tsx
/**
 * Run migrations against the baseline database.
 * Uses BASELINE_DATABASE_URL. Run once to set up baseline schema.
 */
import 'dotenv/config';
import { execSync } from 'child_process';

const baselineUrl = process.env.BASELINE_DATABASE_URL;
if (!baselineUrl) {
  console.error('Need BASELINE_DATABASE_URL in .env');
  process.exit(1);
}

console.log('Running migrations on baseline DB...');
execSync('npx tsx src/db/migrate.ts', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: baselineUrl },
});
