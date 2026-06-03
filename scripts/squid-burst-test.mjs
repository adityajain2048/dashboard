/**
 * Squid burst test — 10 RPS sustained for 30 seconds across varied routes.
 * Uses the exact same API call format as src/fetcher/aggregators/squid.ts.
 *
 * Run: node scripts/squid-burst-test.mjs
 */

const SQUID_API_URL   = 'https://v2.api.squidrouter.com/v2/route';
const INTEGRATOR_ID   = 'bridge-dashboard-ccf44383-88be-4758-8b61-a813f76e4';
const TARGET_RPS      = 10;
const DURATION_MS     = 30_000;
const INTERVAL_MS     = 1000 / TARGET_RPS;   // 100ms between launches
const REPORT_EVERY_MS = 5_000;

// ─── Route pool ──────────────────────────────────────────────────────────────
// Using confirmed-supported EVM pairs. USDC = 6 decimals, ETH = 18 decimals.
// $1000 USDC = 1_000_000_000 (6dp), $1000 ETH ≈ 0.4 ETH = 400_000_000_000_000_000 (18dp)

const DEAD_EVM = '0x000000000000000000000000000000000000dEaD';

const USDC_ROUTES = [
  // ethereum ↔ L2s
  { from: '1',     to: '42161', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', toToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', amount: '1000000000', label: 'ETH→ARB USDC' },
  { from: '1',     to: '8453',  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000000000', label: 'ETH→BASE USDC' },
  { from: '1',     to: '10',    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', toToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', amount: '1000000000', label: 'ETH→OP USDC' },
  { from: '1',     to: '137',   token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', toToken: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', amount: '1000000000', label: 'ETH→POL USDC' },
  { from: '1',     to: '43114', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', toToken: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', amount: '1000000000', label: 'ETH→AVAX USDC' },
  { from: '1',     to: '56',    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', toToken: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', amount: '1000000000', label: 'ETH→BSC USDC' },
  // L2 ↔ L2
  { from: '42161', to: '8453',  token: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000000000', label: 'ARB→BASE USDC' },
  { from: '42161', to: '10',    token: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', toToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', amount: '1000000000', label: 'ARB→OP USDC' },
  { from: '8453',  to: '10',    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', toToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', amount: '1000000000', label: 'BASE→OP USDC' },
  { from: '8453',  to: '42161', token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', toToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', amount: '1000000000', label: 'BASE→ARB USDC' },
  { from: '10',    to: '42161', token: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', toToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', amount: '1000000000', label: 'OP→ARB USDC' },
  { from: '137',   to: '42161', token: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', toToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', amount: '1000000000', label: 'POL→ARB USDC' },
  { from: '56',    to: '42161', token: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', toToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', amount: '1000000000', label: 'BSC→ARB USDC' },
  { from: '43114', to: '42161', token: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', toToken: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', amount: '1000000000', label: 'AVAX→ARB USDC' },
  { from: '43114', to: '8453',  token: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000000000', label: 'AVAX→BASE USDC' },
  { from: '56',    to: '8453',  token: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000000000', label: 'BSC→BASE USDC' },
  // Reverse directions (avoids cache hits being too uniform)
  { from: '42161', to: '1',     token: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000', label: 'ARB→ETH USDC' },
  { from: '8453',  to: '1',     token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000', label: 'BASE→ETH USDC' },
  { from: '10',    to: '1',     token: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000', label: 'OP→ETH USDC' },
  { from: '137',   to: '1',     token: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', amount: '1000000000', label: 'POL→ETH USDC' },
];

const ETH_ROUTES = [
  { from: '1',     to: '42161', token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'ETH→ARB ETH' },
  { from: '1',     to: '8453',  token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'ETH→BASE ETH' },
  { from: '1',     to: '10',    token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'ETH→OP ETH' },
  { from: '42161', to: '8453',  token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'ARB→BASE ETH' },
  { from: '42161', to: '1',     token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'ARB→ETH ETH' },
  { from: '8453',  to: '1',     token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'BASE→ETH ETH' },
  { from: '10',    to: '8453',  token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'OP→BASE ETH' },
  { from: '10',    to: '1',     token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', amount: '400000000000000000', label: 'OP→ETH ETH' },
];

const ALL_ROUTES = [...USDC_ROUTES, ...ETH_ROUTES];

// ─── State ───────────────────────────────────────────────────────────────────

const results = [];      // { label, status, durationMs, retryAfter, ts }
let inFlight    = 0;
let maxInFlight = 0;
let launched    = 0;
let windowStart = Date.now();
let windowLaunched = 0;
let windowCompleted = 0;
let window429   = 0;

// ─── Single request ───────────────────────────────────────────────────────────

async function fireRequest(route) {
  const body = {
    fromChain:   route.from,
    toChain:     route.to,
    fromToken:   route.token,
    toToken:     route.toToken,
    fromAmount:  route.amount,
    fromAddress: DEAD_EVM,
    toAddress:   DEAD_EVM,
    quoteOnly:   true,
    slippage:    1,
  };

  const start = Date.now();
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);

  let status, retryAfter = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(SQUID_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-integrator-id': INTEGRATOR_ID,
      },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (res.status === 200) {
      status = 'ok';
    } else if (res.status === 429) {
      status = '429';
      retryAfter = res.headers.get('retry-after');
      window429++;
    } else if (res.status === 400 || res.status === 404) {
      status = 'no_route';
    } else if (res.status === 500) {
      status = '500';
    } else {
      status = `http_${res.status}`;
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      status = 'timeout';
    } else {
      status = `err:${e.message?.slice(0, 30)}`;
    }
  }

  const durationMs = Date.now() - start;
  inFlight--;
  windowCompleted++;
  results.push({ label: route.label, status, durationMs, retryAfter, ts: start });
}

// ─── Per-window report ────────────────────────────────────────────────────────

function report(windowNum) {
  const windowSec = (Date.now() - windowStart) / 1000;
  const rps = windowCompleted / windowSec;
  const all = results.slice(-windowCompleted);
  const ok   = all.filter(r => r.status === 'ok').length;
  const r429 = all.filter(r => r.status === '429').length;
  const noR  = all.filter(r => r.status === 'no_route').length;
  const to   = all.filter(r => r.status === 'timeout').length;
  const durations = all.filter(r => r.status === 'ok').map(r => r.durationMs).sort((a,b) => a-b);
  const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
  const p90 = durations[Math.floor(durations.length * 0.9)] ?? 0;
  const retries = all.filter(r => r.retryAfter).map(r => r.retryAfter);

  console.log(`\n── Window ${windowNum} (last 5s) ─────────────────────────`);
  console.log(`  launched=${windowLaunched}  completed=${windowCompleted}  inFlight=${inFlight}  maxInFlight=${maxInFlight}`);
  console.log(`  ok=${ok}  429=${r429}  no_route=${noR}  timeout=${to}  rps=${rps.toFixed(2)}`);
  if (durations.length > 0) console.log(`  latency p50=${p50}ms p90=${p90}ms`);
  if (retries.length > 0) console.log(`  retry-after headers seen: ${[...new Set(retries)].join(', ')}`);

  windowStart = Date.now();
  windowLaunched = 0;
  windowCompleted = 0;
  window429 = 0;
  maxInFlight = inFlight; // reset to current
}

// ─── Main loop ────────────────────────────────────────────────────────────────

console.log(`Squid burst test: ${TARGET_RPS} RPS for ${DURATION_MS/1000}s`);
console.log(`Total target: ~${TARGET_RPS * DURATION_MS/1000} requests across ${ALL_ROUTES.length} route types`);
console.log(`Firing first request now...\n`);

const startTime = Date.now();
let routeIdx = 0;
let windowNum = 0;

// Fire at TARGET_RPS
const fireInterval = setInterval(() => {
  const route = ALL_ROUTES[routeIdx % ALL_ROUTES.length];
  routeIdx++;
  launched++;
  windowLaunched++;
  fireRequest(route); // intentionally not awaited — parallel inflight
}, INTERVAL_MS);

// Report every 5s
const reportInterval = setInterval(() => {
  windowNum++;
  report(windowNum);
}, REPORT_EVERY_MS);

// Stop after DURATION_MS
setTimeout(() => {
  clearInterval(fireInterval);
  clearInterval(reportInterval);

  // Wait for in-flight to drain (max 15s)
  const drain = setInterval(() => {
    if (inFlight === 0 || Date.now() - startTime > DURATION_MS + 15_000) {
      clearInterval(drain);
      printFinal();
    }
  }, 500);
}, DURATION_MS);

// ─── Final summary ────────────────────────────────────────────────────────────

function printFinal() {
  const elapsed = (Date.now() - startTime) / 1000;
  const ok      = results.filter(r => r.status === 'ok').length;
  const r429    = results.filter(r => r.status === '429').length;
  const noRoute = results.filter(r => r.status === 'no_route').length;
  const timeout = results.filter(r => r.status === 'timeout').length;
  const other   = results.filter(r => !['ok','429','no_route','timeout'].includes(r.status)).length;
  const total   = results.length;

  const durations = results.filter(r => r.status === 'ok').map(r => r.durationMs).sort((a,b) => a-b);
  const p50 = durations[Math.floor(durations.length * 0.50)] ?? 0;
  const p90 = durations[Math.floor(durations.length * 0.90)] ?? 0;
  const p99 = durations[Math.floor(durations.length * 0.99)] ?? 0;

  const retryHeaders = results.filter(r => r.retryAfter).map(r => r.retryAfter);
  const uniqueRetry  = [...new Set(retryHeaders)];

  console.log('\n══════════════════════════════════════════════════');
  console.log('FINAL SUMMARY');
  console.log('══════════════════════════════════════════════════');
  console.log(`  Test duration:      ${elapsed.toFixed(1)}s`);
  console.log(`  Launched:           ${launched}`);
  console.log(`  Completed:          ${total}  (${(100*total/launched).toFixed(1)}%)`);
  console.log(`  Effective RPS:      ${(total/elapsed).toFixed(2)}`);
  console.log(``);
  console.log(`  ✅ ok:              ${ok}  (${(100*ok/total||0).toFixed(1)}%)`);
  console.log(`  🚫 429:             ${r429}  (${(100*r429/total||0).toFixed(1)}%)`);
  console.log(`  ⛔ no_route:        ${noRoute}`);
  console.log(`  ⏱  timeout:         ${timeout}`);
  console.log(`  ❓ other:           ${other}`);
  console.log(``);
  if (durations.length > 0) {
    console.log(`  Latency (ok only):  p50=${p50}ms  p90=${p90}ms  p99=${p99}ms`);
  }
  if (uniqueRetry.length > 0) {
    console.log(`  retry-after values: ${uniqueRetry.join(', ')}s`);
  } else {
    console.log(`  retry-after:        (none seen)`);
  }
  console.log('══════════════════════════════════════════════════');

  if (r429 === 0) {
    console.log('\n✅ 10 RPS sustained for 30s with ZERO 429s — limit is higher than 10 RPS.');
  } else {
    console.log(`\n⚠️  ${r429} rate-limit responses. First 429 at t=${((results.find(r=>r.status==='429')?.ts??startTime)-startTime)/1000}s`);
  }
  process.exit(0);
}
