import type { RouteKey, Asset } from '../types/index.js';
import type { Logger } from '../lib/logger.js';
import { routeTag, logger as rootLogger } from '../lib/logger.js';
import { fetchAllAggregators } from './aggregators/index.js';
import { gapFill } from './bridges/index.js';
import { rankQuotes, deduplicateQuotes } from './normalizer.js';
import { recalcQuotesUsd } from './recalcUsd.js';
import {
  insertQuotesBatch,
  upsertRouteLatest,
  updateRouteStatus,
} from '../db/queries.js';

export async function processRoute(
  src: string,
  dst: string,
  asset: Asset,
  amountTier: number,
  batchId: string,
  parentLog?: Logger
): Promise<number> {
  const route = routeTag(src, dst, asset, amountTier);
  const log = (parentLog ?? rootLogger).child({ route });

  const startMs = Date.now();
  const routeKey: RouteKey = { src, dst, asset, amountTier };

  const { quotes: aggQuotes, bridgesSeen } = await fetchAllAggregators(routeKey, batchId, log);
  const gapQuotes = await gapFill(routeKey, bridgesSeen, batchId);
  const allQuotes = [...aggQuotes, ...gapQuotes];

  const withBatchId = allQuotes.map((q) => ({ ...q, batchId }));
  const deduped = deduplicateQuotes(withBatchId);
  // Recalculate USD values using CoinGecko prices (overrides aggregator USD values)
  const recalced = recalcQuotesUsd(deduped);
  const ranked = rankQuotes(recalced);

  try {
    if (ranked.length > 0) {
      await insertQuotesBatch(ranked);
      await upsertRouteLatest(ranked);
    }
    await updateRouteStatus(src, dst, asset, amountTier, ranked);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'DB write failed');
  }

  const elapsed = Date.now() - startMs;
  const bridges = ranked.map((q) => q.bridge);
  log.debug({ quotes: ranked.length, bridges, ms: elapsed }, 'Route processed');
  return ranked.length;
}
