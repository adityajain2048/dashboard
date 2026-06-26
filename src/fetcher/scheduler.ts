import type { Asset, AggregatorId } from '../types/index.js';
import { ALL_ROUTES } from '../config/routes.js';
import { processRoute } from './pipeline.js';
import { generateBatchId, chunk } from '../lib/utils.js';
import { logger, type Logger } from '../lib/logger.js';
import { refreshNativePrices } from '../lib/prices.js';
import {
  getGapCoverage,
  hasRecentSquidQuotes,
  getSquidGapKeys,
  clearAllSquidSkips,
  pruneStaleRouteLatest,
} from '../db/queries.js';
import { loadSkipMap, skipMap } from '../lib/aggregator-skip.js';

// ─── Per-worker concurrency (batch size) ─────────────────────────────────────

// Feed Bottleneck in small windows so each batch finishes well inside BATCH_MAX_MS
// even when Squid's API is slow (avg 12-13s/call at degraded throughput).
// 50 tasks × 13s / 20 RPS concurrency ≈ 32s — comfortably inside the 5-min guard.
const SQUID_WINDOW = 50;
const LIFI_CONCURRENCY   = 20;  // 3 keys × 3.33 rps = 10 rps combined
const BUNGEE_CONCURRENCY = 8;
const RUBIC_CONCURRENCY  = 5;   // fallback chains only — small task set
const BRIDGE_CONCURRENCY = 8;

// ─── Per-worker rest intervals (pause BETWEEN end of one cycle and start of next) ──

const SQUID_REST_MS  =  5 * 60_000;  //  5 min — cycle takes ~97 min
const LIFI_REST_MS   = 10 * 60_000;  // 10 min
const BUNGEE_REST_MS = 15 * 60_000;  // 15 min
const RUBIC_REST_MS  = 20 * 60_000;  // 20 min (small set — fast cycle)
const BRIDGE_REST_MS = 10 * 60_000;  // 10 min

// If a cycle exceeds this, break out of the batch loop so finally{} resets the
// running flag and the worker restarts. Prevents permanent deadlock if the rate
// limiter pause somehow outlasts MAX_429_PAUSE_MS (double-deadlock guard).
const WORKER_CYCLE_MAX_MS = 4 * 60 * 60_000; // 4 hours

// A single batch must never take longer than this. With per-query DB timeouts (30s)
// and per-call network timeouts (30s), a batch should finish in well under a minute.
// If it ever exceeds this, abandon it so the worker loop ADVANCES (and finally{} can
// run) instead of freezing forever inside Promise.allSettled — the failure mode that
// killed the Squid/LI.FI workers. Abandoned tasks keep running harmlessly in the
// background and settle on their own (now bounded by the DB query timeout).
const BATCH_MAX_MS = 5 * 60_000; // 5 minutes (covers Squid's 500-task window)

async function settleBatch<T>(
  promises: Promise<T>[],
  log: Logger,
  label: string,
): Promise<PromiseSettledResult<T>[]> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), BATCH_MAX_MS));
  const winner = await Promise.race([Promise.allSettled(promises), timeout]);
  if (winner === null) {
    log.warn({ label, size: promises.length }, `batch exceeded ${BATCH_MAX_MS / 1000}s — abandoning, worker loop continues`);
    return [];
  }
  return winner;
}

// ─── Squid: only skip the initial sweep if data is THIS fresh ────────────────
// Prevents re-sweeping on quick restart (<2 min crash-and-restart).
const SKIP_SWEEP_IF_FRESH_MS = 2 * 60_000;

// ─── Squid priority chains ────────────────────────────────────────────────────
// Routes touching these get sorted to the front of every Squid cycle so
// Cosmos / exotic-EVM chains populate within the first few minutes.

const SQUID_PRIORITY_CHAINS: ReadonlySet<string> = new Set([
  // Exotic EVM (minimal LI.FI / Bungee coverage)
  'hedera', 'filecoin', 'immutable', 'kava', 'moonbeam', 'peaq', 'soneium',
  // Non-EVM
  'sui',
  // Cosmos / IBC
  'osmosis', 'cosmoshub', 'neutron', 'dydx', 'sei', 'injective',
  'celestia', 'axelar', 'kujira', 'terra', 'dymension',
  'stargaze', 'akash', 'stride', 'juno', 'noble',
  'persistence', 'agoric', 'archway', 'xion', 'elys', 'saga', 'migaloo',
]);

