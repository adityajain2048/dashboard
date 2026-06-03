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
