/**
 * Verify fetcher: process one route (ethereum → arbitrum, USDC, $1000), print quotes, query route_latest and route_status.
 */
import 'dotenv/config';
import { generateBatchId } from '../src/lib/utils.js';
import { processRoute } from '../src/fetcher/pipeline.js';
import { getQuotesForRoute } from '../src/db/queries.js';
import { pool } from '../src/db/connection.js';

const SRC = 'ethereum';
const DST = 'arbitrum';
const ASSET = 'USDC';
const TIER = 1000;

async function main(): Promise<number> {
  const batchId = generateBatchId();
  console.log(`Processing route: ${SRC} → ${DST}, ${ASSET}, $${TIER}`);
  await processRoute(SRC, DST, ASSET, TIER, batchId);

  const quotes = await getQuotesForRoute(SRC, DST, ASSET, TIER);
  console.log('\n--- Quotes table ---');
  console.log('| Source | Bridge | Output USD | Fee (bps) | Time (s) | Rank |');
  console.log('|--------|--------|------------|-----------|----------|------|');
  for (const q of quotes) {
    console.log(
      `| ${q.source} | ${q.bridge} | $${q.outputUsd} | ${q.totalFeeBps} bps | ${q.estimatedSeconds}s | ${q.rank ?? '-'} |`
    );
  }

  const latest = await pool.query(
    `SELECT bridge, output_usd, source, total_fee_bps, estimated_seconds FROM route_latest WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4 ORDER BY output_usd DESC`,
    [SRC, DST, ASSET, TIER]
  );
  console.log('\n--- route_latest ---');
  console.log(latest.rows);

  const status = await pool.query(
    `SELECT state, quote_count, best_bridge, spread_bps FROM route_status WHERE src_chain = $1 AND dst_chain = $2 AND asset = $3 AND amount_tier = $4`,
    [SRC, DST, ASSET, TIER]
  );
  console.log('\n--- route_status ---');
  console.log(status.rows);

  await pool.end();
  const exitCode = quotes.length >= 1 ? 0 : 1;
  if (exitCode === 1) console.log('\nNo quotes found (network or API may be unavailable).');
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
