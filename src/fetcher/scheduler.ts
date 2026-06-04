import type { Asset, AggregatorId } from '../types/index.js';
import { ALL_ROUTES, REFRESH_INTERVAL_MS } from '../config/routes.js';
import { processRoute } from './pipeline.js';
import { generateBatchId, chunk } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { refreshNativePrices } from '../lib/prices.js';
import { getGapCoverage, hasRecentQuotes, hasRecentSquidQuotes, getSquidGapKeys } from '../db/queries.js';
import { loadSkipMap } from '../lib/aggregator-skip.js';

// ─── Concurrency constants ────────────────────────────────────────────────────

/**
 * Sweep concurrency — 24 concurrent tasks ≈ 12 req/s to Squid (confirmed safe at 720 rpm).
 * Previous value of 150 caused immediate 429 bans on every startup.
 */
const SWEEP_CONCURRENCY = 24;

/**
 * All-routes cycle concurrency — applies to the single unified non-Squid refresh cycle.
 * Without Rango's 30-second timeouts, bottleneck is Bungee (~7.5s) and LI.FI (~5s).
 * 20 concurrent → ~2-3 effective req/s per aggregator, within rate limits.
 */
const CYCLE_CONCURRENCY = 20;

/** Gap fill: non-Squid aggregators, slower rate limits. */
const GAP_FILL_CONCURRENCY = 8;

/** How often to re-run gap fill for routes Squid doesn't cover. */
const GAP_FILL_INTERVAL_MS = 10 * 60_000; // 10 minutes

// ─── Aggregator subsets ───────────────────────────────────────────────────────

const SQUID_ONLY: readonly AggregatorId[] = ['squid'];
// Rango globally disabled (97.7% timeout — Azure IP blocked by Cloudflare WAF).
const NON_SQUID: readonly AggregatorId[] = ['lifi', 'bungee', 'rubic'];
const ALL_AGGREGATORS: readonly AggregatorId[] = ['squid', 'lifi', 'bungee', 'rubic'];

// ─── Gap tracking ─────────────────────────────────────────────────────────────

/**
 * Routes where Squid returned 0 quotes (unsupported chain pairs, no liquidity, etc.).
 * Populated during initial sweep; used to drive gap-fill cycles.
 * Format: "src:dst:asset:amountTier"
 */
const squidGapKeys = new Set<string>();

function makeTaskKey(src: string, dst: string, asset: string, amountTier: number): string {
  return `${src}:${dst}:${asset}:${amountTier}`;
}

// ─── Gap key helpers ──────────────────────────────────────────────────────────

/** Build the flat list of all task keys (src:dst:asset:amountTier) across every route. */
function buildAllTaskKeys(): string[] {
  const keys: string[] = [];
  for (const route of ALL_ROUTES) {
    for (const asset of route.assets) {
      for (const amountTier of route.amountTiers) {
        keys.push(makeTaskKey(route.src, route.dst, asset, amountTier));
      }
    }
  }
  return keys;
}

/**
 * Replace squidGapKeys with an accurate set derived from route_latest.
 * Any task key where Squid has NO stored quote is a gap.
 *
 * Using DB (not sweep results) avoids false-positive gaps caused by Squid
 * 429 cooldowns during the sweep — routes Squid was rate-limited for still
 * get retried in T1/T2/T3 cycles, and once stored they'll disappear from
 * gap keys next time this runs.
 */
async function refreshGapKeysFromDB(): Promise<void> {
  const allKeys = buildAllTaskKeys();
  const gaps = await getSquidGapKeys(allKeys);
  squidGapKeys.clear();
  for (const key of gaps) {
    squidGapKeys.add(key);
  }
  logger.info(
    { component: 'scheduler', gaps: squidGapKeys.size, total: allKeys.length },
    `Squid gap keys refreshed from DB — ${squidGapKeys.size}/${allKeys.length} routes not covered by Squid`
  );
}

// ─── Sweep ────────────────────────────────────────────────────────────────────

/**
 * One-time initial pass: hit ALL routes × assets × tiers through Squid at full speed.
 * Runs before any periodic cycle starts. Identifies which routes Squid covers vs. gaps.
 * At 20 req/sec (1200 rpm), ~15K tasks ≈ 12–14 minutes.
 */
