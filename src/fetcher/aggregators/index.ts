import pRetry, { AbortError } from 'p-retry';
import type { NormalizedQuote, RouteKey, AggregatorId } from '../../types/index.js';
import type { Logger } from '../../lib/logger.js';
import { logger as rootLogger } from '../../lib/logger.js';
import { getAggregatorLimiter } from '../../lib/rate-limiter.js';
import { RateLimitError, NoRouteError } from '../../lib/errors.js';
import { insertFetchLog } from '../../db/queries.js';
import { withTimeout } from '../../lib/utils.js';
import { isSkipped, recordMiss, recordHit } from '../../lib/aggregator-skip.js';
import { aggregatorSupportsRoute } from '../../config/aggregator-support.js';
import { fetchLifi } from './lifi.js';
import { fetchRango } from './rango.js';
import { fetchBungee } from './bungee.js';
import { fetchRubic } from './rubic.js';
import { fetchSquid } from './squid.js';

/**
 * Network-call timeout — applied inside schedule() to the HTTP request only,
 * NOT to the queue wait. LI.FI can be slow on complex/new-chain routes, so keep
 * it generous. A call that hits this is failed (and not retried).
 */
const AGGREGATOR_TIMEOUT_MS = 30_000;

/**
 * p-retry config — applied to every aggregator call.
 * 429s are NOT retried inline (AbortError is thrown so the rate limiter can
 * handle the cooldown and the next cycle will be slower). Transient network
 * errors and 5xx responses retry twice with jitter.
 */
const RETRY_OPTIONS = {
  retries: 2,
  minTimeout: 500,
  maxTimeout: 4_000,
  factor: 2,
  randomize: true,
} as const;

// Rubic is queried only for routes that other aggregators can't handle:
//  - abstract, hyperliquid, berachain (LI.FI can be slow; Rubic adds coverage)
const RUBIC_FALLBACK_CHAINS = new Set<string>([
  'hyperliquid',
  'berachain',
  'abstract',
]);

function shouldUseRubic(route: RouteKey): boolean {
  return RUBIC_FALLBACK_CHAINS.has(route.src) || RUBIC_FALLBACK_CHAINS.has(route.dst);
}

export type AggregatorFetcher = (route: RouteKey, key: string) => Promise<NormalizedQuote[]>;

/**
 * When set, only these aggregators are called (Rubic filter still applies).
 * undefined = run all applicable aggregators.
 */
export type AggregatorSubset = readonly AggregatorId[] | undefined;

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
registerAggregator('rubic', (route, key) =>
  fetchRubic(route, key, {
    isFallbackOnlyRoute: RUBIC_FALLBACK_CHAINS.has(route.src) && RUBIC_FALLBACK_CHAINS.has(route.dst),
  })
);
registerAggregator('squid', fetchSquid);

const circuitBreakLogged = new Set<AggregatorId>();

