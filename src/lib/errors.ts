/**
 * RateLimitError — thrown by any fetcher when it receives a 429 response.
 * The coordinator (aggregators/index.ts, bridges/index.ts) catches this,
 * calls limiter.on429() to reduce the adaptive rate, then aborts the
 * current retry loop so the limiter can recover before the next cycle.
 *
 * `key` carries the specific API key that was rate-limited (e.g. LI.FI
 * key rotation). An empty string means the error is anonymous / key-agnostic.
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number;
  /** The API key that triggered the 429, or '' for keyless/anonymous errors. */
  readonly key: string;

  constructor(
    retryAfterMs: number,
    optsOrSource?: string | { source?: string; key?: string },
  ) {
    const source = typeof optsOrSource === 'string' ? optsOrSource : optsOrSource?.source;
    const key    = typeof optsOrSource === 'object'  ? (optsOrSource.key ?? '') : '';
    super(`${source ? `${source}: ` : ''}rate limited — retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
    this.key = key;
  }
}

/**
 * NoRouteError — thrown by a fetcher when the upstream DEFINITIVELY has no route
 * for this pair (HTTP 400/404, a 500 "Low liquidity", an unsupported chain, etc.).
 * Carries the reason so the coordinator can persist WHY a task was empty instead
 * of silently returning []. Treated as a non-retryable `no_route`: it does NOT
 * advance the circuit breaker and is not retried by p-retry.
 */
export class NoRouteError extends Error {
  /** The bare reason without the `<source>: ` prefix, for storage in fetch_log. */
  readonly reason: string;

  constructor(reason: string, source?: string) {
    super(`${source ? `${source}: ` : ''}${reason}`);
    this.name = 'NoRouteError';
    this.reason = reason;
  }
}
