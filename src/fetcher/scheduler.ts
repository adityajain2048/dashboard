import type { RefreshTier, Asset } from '../types/index.js';
import { TIER1_ROUTES, TIER2_ROUTES, TIER3_ROUTES, REFRESH_INTERVALS } from '../config/routes.js';
import { processRoute } from './pipeline.js';
import { generateBatchId, chunk } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import { refreshNativePrices } from '../lib/prices.js';

// 5 concurrent route tasks × 3 aggregators = 15 simultaneous HTTP requests max.
// Keeps per-aggregator burst below their rate limits and prevents LI.FI timeouts under load.
const CONCURRENCY = 5;

const cycleRunning = new Map<RefreshTier, boolean>();

export async function runTierCycle(tier: RefreshTier): Promise<void> {
  if (cycleRunning.get(tier)) {
    logger.info({ component: 'scheduler', tier }, `Tier ${tier} skipped (previous cycle still running)`);
    return;
  }
  cycleRunning.set(tier, true);

  try {
    await refreshNativePrices();

    const routes = tier === 1 ? TIER1_ROUTES : tier === 2 ? TIER2_ROUTES : TIER3_ROUTES;
    const batchId = generateBatchId();
    const log = logger.child({ component: 'scheduler', tier, batchId } as Record<string, unknown>);

    const tasks: Array<{ src: string; dst: string; asset: Asset; amountTier: number }> = [];
    for (const route of routes) {
      for (const asset of route.assets) {
        for (const amountTier of route.amountTiers) {
          tasks.push({ src: route.src, dst: route.dst, asset, amountTier });
        }
      }
    }

    log.info({ routes: routes.length, tasks: tasks.length }, `Tier ${tier} cycle starting`);
    const cycleStart = Date.now();
    let totalQuotes = 0;
    let successCount = 0;
    let emptyCount = 0;
    let errorCount = 0;

    for (const batch of chunk(tasks, CONCURRENCY)) {
      const results = await Promise.allSettled(
        batch.map((t) =>
          processRoute(t.src, t.dst, t.asset, t.amountTier, batchId, log)
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
      { tasks: tasks.length, quotes: totalQuotes, success: successCount, empty: emptyCount, errors: errorCount, ms: elapsed },
      `Tier ${tier} cycle complete — ${totalQuotes} quotes from ${successCount}/${tasks.length} routes in ${(elapsed / 1000).toFixed(1)}s`
    );
  } finally {
    cycleRunning.set(tier, false);
  }
}

export function startScheduler(): void {
  logger.info({ component: 'scheduler' }, 'Scheduler starting...');

  // Stagger initial runs to avoid concurrent thundering herd on all APIs at once.
  // T1 starts immediately, T2 waits 3min, T3 waits 6min.
  setTimeout(() => {
    runTierCycle(1).catch((e) => logger.error(e, 'Tier 1 cycle error'));
  }, 0);
  setTimeout(() => {
    runTierCycle(2).catch((e) => logger.error(e, 'Tier 2 cycle error'));
  }, 3 * 60_000);
  setTimeout(() => {
    runTierCycle(3).catch((e) => logger.error(e, 'Tier 3 cycle error'));
  }, 6 * 60_000);

  setInterval(() => {
    runTierCycle(1).catch((e) => logger.error(e, 'Tier 1 cycle error'));
  }, REFRESH_INTERVALS[1]);
  setInterval(() => {
    runTierCycle(2).catch((e) => logger.error(e, 'Tier 2 cycle error'));
  }, REFRESH_INTERVALS[2]);
  setInterval(() => {
    runTierCycle(3).catch((e) => logger.error(e, 'Tier 3 cycle error'));
  }, REFRESH_INTERVALS[3]);
}