async function runSquidSweep(): Promise<void> {
  await refreshNativePrices();

  // Build the flat task list: every route × every asset × every tier
  const tasks: Array<{ src: string; dst: string; asset: Asset; amountTier: number }> = [];
  for (const route of ALL_ROUTES) {
    for (const asset of route.assets) {
      for (const amountTier of route.amountTiers) {
        tasks.push({ src: route.src, dst: route.dst, asset, amountTier });
      }
    }
  }

  const batchId = generateBatchId();
  const log = logger.child({ component: 'squid-sweep', batchId } as Record<string, unknown>);
  const sweepStart = Date.now();

  log.info(
    { total: tasks.length, concurrency: SWEEP_CONCURRENCY },
    `Squid sweep starting — ${tasks.length} tasks, Squid only, at 20 req/s`
  );

  let covered = 0;
  let gap = 0;
  let errors = 0;
  let done = 0;

  for (const batch of chunk(tasks, SWEEP_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map((t) =>
        processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, SQUID_ONLY)
      )
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const t = batch[i];
      done++;
      if (r.status === 'fulfilled') {
        if (r.value > 0) {
          covered++;
        } else {
          squidGapKeys.add(makeTaskKey(t.src, t.dst, t.asset, t.amountTier));
          gap++;
        }
      } else {
        errors++;
        squidGapKeys.add(makeTaskKey(t.src, t.dst, t.asset, t.amountTier));
        gap++;
      }
    }

    // Progress log every ~1000 tasks
    if (done % 1000 < SWEEP_CONCURRENCY) {
      const pct = ((done / tasks.length) * 100).toFixed(1);
      const elapsed_s = ((Date.now() - sweepStart) / 1000).toFixed(0);
      const eta_s = done > 0
        ? Math.round(((tasks.length - done) / done) * (Date.now() - sweepStart) / 1000)
        : '?';
      log.info({ done, total: tasks.length, pct, covered, gap, elapsed_s, eta_s }, 'Sweep progress');
    }
  }

  const elapsed = ((Date.now() - sweepStart) / 1000).toFixed(1);
  log.info(
    { covered, gap, errors, total: tasks.length, elapsed_s: elapsed },
    `Squid sweep complete — ${covered} routes covered, ${gap} gaps identified in ${elapsed}s`
  );
}

// ─── Gap fill ─────────────────────────────────────────────────────────────────

/**
 * For routes where Squid has no coverage, call non-Squid aggregators.
 * Uses DB history to pick the specific aggregators that have shown coverage,
 * falling back to all 4 non-Squid aggregators for routes with no history.
 */
async function runGapFillCycle(): Promise<void> {
  if (squidGapKeys.size === 0) return;

  const log = logger.child({ component: 'gap-fill' } as Record<string, unknown>);

  // Check DB for historical aggregator coverage on each gap route
  const coverageMap = await getGapCoverage([...squidGapKeys]);

  const tasks = [...squidGapKeys].map((key) => {
    const parts = key.split(':');
    return {
      src: parts[0],
      dst: parts[1],
      asset: parts[2] as Asset,
      amountTier: Number(parts[3]),
      key,
    };
  });

  log.info(
    { gaps: tasks.length, withHistory: coverageMap.size },
    'Gap fill cycle starting'
  );

  const batchId = generateBatchId();
  let filled = 0;

  for (const batch of chunk(tasks, GAP_FILL_CONCURRENCY)) {
    const results = await Promise.allSettled(
      batch.map((t) => {
        const historicProviders = coverageMap.get(t.key) as AggregatorId[] | undefined;
        // If we know which aggregators cover this route from DB history, use only those.
        // Otherwise try all non-Squid aggregators to discover coverage.
        const subset: readonly AggregatorId[] =
          historicProviders && historicProviders.length > 0
            ? (historicProviders as readonly AggregatorId[])
            : NON_SQUID;
        return processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, subset);
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value > 0) filled++;
    }
  }

  log.info({ gaps: tasks.length, filled }, 'Gap fill cycle complete');
}

// ─── All-routes refresh cycle ─────────────────────────────────────────────────

let cycleRunning = false;

/**
 * Unified refresh cycle: re-fetch ALL routes from all supported aggregators.
 * No tier distinction — every route is treated equally.
 *
 * @param aggregatorOverride - Optional subset of aggregators.
 *   Used for the pre-sweep pass (NON_SQUID) so lifi/bungee/rubic start immediately
 *   without contending with the Squid sweep's 720 rpm rate-limit budget.
 *   After the sweep, all four aggregators (ALL_AGGREGATORS) are used.
 */
async function runAllCycle(aggregatorOverride?: readonly AggregatorId[]): Promise<void> {
  if (cycleRunning) {
    logger.info({ component: 'scheduler' }, 'All-routes cycle skipped (previous cycle still running)');
    return;
  }
  cycleRunning = true;

  try {
    await refreshNativePrices();

    const batchId = generateBatchId();
    const log = logger.child({ component: 'scheduler', batchId } as Record<string, unknown>);

    const tasks: Array<{ src: string; dst: string; asset: Asset; amountTier: number }> = [];
    for (const route of ALL_ROUTES) {
      for (const asset of route.assets) {
        for (const amountTier of route.amountTiers) {
          tasks.push({ src: route.src, dst: route.dst, asset, amountTier });
        }
      }
    }

    // Shuffle so no chain is consistently processed last — prevents starvation for
    // routes at the tail of the static CHAIN_SLUGS order (e.g. solana, Cosmos chains).
    for (let i = tasks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tasks[i], tasks[j]] = [tasks[j]!, tasks[i]!];
    }

    const aggregators = aggregatorOverride ?? ALL_AGGREGATORS;
    log.info(
      { routes: ALL_ROUTES.length, tasks: tasks.length, aggregators },
      'All-routes cycle starting'
    );
    const cycleStart = Date.now();
    let totalQuotes = 0;
    let successCount = 0;
    let emptyCount = 0;
    let errorCount = 0;

    for (const batch of chunk(tasks, CYCLE_CONCURRENCY)) {
      const results = await Promise.allSettled(
        batch.map((t) =>
          processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log, aggregators)
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const n = r.value;
          totalQuotes += n;
          if (n > 0) successCount++;
          else emptyCount++;
        } else {
          errorCount++;
        }
      }
    }

    const elapsed = Date.now() - cycleStart;
    log.info(
      {
        tasks: tasks.length,
        quotes: totalQuotes,
        success: successCount,
        empty: emptyCount,
        errors: errorCount,
        ms: elapsed,
      },
      `All-routes cycle complete — ${totalQuotes} quotes from ${successCount}/${tasks.length} routes in ${(elapsed / 1000).toFixed(1)}s`
    );
  } finally {
    cycleRunning = false;
  }
}