// ─── Rubic: fallback chains with no LI.FI / Bungee coverage ─────────────────
const RUBIC_CHAINS: ReadonlySet<string> = new Set(['hyperliquid', 'berachain', 'abstract']);

// ─── Gap key tracking (Squid worker → Bridge worker) ─────────────────────────
// Routes where Squid has no coverage. Populated after each Squid cycle.
// Bridge worker uses these to drive non-Squid aggregator + direct bridge calls.

const squidGapKeys = new Set<string>();

function makeTaskKey(src: string, dst: string, asset: string, amountTier: number): string {
  return `${src}:${dst}:${asset}:${amountTier}`;
}

async function refreshGapKeysFromDB(): Promise<void> {
  const allKeys: string[] = [];
  for (const route of ALL_ROUTES) {
    for (const asset of route.assets) {
      for (const amountTier of route.amountTiers) {
        allKeys.push(makeTaskKey(route.src, route.dst, asset, amountTier));
      }
    }
  }
  const gaps = await getSquidGapKeys(allKeys);
  squidGapKeys.clear();
  for (const key of gaps) squidGapKeys.add(key);
  logger.info(
    { component: 'squid-worker', gaps: squidGapKeys.size, total: allKeys.length },
    `Gap keys refreshed — ${squidGapKeys.size}/${allKeys.length} routes need non-Squid coverage`
  );
}

// ─── Shared task builder ──────────────────────────────────────────────────────

function buildTasks(): Array<{ src: string; dst: string; asset: Asset; amountTier: number }> {
  const tasks: Array<{ src: string; dst: string; asset: Asset; amountTier: number }> = [];
  for (const route of ALL_ROUTES) {
    for (const asset of route.assets) {
      for (const amountTier of route.amountTiers) {
        tasks.push({ src: route.src, dst: route.dst, asset, amountTier });
      }
    }
  }
  // Shuffle so no chain is consistently processed last
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j]!, tasks[i]!];
  }
  return tasks;
}

// ─── Independent worker flags ─────────────────────────────────────────────────

let squidRunning  = false;
let lifiRunning   = false;
let bungeeRunning = false;
let rubicRunning  = false;
let bridgeRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// SQUID WORKER — all routes, Squid only, priority chains first
// Bridge gap-fill is skipped here — the Bridge worker handles it independently.
// ─────────────────────────────────────────────────────────────────────────────

