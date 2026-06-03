import type { Asset, AggregatorId } from '../types/index.js';
import { ALL_ROUTES, REFRESH_INTERVALS } from '../config/routes.js';
import { processRoute } from './pipeline.js';
import { generateBatchId, chunk } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { refreshNativePrices } from '../lib/prices.js';
import { getGapCoverage, hasRecentQuotes, hasRecentSquidQuotes, getSquidGapKeys } from '../db/queries.js';

// ─── Concurrency constants ────────────────────────────────────────────────────

/**
 * Sweep concurrency — 24 concurrent tasks ≈ 12 req/s to Squid (confirmed safe at 720 rpm).
 * Previous value of 150 caused immediate 429 bans on every startup.
 */
const SWEEP_CONCURRENCY = 24;

/**
 * T1 regular cycle concurrency.
 * T1 uses only fast aggregators (LI.FI + Squid). Squid is 720 rpm (12/s), LI.FI 400 rpm.
 * 24 concurrent routes → ~28 batches × ~3s ≈ 84s total for 666 tasks (within 5 min cycle).
 */
const T1_CONCURRENCY = 24;

/** T2/T3 refresh cycles — all aggregators including Rango (10 rpm). Keep low. */
const REGULAR_CONCURRENCY = 5;

/** Gap fill: non-Squid aggregators, slower rate limits. */
const GAP_FILL_CONCURRENCY = 8;

/** How often to re-run gap fill for routes Squid doesn't cover. */
const GAP_FILL_INTERVAL_MS = 10 * 60_000; // 10 minutes

// ─── Aggregator subsets ───────────────────────────────────────────────────────

const SQUID_ONLY: readonly AggregatorId[] = ['squid'];
const NON_SQUID: readonly AggregatorId[] = ['lifi', 'rango', 'bungee', 'rubic'];

/**
 * T1 aggregators: Squid (720 rpm) + LI.FI (400 rpm, 3 keys) + Bungee (100 rpm).
 * All three fire concurrently within each route so quotes are always compared side-by-side.
 * Rango (10 rpm) is too slow for T1 — it continues via T2/T3 cycles.
 * Bungee is EVM-only so non-EVM routes (Solana, Cosmos) return immediately from Bungee,
 * keeping the effective Bungee call count at ~19/batch (of 24) → ~11.8s per batch → ~5.3 min total.
 */
const T1_AGGREGATORS: readonly AggregatorId[] = ['squid', 'lifi', 'bungee'];

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

// ─── Regular refresh cycles ───────────────────────────────────────────────────

const cycleRunning = new Map<number, boolean>();

/**
 * Refresh cycle for a given tier: re-fetch all routes in that tier from ALL aggregators.
 *
 * @param aggregatorOverride - Optional subset of aggregators to use instead of the tier default.
 *   Used for pre-sweep cycles (non-Squid only) so lifi/rango/bungee start immediately
 *   without contending with the Squid sweep's rate-limit budget.
 */