// ─── Scheduler entry point ────────────────────────────────────────────────────

/**
 * Startup sequence:
 * 1. Pre-sweep: run all routes through lifi/bungee/rubic immediately (no Squid contention).
 * 2. Run a full Squid sweep (all routes × assets × amounts) at 20 req/s.
 * 3. After sweep, start gap-fill every 10 min for routes Squid doesn't cover.
 * 4. Start the unified all-routes cycle (all aggregators, every 30 min).
 */

/**
 * Only skip the Squid sweep if data is THIS fresh — prevents re-sweeping when
 * a process crashes and immediately restarts (< 2 min gap). Any longer gap and
 * we always sweep, even if the previous instance had just finished.
 * Previously 30 min, which caused the sweep to be skipped when a previous
 * instance stored a Squid quote 1 min before shutdown.
 */
const SKIP_SWEEP_IF_FRESH_MS = 2 * 60_000; // 2 minutes

export function startScheduler(): void {
  logger.info({ component: 'scheduler' }, 'Scheduler starting — pre-sweep non-Squid cycle, then Squid sweep');

  // Refresh skip map every 30 minutes to pick up new skip entries from completed cycles.
  setInterval(() => {
    loadSkipMap().catch((e) => logger.warn(e, 'Skip map refresh failed'));
  }, 30 * 60_000);

  // Load adaptive skip map from DB before any API calls.
  loadSkipMap().catch((e) => logger.warn(e, 'Failed to load skip map — continuing without'));

  // ── Pre-sweep: lifi/bungee/rubic across all routes immediately ───────────────
  setTimeout(
    () => runAllCycle(NON_SQUID).catch((e) => logger.error(e, 'Pre-sweep cycle error')),
    0
  );

  // ── Squid sweep + gap fill + unified all-routes cycle ────────────────────────
  const sweepPromise = hasRecentSquidQuotes(SKIP_SWEEP_IF_FRESH_MS)
    .then(async (squidFresh) => {
      if (squidFresh) {
        logger.info(
          { component: 'scheduler' },
          'Recent Squid quotes found in DB — skipping Squid sweep, populating gap keys from DB'
        );
        await refreshGapKeysFromDB();
        return;
      }
      logger.info(
        { component: 'scheduler' },
        'No recent Squid quotes in DB — running full Squid sweep to index all routes'
      );
      await runSquidSweep();
      // Re-derive gap keys from DB (more accurate than sweep-time tracking —
      // 429 cooldowns during sweep create false-positive gaps).
      await refreshGapKeysFromDB();
    });

  sweepPromise
    .then(() => {
      logger.info(
        { component: 'scheduler', gaps: squidGapKeys.size },
        `Sweep done. Starting gap fill (${squidGapKeys.size} non-Squid routes) and all-routes cycle.`
      );

      // Gap fill: every 10 min for routes Squid doesn't cover.
      runGapFillCycle().catch((e) => logger.error(e, 'Gap fill error'));
      setInterval(
        () => runGapFillCycle().catch((e) => logger.error(e, 'Gap fill error')),
        GAP_FILL_INTERVAL_MS
      );

      // Unified all-routes cycle: all aggregators, every 30 min.
      // NOTE: the pre-sweep runAllCycle(NON_SQUID) may still be running here
      // (it takes ~2 h for all 27K tasks). runAllCycle() uses a cycleRunning guard
      // and will skip if the pre-sweep is in progress — the setInterval will retry
      // every 30 min until the pre-sweep finishes and a slot opens.
      setInterval(
        () => runAllCycle().catch((e) => logger.error(e, 'All-routes cycle error')),
        REFRESH_INTERVAL_MS
      );
    })
    .catch((e) => {
      logger.error(e, 'Startup sweep failed — falling back to periodic all-routes cycle');
      setInterval(
        () => runAllCycle().catch((e2) => logger.error(e2, 'All-routes cycle error')),
        REFRESH_INTERVAL_MS
      );
    });
}
