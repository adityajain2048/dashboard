/**
 * RateLimitError — thrown by any fetcher when it receives a 429 response.
 * The coordinator (aggregators/index.ts, bridges/index.ts) catches this,
 * calls limiter.on429() to reduce the adaptive rate, then aborts the
 * current retry loop so the limiter can recover before the next cycle.
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, source?: string) {
    super(`${source ? `${source}: ` : ''}rate limited — retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}
