import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { V1_DIRECT_BRIDGES } from '../../config/bridges.js';
import { logger } from '../../lib/logger.js';
import { fetchAcross } from './across.js';
import { fetchRelay } from './relay.js';
import { fetchMayan } from './mayan.js';
import { fetchMeson } from './meson.js';

export type BridgeFetcher = (route: RouteKey) => Promise<NormalizedQuote[]>;

export const bridgeRegistry: Record<string, BridgeFetcher> = {};

export function registerBridge(id: string, fetcher: BridgeFetcher): void {
  bridgeRegistry[id] = fetcher;
}

registerBridge('across', fetchAcross);
registerBridge('relay', fetchRelay);
registerBridge('mayan', fetchMayan);
registerBridge('meson', fetchMeson);

export async function gapFill(
  routeKey: RouteKey,
  bridgesSeen: Set<string>,
  _batchId: string
): Promise<NormalizedQuote[]> {
  const missing = V1_DIRECT_BRIDGES.filter(
    (b) =>
      !bridgesSeen.has(b.id) &&
      (b.gapFillPriority === 'high' || b.gapFillPriority === 'medium') &&
      bridgeRegistry[b.id]
  );

  if (missing.length === 0) return [];

  const results = await Promise.allSettled(
    missing.map(async (bridge) => {
      try {
        return await bridgeRegistry[bridge.id]!(routeKey);
      } catch (err) {
        logger.warn({ bridge: bridge.id, error: err }, 'Gap-fill bridge failed');
        return [];
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<NormalizedQuote[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
}
