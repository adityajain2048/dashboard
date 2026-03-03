import type { NormalizedQuote, RouteKey, AggregatorId } from '../../types/index.js';
import type { Logger } from '../../lib/logger.js';
import { logger as rootLogger } from '../../lib/logger.js';
import { getAggregatorLimiter } from '../../lib/rate-limiter.js';
import { insertFetchLog } from '../../db/queries.js';
import { fetchLifi } from './lifi.js';
import { fetchRango } from './rango.js';
import { fetchBungee } from './bungee.js';
import { fetchRubic } from './rubic.js';

// Give LI.FI enough time for complex/slow routes (monad, berachain, etc. can take 12-15s)
const AGGREGATOR_TIMEOUT_MS = 22_000;

// Rubic is queried only for routes that other aggregators can't handle:
//  - abstract, hyperliquid, berachain (LI.FI can be slow; Rubic adds coverage)
// Solana: LI.FI supports via lifiChainId 1151111081099710.
const RUBIC_FALLBACK_CHAINS = new Set<string>([
  'hyperliquid',
  'berachain',
  'abstract',
]);

function shouldUseRubic(route: RouteKey): boolean {
  return RUBIC_FALLBACK_CHAINS.has(route.src) || RUBIC_FALLBACK_CHAINS.has(route.dst);
}

export type AggregatorFetcher = (route: RouteKey) => Promise<NormalizedQuote[]>;

export const aggregatorRegistry: Record<AggregatorId, AggregatorFetcher> = {} as Record<
  AggregatorId,
  AggregatorFetcher
>;

export function registerAggregator(id: AggregatorId, fetcher: AggregatorFetcher): void {
  aggregatorRegistry[id] = fetcher;
}

registerAggregator('lifi', fetchLifi);
registerAggregator('rango', fetchRango);
registerAggregator('bungee', fetchBungee);
registerAggregator('rubic', (route) =>
  fetchRubic(route, {
    isFallbackOnlyRoute: RUBIC_FALLBACK_CHAINS.has(route.src) && RUBIC_FALLBACK_CHAINS.has(route.dst),
  })
);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

const circuitBreakLogged = new Set<AggregatorId>();

export async function fetchAllAggregators(
  route: RouteKey,
  batchId: string,
  parentLog?: Logger
): Promise<{ quotes: NormalizedQuote[]; bridgesSeen: Set<string> }> {
  const quotes: NormalizedQuote[] = [];
  const bridgesSeen = new Set<string>();
  const baseLog = parentLog ?? rootLogger;

  const allIds = Object.keys(aggregatorRegistry) as AggregatorId[];
  const ids = allIds.filter((id) => (id === 'rubic' ? shouldUseRubic(route) : true));
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const log = baseLog.child({ aggregator: id });
      const limiter = getAggregatorLimiter(id);

      if (limiter.isOpen()) {
        if (!circuitBreakLogged.has(id)) {
          log.warn(`${id} circuit breaker OPEN — skipping for cooldown`);
          circuitBreakLogged.add(id);
          setTimeout(() => circuitBreakLogged.delete(id), 60_000);
        }
        return [];
      }

      await limiter.acquire();
      if (limiter.isOpen()) return [];

      const startMs = Date.now();
      try {
        const result = await withTimeout(
          aggregatorRegistry[id](route),
          AGGREGATOR_TIMEOUT_MS
        );
        const responseMs = Date.now() - startMs;
        limiter.recordSuccess();
        const bridgesFound = result.map((q) => q.bridge);
        for (const q of result) bridgesSeen.add(q.bridge);

        log.debug({ responseMs, quotes: result.length, bridges: bridgesFound }, `${id} OK`);

        await insertFetchLog({
          batchId, ts: new Date(), srcChain: route.src, dstChain: route.dst,
          asset: route.asset, amountTier: route.amountTier, source: id,
          bridge: null, status: 'success', responseMs, errorMessage: null,
          quoteCount: result.length,
        }).catch(() => {});

        return result;
      } catch (err) {
        const responseMs = Date.now() - startMs;
        const isTimeout = err instanceof Error && err.message === 'timeout';
        const errorMessage = err instanceof Error ? err.message : String(err);
        const lower = errorMessage.toLowerCase();
        const isHttp400 = lower.includes('http 400') || lower.includes('http 404');
        const isHttp429 = lower.includes('http 429');
        const isNoRoute =
          !isTimeout &&
          (isHttp400 ||
            lower.includes('none of the available routes') ||
            lower.includes('no route') ||
            lower.includes('operation was aborted'));
        const status = isTimeout ? 'timeout' : isHttp429 ? 'skipped' : isNoRoute ? 'no_route' : 'error';
        // 400/404 = no route, 429 = rate limit — neither means the aggregator is down.
        // Only real errors and timeouts count toward circuit breaker.
        if (!isNoRoute && !isHttp429) {
          limiter.recordFailure();
        }

        log.warn({ responseMs, status, error: errorMessage.slice(0, 120) }, `${id}: ${isTimeout ? 'timeout' : errorMessage.slice(0, 60)}`);

        await insertFetchLog({
          batchId, ts: new Date(), srcChain: route.src, dstChain: route.dst,
          asset: route.asset, amountTier: route.amountTier, source: id,
          bridge: null, status, responseMs, errorMessage, quoteCount: 0,
        }).catch(() => {});

        return [];
      }
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') quotes.push(...r.value);
  }

  return { quotes, bridgesSeen };
}