export async function fetchAllAggregators(
  route: RouteKey,
  batchId: string,
  parentLog?: Logger,
  subset?: AggregatorSubset
): Promise<{ quotes: NormalizedQuote[]; bridgesSeen: Set<string> }> {
  const quotes: NormalizedQuote[] = [];
  const bridgesSeen = new Set<string>();
  const baseLog = parentLog ?? rootLogger;

  const allIds = Object.keys(aggregatorRegistry) as AggregatorId[];
  const ids = allIds.filter((id) => {
    if (subset && !subset.includes(id)) return false;
    if (id === 'rubic' && !shouldUseRubic(route)) return false;
    // #1: skip aggregators known not to support this route's chains (no queue, no call).
    if (!aggregatorSupportsRoute(id, route)) return false;
    return true;
  });

  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const log = baseLog.child({ aggregator: id });
      const limiter = getAggregatorLimiter(id);

      // Circuit breaker: skip aggregator if too many consecutive hard failures.
      if (limiter.isOpen()) {
        if (!circuitBreakLogged.has(id)) {
          log.warn(`${id} circuit breaker OPEN — skipping for cooldown`);
          circuitBreakLogged.add(id);
          setTimeout(() => circuitBreakLogged.delete(id), 60_000);
        }
        return [];
      }

      // Adaptive skip: this aggregator+route pair has returned no quotes
      // for several consecutive cycles — skip until the cooldown expires.
      if (isSkipped(id, route)) {
        log.debug(
          { src: route.src, dst: route.dst, asset: route.asset, amountTier: route.amountTier },
          `${id}: adaptive skip (consecutive no-route misses)`
        );
        return [];
      }

      const startMs = Date.now();

      try {
        // The 30s timeout bounds the NETWORK CALL only (it lives inside schedule).
        // Queue wait is NOT bounded — a job waits as long as the limiter needs
        // (e.g. during a 429 pause) with no queue-starvation timeout.
        // pRetry retries transient errors (network, 5xx); a 429 or a call timeout aborts.
        const result = await pRetry(
          () => limiter.schedule(async (key) => {
            try {
              return await withTimeout(aggregatorRegistry[id](route, key), AGGREGATOR_TIMEOUT_MS);
            } catch (callErr) {
              // A call that already ran the full 30s won't be saved by an immediate retry.
              if (callErr instanceof Error && callErr.message === 'timeout') {
                throw new AbortError('timeout');
              }
              throw callErr;
            }
          }),
          {
            ...RETRY_OPTIONS,
            onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
              if (error instanceof RateLimitError) {
                // Pass error.key so KeyedAdaptiveLimiter penalises only that key.
                limiter.on429(error.retryAfterMs, error.key || undefined);
                // AbortError stops p-retry — don't retry 429s inline.
                throw new AbortError(error.message);
              }
              if (error instanceof NoRouteError) {
                // Definitive no-route — don't waste retries. Prefix marks it for
                // the catch block; the reason is preserved for fetch_log.
                throw new AbortError(`no_route: ${error.reason}`);
              }
              // Transient errors: let p-retry handle the backoff.
              log.debug(
                { attempt: attemptNumber, retriesLeft, err: error.message.slice(0, 80) },
                `${id}: attempt ${attemptNumber} failed, ${retriesLeft} retries left`
              );
            },
          }
        );

        const responseMs = Date.now() - startMs;
        limiter.recordSuccess();

        for (const q of result) bridgesSeen.add(q.bridge);

        if (result.length > 0) {
          recordHit(id, route);
          log.debug({ responseMs, quotes: result.length, bridges: result.map((q) => q.bridge) }, `${id} OK`);
          await insertFetchLog({
            batchId, ts: new Date(), srcChain: route.src, dstChain: route.dst,
            asset: route.asset, amountTier: route.amountTier, source: id,
            bridge: null, status: 'success', responseMs, errorMessage: null,
            quoteCount: result.length,
          }).catch(() => {});
        } else {
          // Empty 200 = no route, not a success. Label it accurately. Adapters that
          // know the reason throw NoRouteError (handled below); a bare [] has none.
          recordMiss(id, route);
          log.debug({ responseMs }, `${id}: no route (empty)`);
          await insertFetchLog({
            batchId, ts: new Date(), srcChain: route.src, dstChain: route.dst,
            asset: route.asset, amountTier: route.amountTier, source: id,
            bridge: null, status: 'no_route', responseMs, errorMessage: 'no quote returned',
            quoteCount: 0,
          }).catch(() => {});
        }

        return result;

      } catch (err) {
        const responseMs = Date.now() - startMs;
        const isRateLimit = err instanceof RateLimitError ||
          (err instanceof AbortError && err.message.toLowerCase().includes('rate limit'));
        const rawMessage = err instanceof Error ? err.message : String(err);
        // NoRouteError travels through p-retry as an AbortError prefixed "no_route: ".
        const isNoRouteErr = err instanceof NoRouteError || rawMessage.startsWith('no_route: ');
        // Store the bare reason regardless of which form the error arrived in.
        const errorMessage = err instanceof NoRouteError
          ? err.reason
          : rawMessage.replace(/^no_route:\s*/, '');
        const lower = errorMessage.toLowerCase();
        const isTimeout = !isNoRouteErr && err instanceof Error && err.message === 'timeout';
        const isHttp400 = lower.includes('http 400') || lower.includes('http 404');
        const isNoRoute =
          !isTimeout &&
          !isRateLimit &&
          (isNoRouteErr ||
            isHttp400 ||
            lower.includes('none of the available routes') ||
            lower.includes('no route'));

        const status = isTimeout
          ? 'timeout'
          : isRateLimit
            ? 'rate_limited'
            : isNoRoute
              ? 'no_route'
              : 'error';

        // Only real errors advance the circuit breaker — not 429s or no-routes.
        if (!isNoRoute && !isRateLimit) {
          limiter.recordFailure();
        }

        // #2: adaptive skip — no-route AND real timeouts count as a miss, so a route
        // that persistently times out self-suppresses after the consecutive threshold.
        if (isNoRoute || isTimeout) {
          recordMiss(id, route);
        }

        // no_route is expected (unsupported chain / low liquidity) — debug, not warn.
        const logFields = { responseMs, status, error: errorMessage.slice(0, 120) };
        const logMsg = `${id}: ${isTimeout ? 'timeout' : errorMessage.slice(0, 60)}`;
        if (isNoRoute) {
          log.debug(logFields, logMsg);
        } else {
          log.warn(logFields, logMsg);
        }

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