async function runTierCycle(tier: 1 | 2 | 3, aggregatorOverride?: readonly AggregatorId[]): Promise<void> {
  if (cycleRunning.get(tier)) {
    logger.info({ component: 'scheduler', tier }, `Tier ${tier} skipped (previous cycle still running)`);
    return;
  }
  cycleRunning.set(tier, true);

  try {
    await refreshNativePrices();

    const tierRoutes = ALL_ROUTES.filter((r) => r.tier === tier);
    const batchId = generateBatchId();
    const log = logger.child({ component: 'scheduler', tier, batchId } as Record<string, unknown>);

    const tasks: Array<{ src: string; dst: string; asset: Asset; amountTier: number }> = [];
    for (const route of tierRoutes) {
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

    log.info({ routes: tierRoutes.length, tasks: tasks.length }, `Tier ${tier} cycle starting`);
    const cycleStart = Date.now();
    let totalQuotes = 0;
    let successCount = 0;
    let emptyCount = 0;
    let errorCount = 0;

    // T1: fast aggregators only (LI.FI + Squid + Bungee) at higher concurrency.
    // T2/T3: all aggregators at lower concurrency (Rango rate limit is the bottleneck).
    // aggregatorOverride lets pre-sweep cycles exclude Squid (avoids rate-limit contention).
    const concurrency = tier === 1 ? T1_CONCURRENCY : REGULAR_CONCURRENCY;
    const aggregators = aggregatorOverride ?? (tier === 1 ? T1_AGGREGATORS : undefined);

    for (const batch of chunk(tasks, concurrency)) {
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
      `Tier ${tier} cycle complete — ${totalQuotes} quotes from ${successCount}/${tasks.length} routes in ${(elapsed / 1000).toFixed(1)}s`
    );
  } finally {
    cycleRunning.set(tier, false);
  }
}

// ─── Scheduler entry point ────────────────────────────────────────────────────

/**
 * Startup sequence:
 * 1. Run a full Squid sweep (all routes × assets × tiers) at 20 req/s.
 * 2. After sweep, identify gap routes (Squid returned nothing).
 * 3. Query DB for which non-Squid aggregators have historically covered gaps.
 * 4. Start gap-fill interval (every 10 min) for non-Squid routes.
 * 5. Start regular T1/T2/T3 refresh cycles for Squid-covered routes.
 */
/** How fresh the DB must be to skip the Squid sweep on restart (30 minutes). */
const SKIP_SWEEP_IF_FRESH_MS = 30 * 60_000;

export function startScheduler(): void {
  logger.info({ component: 'scheduler' }, 'Scheduler starting — Squid sweep first, then periodic refresh');

  // ── Pre-sweep cycles: start lifi/bungee/rango/rubic immediately ──────────────
  // Don't wait for the Squid sweep — it takes up to ~2.5h on a cold DB and blocks
  // nothing that lifi/bungee/rango actually need. Use non-Squid aggregators only so
  // these cycles don't contest Squid's 720 rpm rate-limit budget with the sweep.
  // One-shot immediate runs; the regular intervals (with full Squid) start after sweep.
  logger.info(
    { component: 'scheduler' },
    'Pre-sweep cycles starting — lifi/bungee for T1, all non-Squid for T2/T3'
  );
  setTimeout(() => runTierCycle(1, ['lifi', 'bungee']).catch((e) => logger.error(e, 'Pre-sweep T1 error')), 0);
  setTimeout(() => runTierCycle(2, NON_SQUID).catch((e) => logger.error(e, 'Pre-sweep T2 error')), 60_000);
  setTimeout(() => runTierCycle(3, NON_SQUID).catch((e) => logger.error(e, 'Pre-sweep T3 error')), 2 * 60_000);

  // ── Squid sweep + gap fill ────────────────────────────────────────────────────
  // Skip the sweep only if Squid specifically has recent quotes (within 30 min).
  // Using hasRecentSquidQuotes (not hasRecentQuotes) is critical: LI.FI/Bungee data
  // being fresh should NOT suppress the Squid sweep — if Squid's data is stale (e.g.
  // after a rate-limit event), we must re-sweep all routes through Squid regardless of
  // what other aggregators have stored.
  const sweepPromise = hasRecentSquidQuotes(SKIP_SWEEP_IF_FRESH_MS)
    .then(async (squidFresh) => {
      if (squidFresh) {
        logger.info(
          { component: 'scheduler' },
          'Recent Squid quotes found in DB — skipping Squid sweep, populating gap keys from DB'
        );
        // Even when sweep is skipped, we must populate squidGapKeys from DB so gap fill
        // correctly identifies routes Squid doesn't cover (non-Squid aggregators fill those).
        await refreshGapKeysFromDB();
        return;
      }
      logger.info(
        { component: 'scheduler' },
        'No recent Squid quotes in DB — running full Squid sweep to index all routes'
      );
      await runSquidSweep();
      // After sweep: re-derive gap keys from DB. This is more accurate than sweep results
      // because sweep-time 429 cooldowns produce false-positive gaps (routes Squid CAN cover
      // but was rate-limited for). DB reflects what Squid actually stored.
      await refreshGapKeysFromDB();
    });

  sweepPromise
    .then(() => {
      logger.info(
        { component: 'scheduler', gaps: squidGapKeys.size },
        `Sweep done. Starting periodic cycles and gap fill for ${squidGapKeys.size} non-Squid routes.`
      );

      // Run gap fill immediately after sweep, then every 10 min.
      // Gap fill needs squidGapKeys populated — must stay inside sweepPromise.then().
      runGapFillCycle().catch((e) => logger.error(e, 'Gap fill error'));
      setInterval(() => {
        runGapFillCycle().catch((e) => logger.error(e, 'Gap fill error'));
      }, GAP_FILL_INTERVAL_MS);

      // Start full T1/T2/T3 cycles with all aggregators (including Squid).
      // Stagger slightly to avoid thundering herd on all APIs at once.
      setTimeout(() => { runTierCycle(1).catch((e) => logger.error(e, 'Tier 1 cycle error')); }, 0);
      setTimeout(() => { runTierCycle(2).catch((e) => logger.error(e, 'Tier 2 cycle error')); }, 2 * 60_000);
      setTimeout(() => { runTierCycle(3).catch((e) => logger.error(e, 'Tier 3 cycle error')); }, 4 * 60_000);

      setInterval(() => { runTierCycle(1).catch((e) => logger.error(e, 'Tier 1 cycle error')); }, REFRESH_INTERVALS[1]);
      setInterval(() => { runTierCycle(2).catch((e) => logger.error(e, 'Tier 2 cycle error')); }, REFRESH_INTERVALS[2]);
      setInterval(() => { runTierCycle(3).catch((e) => logger.error(e, 'Tier 3 cycle error')); }, REFRESH_INTERVALS[3]);
    })
    .catch((e) => {
      logger.error(e, 'Startup sequence failed — starting periodic cycles immediately as fallback');

      // Fallback: if sweep errors out, start normal cycles so the service isn't dead
      setTimeout(() => runTierCycle(1).catch((e2) => logger.error(e2, 'Tier 1 cycle error')), 0);
      setTimeout(() => runTierCycle(2).catch((e2) => logger.error(e2, 'Tier 2 cycle error')), 3 * 60_000);
      setTimeout(() => runTierCycle(3).catch((e2) => logger.error(e2, 'Tier 3 cycle error')), 6 * 60_000);

      setInterval(() => runTierCycle(1).catch((e2) => logger.error(e2, 'Tier 1 cycle error')), REFRESH_INTERVALS[1]);
      setInterval(() => runTierCycle(2).catch((e2) => logger.error(e2, 'Tier 2 cycle error')), REFRESH_INTERVALS[2]);
      setInterval(() => runTierCycle(3).catch((e2) => logger.error(e2, 'Tier 3 cycle error')), REFRESH_INTERVALS[3]);
    });
}