async function runSquidWorker(): Promise<void> {
  if (squidRunning) return;
  squidRunning = true;
  const log = logger.child({ component: 'squid-worker' } as Record<string, unknown>);

  try {
    await refreshNativePrices();

    const tasks = buildTasks();
    // Priority chains to the front so Cosmos / exotic-EVM populate quickly
    tasks.sort((a, b) => {
      const ap = SQUID_PRIORITY_CHAINS.has(a.src) || SQUID_PRIORITY_CHAINS.has(a.dst) ? 0 : 1;
      const bp = SQUID_PRIORITY_CHAINS.has(b.src) || SQUID_PRIORITY_CHAINS.has(b.dst) ? 0 : 1;
      return ap - bp;
    });

    const batchId = generateBatchId();
    const start = Date.now();
    const deadline = start + WORKER_CYCLE_MAX_MS;
    const priorityCount = tasks.filter(
      t => SQUID_PRIORITY_CHAINS.has(t.src) || SQUID_PRIORITY_CHAINS.has(t.dst)
    ).length;

    log.info(
      { total: tasks.length, priority: priorityCount, window: SQUID_WINDOW },
      `Squid worker cycle starting — ${priorityCount} priority tasks first`
    );

    let covered = 0, gap = 0, errors = 0, done = 0;

    for (const window of chunk(tasks, SQUID_WINDOW)) {
      if (Date.now() > deadline) {
        log.warn({ done, total: tasks.length }, 'Squid cycle deadline exceeded — aborting and restarting');
        break;
      }
      // All tasks in the window queue into the Bottleneck simultaneously.
      // The rate limiter (maxConcurrent=25, minTime=50ms) controls actual throughput —
      // no task waits for a full batch to finish before the next one can start.
      await settleBatch(
        window.map(async (t) => {
          const count = await processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, ['squid'], true);
          done++;
          if (count > 0) {
            covered++;
          } else {
            squidGapKeys.add(makeTaskKey(t.src, t.dst, t.asset, t.amountTier));
            gap++;
          }
          if (done % 1000 === 0) {
            const pct = ((done / tasks.length) * 100).toFixed(1);
            const eta_s = Math.round(((tasks.length - done) / done) * (Date.now() - start) / 1000);
            log.info({ done, total: tasks.length, pct, covered, gap, eta_s }, 'Squid worker progress');
          }
        }),
        log, 'squid'
      );
    }

    await refreshGapKeysFromDB();

    log.info(
      { covered, gap, errors, total: tasks.length, elapsed_s: ((Date.now() - start) / 1000).toFixed(1) },
      `Squid worker cycle complete`
    );
  } catch (err) {
    log.error({ err }, 'Squid worker cycle error');
  } finally {
    squidRunning = false;
    setTimeout(() => runSquidWorker().catch(e => logger.error(e, 'Squid worker restart error')), SQUID_REST_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LI.FI WORKER — all routes, LI.FI only
// ─────────────────────────────────────────────────────────────────────────────

async function runLifiWorker(): Promise<void> {
  if (lifiRunning) return;
  lifiRunning = true;
  const log = logger.child({ component: 'lifi-worker' } as Record<string, unknown>);

  try {
    await refreshNativePrices();
    const batchId = generateBatchId();
    const tasks = buildTasks();
    const start = Date.now();
    const deadline = start + WORKER_CYCLE_MAX_MS;
    let totalQuotes = 0, successRoutes = 0, done = 0;

    log.info({ total: tasks.length, concurrency: LIFI_CONCURRENCY }, 'LI.FI worker cycle starting');

    for (const batch of chunk(tasks, LIFI_CONCURRENCY)) {
      if (Date.now() > deadline) {
        log.warn({ done, total: tasks.length }, 'LI.FI cycle deadline exceeded — aborting and restarting');
        break;
      }
      const results = await settleBatch(
        batch.map(t => processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, ['lifi'], true)),
        log, 'lifi'
      );
      for (const r of results) {
        done++;
        if (r.status === 'fulfilled') { totalQuotes += r.value; if (r.value > 0) successRoutes++; }
      }
      if (done % 2000 < LIFI_CONCURRENCY) {
        log.info({ done, total: tasks.length, quotes: totalQuotes }, 'LI.FI worker progress');
      }
    }

    log.info(
      { quotes: totalQuotes, routes: successRoutes, total: tasks.length, elapsed_s: ((Date.now() - start) / 1000).toFixed(1) },
      'LI.FI worker cycle complete'
    );
  } catch (err) {
    log.error({ err }, 'LI.FI worker cycle error');
  } finally {
    lifiRunning = false;
    setTimeout(() => runLifiWorker().catch(e => logger.error(e, 'LI.FI worker restart error')), LIFI_REST_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUNGEE WORKER — all routes, Bungee only
// ─────────────────────────────────────────────────────────────────────────────

async function runBungeeWorker(): Promise<void> {
  if (bungeeRunning) return;
  bungeeRunning = true;
  const log = logger.child({ component: 'bungee-worker' } as Record<string, unknown>);

  try {
    await refreshNativePrices();
    const batchId = generateBatchId();
    const tasks = buildTasks();
    const start = Date.now();
    const deadline = start + WORKER_CYCLE_MAX_MS;
    let totalQuotes = 0, successRoutes = 0, done = 0;

    log.info({ total: tasks.length, concurrency: BUNGEE_CONCURRENCY }, 'Bungee worker cycle starting');

    for (const batch of chunk(tasks, BUNGEE_CONCURRENCY)) {
      if (Date.now() > deadline) {
        log.warn({ done, total: tasks.length }, 'Bungee cycle deadline exceeded — aborting and restarting');
        break;
      }
      const results = await settleBatch(
        batch.map(t => processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, ['bungee'], true)),
        log, 'bungee'
      );
      for (const r of results) {
        done++;
        if (r.status === 'fulfilled') { totalQuotes += r.value; if (r.value > 0) successRoutes++; }
      }
      if (done % 2000 < BUNGEE_CONCURRENCY) {
        log.info({ done, total: tasks.length, quotes: totalQuotes }, 'Bungee worker progress');
      }
    }

    log.info(
      { quotes: totalQuotes, routes: successRoutes, total: tasks.length, elapsed_s: ((Date.now() - start) / 1000).toFixed(1) },
      'Bungee worker cycle complete'
    );
  } catch (err) {
    log.error({ err }, 'Bungee worker cycle error');
  } finally {
    bungeeRunning = false;
    setTimeout(() => runBungeeWorker().catch(e => logger.error(e, 'Bungee worker restart error')), BUNGEE_REST_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUBIC WORKER — fallback chains only (hyperliquid, berachain, abstract)
// ─────────────────────────────────────────────────────────────────────────────

async function runRubicWorker(): Promise<void> {
  if (rubicRunning) return;
  rubicRunning = true;
  const log = logger.child({ component: 'rubic-worker' } as Record<string, unknown>);

  try {
    await refreshNativePrices();
    const batchId = generateBatchId();
    const tasks = buildTasks().filter(
      t => RUBIC_CHAINS.has(t.src) || RUBIC_CHAINS.has(t.dst)
    );
    const start = Date.now();
    const deadline = start + WORKER_CYCLE_MAX_MS;
    let totalQuotes = 0, done = 0;

    log.info({ total: tasks.length, concurrency: RUBIC_CONCURRENCY }, 'Rubic worker cycle starting');

    for (const batch of chunk(tasks, RUBIC_CONCURRENCY)) {
      if (Date.now() > deadline) {
        log.warn({ done, total: tasks.length }, 'Rubic cycle deadline exceeded — aborting and restarting');
        break;
      }
      const results = await settleBatch(
        batch.map(t => processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, ['rubic'], true)),
        log, 'rubic'
      );
      for (const r of results) {
        done++;
        if (r.status === 'fulfilled') totalQuotes += r.value;
      }
    }

    log.info(
      { quotes: totalQuotes, total: tasks.length, elapsed_s: ((Date.now() - start) / 1000).toFixed(1) },
      'Rubic worker cycle complete'
    );
  } catch (err) {
    log.error({ err }, 'Rubic worker cycle error');
  } finally {
    rubicRunning = false;
    setTimeout(() => runRubicWorker().catch(e => logger.error(e, 'Rubic worker restart error')), RUBIC_REST_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIDGE WORKER — gap fill for routes Squid doesn't cover
// Runs non-Squid aggregators + direct bridge APIs for squidGapKeys routes.
// This is the ONLY worker that calls direct bridge APIs (others set skipGapFill=true).
// ─────────────────────────────────────────────────────────────────────────────

async function runBridgeWorker(): Promise<void> {
  if (bridgeRunning) return;

  if (squidGapKeys.size === 0) {
    // Squid worker hasn't completed a cycle yet — defer
    logger.debug({ component: 'bridge-worker' }, 'No gap keys yet — deferring');
    setTimeout(() => runBridgeWorker().catch(e => logger.error(e, 'Bridge worker restart error')), BRIDGE_REST_MS);
    return;
  }

  bridgeRunning = true;
  const log = logger.child({ component: 'bridge-worker' } as Record<string, unknown>);

  try {
    // Use DB history to prefer aggregators proven to cover each gap route
    const coverageMap = await getGapCoverage([...squidGapKeys]);

    const tasks = [...squidGapKeys].map(key => {
      const [src, dst, asset, tierStr] = key.split(':');
      return { src: src!, dst: dst!, asset: asset! as Asset, amountTier: Number(tierStr), key };
    });

    const batchId = generateBatchId();
    const start = Date.now();
    const deadline = start + WORKER_CYCLE_MAX_MS;
    let filled = 0, done = 0;

    log.info(
      { gaps: tasks.length, withHistory: coverageMap.size, concurrency: BRIDGE_CONCURRENCY },
      'Bridge worker cycle starting'
    );

    for (const batch of chunk(tasks, BRIDGE_CONCURRENCY)) {
      if (Date.now() > deadline) {
        log.warn({ done, total: tasks.length }, 'Bridge cycle deadline exceeded — aborting and restarting');
        break;
      }
      const results = await settleBatch(
        batch.map(t => {
          const proven = coverageMap.get(t.key) as AggregatorId[] | undefined;
          // Use historically proven aggregators, or try all non-Squid as fallback
          const subset: readonly AggregatorId[] =
            proven && proven.length > 0 ? proven : ['lifi', 'bungee', 'rubic'];
          // skipGapFill=false — bridge API calls are the whole point of this worker
          return processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, subset, false);
        }),
        log, 'bridge'
      );
      for (const r of results) {
        done++;
        if (r.status === 'fulfilled' && r.value > 0) filled++;
      }
      if (done % 1000 < BRIDGE_CONCURRENCY) {
        log.info({ done, total: tasks.length, filled }, 'Bridge worker progress');
      }
    }

    log.info(
      { gaps: tasks.length, filled, elapsed_s: ((Date.now() - start) / 1000).toFixed(1) },
      'Bridge worker cycle complete'
    );
  } catch (err) {
    log.error({ err }, 'Bridge worker cycle error');
  } finally {
    bridgeRunning = false;
    setTimeout(() => runBridgeWorker().catch(e => logger.error(e, 'Bridge worker restart error')), BRIDGE_REST_MS);
  }
}

// ─── Scheduler entry point ────────────────────────────────────────────────────

export function startScheduler(): void {
  logger.info(
    { component: 'scheduler' },
    'Starting independent workers: Squid · LI.FI · Bungee · Rubic · Bridge'
  );

  // Refresh skip map every 30 min to pick up new DB entries
  setInterval(() => {
    loadSkipMap().catch(e => logger.warn(e, 'Skip map refresh failed'));
  }, 30 * 60_000);

  // Prune stale route_latest "ghost" quotes (no source refreshed in 12h) so the
  // matrix shows fresh data or an honest `dead`, never a days-old ghost. Run once
  // shortly after startup, then every 30 min.
  const runPrune = (): void => {
    pruneStaleRouteLatest()
      .then((removed) => {
        if (removed > 0) logger.info({ component: 'scheduler', removed }, `Pruned ${removed} stale route_latest ghost rows (>12h)`);
      })
      .catch(e => logger.warn(e, 'route_latest prune failed'));
  };
  setTimeout(runPrune, 60_000);
  setInterval(runPrune, 30 * 60_000);

  // ── LI.FI, Bungee, Rubic workers — start immediately, run independently ────
  runLifiWorker().catch(e => logger.error(e, 'LI.FI worker startup error'));
  runBungeeWorker().catch(e => logger.error(e, 'Bungee worker startup error'));
  runRubicWorker().catch(e => logger.error(e, 'Rubic worker startup error'));

  // ── Squid worker — clear stale skips first, then check freshness ────────────
  clearAllSquidSkips()
    .then(async (cleared) => {
      for (const key of [...skipMap.keys()]) {
        if (key.startsWith('squid:')) skipMap.delete(key);
      }
      await loadSkipMap();
      logger.info({ component: 'squid-worker', cleared }, `Cleared ${cleared} Squid skip entries`);
    })
    .catch(e => logger.warn(e, 'Failed to clear Squid skips — continuing'))
    .then(async () => {
      const squidFresh = await hasRecentSquidQuotes(SKIP_SWEEP_IF_FRESH_MS);
      if (squidFresh) {
        logger.info(
          { component: 'squid-worker' },
          'Recent Squid data found — loading gap keys from DB, skipping initial sweep'
        );
        await refreshGapKeysFromDB();
        // Rest before first cycle (data is already fresh)
        setTimeout(
          () => runSquidWorker().catch(e => logger.error(e, 'Squid worker startup error')),
          SQUID_REST_MS
        );
      } else {
        logger.info({ component: 'squid-worker' }, 'No recent Squid data — starting full sweep');
        runSquidWorker().catch(e => logger.error(e, 'Squid worker startup error'));
      }
    })
    .catch(e => {
      logger.error(e, 'Squid startup failed — starting worker anyway');
      runSquidWorker().catch(e2 => logger.error(e2, 'Squid worker startup error'));
    });

  // ── Bridge worker — starts 30s after scheduler to let gap keys load ─────────
  // If Squid data is fresh, gap keys are populated from DB immediately above.
  // If not, the bridge worker's defer loop handles it until Squid completes.
  setTimeout(
    () => runBridgeWorker().catch(e => logger.error(e, 'Bridge worker startup error')),
    30_000
  );
}
