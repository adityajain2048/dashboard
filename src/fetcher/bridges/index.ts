import pRetry, { AbortError } from 'p-retry';
import type { NormalizedQuote, RouteKey } from '../../types/index.js';
import { V1_DIRECT_BRIDGES } from '../../config/bridges.js';
import { logger } from '../../lib/logger.js';
import { getBridgeLimiter } from '../../lib/rate-limiter.js';
import { RateLimitError } from '../../lib/errors.js';
import { withTimeout } from '../../lib/utils.js';
import { fetchAcross } from './across.js';
import { fetchRelay } from './relay.js';
import { fetchMayan } from './mayan.js';
import { fetchMeson } from './meson.js';
import { fetchDebridge } from './debridge.js';
import { fetchHop } from './hop.js';
import { fetchCbridge } from './cbridge.js';
import { fetchSymbiosis } from './symbiosis.js';
import { fetchThorchain } from './thorchain.js';
import { fetchStargate } from './stargate.js';
import { fetchOrbiter } from './orbiter.js';
import { fetchEverclear } from './everclear.js';

export type BridgeFetcher = (route: RouteKey, key: string) => Promise<NormalizedQuote[]>;

export const bridgeRegistry: Record<string, BridgeFetcher> = {};

export function registerBridge(id: string, fetcher: BridgeFetcher): void {
  bridgeRegistry[id] = fetcher;
}

// ─── Register all 12 direct bridge fetchers ───
registerBridge('across', fetchAcross);
registerBridge('relay', fetchRelay);
registerBridge('mayan', fetchMayan);
registerBridge('meson', fetchMeson);
registerBridge('debridge', fetchDebridge);
registerBridge('hop', fetchHop);
registerBridge('cbridge', fetchCbridge);
registerBridge('symbiosis', fetchSymbiosis);
registerBridge('thorchain', fetchThorchain);
registerBridge('stargate', fetchStargate);
registerBridge('orbiter', fetchOrbiter);
registerBridge('everclear', fetchEverclear);

/** Hard cap per bridge call including p-retry attempts. */
const BRIDGE_TIMEOUT_MS = 15_000;

const BRIDGE_RETRY_OPTIONS = {
  retries: 1,          // One retry for transient errors (bridges are gap-fill, not time-critical)
  minTimeout: 1_000,
  maxTimeout: 5_000,
  factor: 2,
  randomize: true,
} as const;

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
      const limiter = getBridgeLimiter(bridge.id);

      if (limiter.isOpen()) return [];

      try {
        const result = await withTimeout(
          pRetry(
            () => limiter.schedule((key) => bridgeRegistry[bridge.id]!(routeKey, key)),
            {
              ...BRIDGE_RETRY_OPTIONS,
              onFailedAttempt: ({ error }) => {
                if (error instanceof RateLimitError) {
                  limiter.on429(error.retryAfterMs, error.key || undefined);
                  throw new AbortError(error.message);
                }
                limiter.recordFailure();
              },
            }
          ),
          BRIDGE_TIMEOUT_MS
        );

        limiter.recordSuccess();
        return result;
      } catch (err) {
        const isRateLimit = err instanceof RateLimitError ||
          (err instanceof AbortError && err.message.toLowerCase().includes('rate limit'));
        if (!isRateLimit) {
          logger.debug({ bridge: bridge.id, error: err }, 'Gap-fill bridge failed');
        }
        return [];
      }
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<NormalizedQuote[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
}
