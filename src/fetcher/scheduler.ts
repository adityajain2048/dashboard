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
  purgeFetchLog,
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

// ─── Per-worker cycle target (run each worker 3× per day) ────────────────────
// After a cycle finishes, rest = max(1 min, TARGET − elapsed).
// If a cycle takes longer than TARGET, the 1-min floor kicks in so the worker
// isn't starved; it'll naturally run fewer than 3× that day.
// Was 7×/day: at that cadence, sustained CPU on the B1ms Postgres tier stayed
// above its ~20%-of-1-vCore burst-credit baseline, draining credits to zero
// and freezing the DB roughly every 48h regardless of the sweep-retrigger fix
// (see scheduler startup section below). Every worker processes ALL routes ×
// assets × tiers every cycle (buildTasks() below has no tier filtering), so
// cycle frequency is the only free lever that reduces total daily DB write
// volume — concurrency settings only spread the same volume over time, they
// don't reduce it. 3×/day is a ~2.3x cut, aimed at landing sustained average
// CPU near/under the burst baseline instead of paying for a bigger SKU.
const CYCLE_TARGET_MS = Math.round(24 * 60 * 60_000 / 3); // ≈ 480 min (8h)

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
// A full sweep is ~18,576 tasks — a massive concurrent write burst that alone
// can exhaust a burstable B1ms DB's CPU credits within tens of minutes. A
// 2-minute freshness window meant ANY restart beyond a crash-loop (including a
// deliberate maintenance restart) re-triggered the full sweep, which could
// re-exhaust credits and force another restart — a self-inflicted loop. 6h
// still re-sweeps after genuine prolonged downtime or a fresh/restored DB, but
// treats a routine restart as a resume, not a cold start.
const SKIP_SWEEP_IF_FRESH_MS = 6 * 60 * 60_000;

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
  const cycleStart = Date.now();
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
    const start = cycleStart;
    const deadline = cycleStart + WORKER_CYCLE_MAX_MS;
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
    const restMs = Math.max(60_000, CYCLE_TARGET_MS - (Date.now() - cycleStart));
    setTimeout(() => runSquidWorker().catch(e => logger.error(e, 'Squid worker restart error')), restMs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LI.FI WORKER — all routes, LI.FI only
// ─────────────────────────────────────────────────────────────────────────────

async function runLifiWorker(): Promise<void> {
  if (lifiRunning) return;
  lifiRunning = true;
  const cycleStart = Date.now();
  const log = logger.child({ component: 'lifi-worker' } as Record<string, unknown>);

  try {
    await refreshNativePrices();
    const batchId = generateBatchId();
    const tasks = buildTasks();
    const start = cycleStart;
    const deadline = cycleStart + WORKER_CYCLE_MAX_MS;
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
    const restMs = Math.max(60_000, CYCLE_TARGET_MS - (Date.now() - cycleStart));
    setTimeout(() => runLifiWorker().catch(e => logger.error(e, 'LI.FI worker restart error')), restMs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUNGEE WORKER — all routes, Bungee only
// ─────────────────────────────────────────────────────────────────────────────

async function runBungeeWorker(): Promise<void> {
  if (bungeeRunning) return;
  bungeeRunning = true;
  const cycleStart = Date.now();
  const log = logger.child({ component: 'bungee-worker' } as Record<string, unknown>);

  try {
    await refreshNativePrices();
    const batchId = generateBatchId();
    const tasks = buildTasks();
    const start = cycleStart;
    const deadline = cycleStart + WORKER_CYCLE_MAX_MS;
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
    const restMs = Math.max(60_000, CYCLE_TARGET_MS - (Date.now() - cycleStart));
    setTimeout(() => runBungeeWorker().catch(e => logger.error(e, 'Bungee worker restart error')), restMs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUBIC WORKER — fallback chains only (hyperliquid, berachain, abstract)
// ─────────────────────────────────────────────────────────────────────────────

async function runRubicWorker(): Promise<void> {
  if (rubicRunning) return;
  rubicRunning = true;
  const cycleStart = Date.now();
  const log = logger.child({ component: 'rubic-worker' } as Record<string, unknown>);

  try {
    await refreshNativePrices();
    const batchId = generateBatchId();
    const tasks = buildTasks().filter(
      t => RUBIC_CHAINS.has(t.src) || RUBIC_CHAINS.has(t.dst)
    );
    const start = cycleStart;
    const deadline = cycleStart + WORKER_CYCLE_MAX_MS;
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
    const restMs = Math.max(60_000, CYCLE_TARGET_MS - (Date.now() - cycleStart));
    setTimeout(() => runRubicWorker().catch(e => logger.error(e, 'Rubic worker restart error')), restMs);
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
    setTimeout(() => runBridgeWorker().catch(e => logger.error(e, 'Bridge worker restart error')), 60_000);
    return;
  }

  bridgeRunning = true;
  const cycleStart = Date.now();
  const log = logger.child({ component: 'bridge-worker' } as Record<string, unknown>);

  try {
    // Use DB history to prefer aggregators proven to cover each gap route
    const coverageMap = await getGapCoverage([...squidGapKeys]);

    const tasks = [...squidGapKeys].map(key => {
      const [src, dst, asset, tierStr] = key.split(':');
      return { src: src!, dst: dst!, asset: asset! as Asset, amountTier: Number(tierStr), key };
    });

    const batchId = generateBatchId();
    const start = cycleStart;
    const deadline = cycleStart + WORKER_CYCLE_MAX_MS;
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
    const restMs = Math.max(60_000, CYCLE_TARGET_MS - (Date.now() - cycleStart));
    setTimeout(() => runBridgeWorker().catch(e => logger.error(e, 'Bridge worker restart error')), restMs);
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

  // Purge fetch_log rows older than 7 days once per day to keep the hypertable
  // from growing unbounded and exhausting B1ms CPU credits via index maintenance.
  const runFetchLogPurge = (): void => {
    purgeFetchLog(7)
      .then((removed) => {
        if (removed > 0) logger.info({ component: 'scheduler', removed }, `Purged ${removed} fetch_log rows older than 7 days`);
      })
      .catch(e => logger.warn(e, 'fetch_log purge failed'));
  };
  setTimeout(runFetchLogPurge, 5 * 60_000);     // 5 min after startup
  setInterval(runFetchLogPurge, 24 * 60 * 60_000); // then every 24h

  // ── LI.FI, Bungee, Rubic workers — staggered start, then run independently ──
  // Starting all three at t=0 concentrates their write bursts in the same
  // window as the Squid worker's own startup work, compounding DB load right
  // when a freshly-restarted burstable instance has the least CPU headroom.
  // A few minutes of stagger spreads that burst out without delaying any
  // worker's steady-state cadence (each still free-runs its own cycle after).
  runLifiWorker().catch(e => logger.error(e, 'LI.FI worker startup error'));
  setTimeout(
    () => runBungeeWorker().catch(e => logger.error(e, 'Bungee worker startup error')),
    2 * 60_000
  );
  setTimeout(
    () => runRubicWorker().catch(e => logger.error(e, 'Rubic worker startup error')),
    4 * 60_000
  );

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
        // Resume soon, like the other workers' staggered starts — NOT a full
        // CYCLE_TARGET_MS wait. That used to be a short, harmless rest when
        // CYCLE_TARGET_MS was ~205min, but after raising both
        // SKIP_SWEEP_IF_FRESH_MS (2min→6h) and CYCLE_TARGET_MS (205min→8h) in
        // separate fixes, their combination meant any restart where Squid had
        // recent data went completely silent for up to 8h — Squid never
        // fetched again until the next natural cycle far in the future. This
        // 1-minute resume (between LI.FI's immediate start and Bungee's 2min)
        // keeps the sweep-skip benefit without the silent-for-hours side effect.
        setTimeout(
          () => runSquidWorker().catch(e => logger.error(e, 'Squid worker startup error')),
          60_000
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
