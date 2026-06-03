/**
 * Adaptive rate-limiting infrastructure.
 *
 * Two classes implement IAdaptiveLimiter:
 *
 *   AdaptiveLimiter        — single Bottleneck, single API key (or no key).
 *   KeyedAdaptiveLimiter   — N AdaptiveLimiter instances, one per API key.
 *                            Selects the least-loaded key that isn't paused.
 *                            A 429 on key k penalises k only; other keys keep running.
 *
 * All fetchers receive the selected key via `schedule((key) => fetchFoo(route, key))`.
 * Fetchers that don't use keys ignore the parameter.
 *
 * LI.FI uses KeyedAdaptiveLimiter with 3 keys (200 rpm each = 600 rpm total).
 * Every other aggregator/bridge uses KeyedAdaptiveLimiter with a single '' key
 * — identical behaviour to the old single-limiter design, future-proof for multi-key.
 */
import Bottleneck from 'bottleneck';
import type { AggregatorId } from '../types/index.js';
import { logger } from './logger.js';
import { RateLimitError } from './errors.js';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface IAdaptiveLimiter {
  /** Schedule fn through the rate limiter. The selected API key is passed to fn. */
  schedule<T>(fn: (key: string) => Promise<T>): Promise<T>;
  /**
   * Call on 429.  Pass `key` if you know which API key triggered it so only
   * that key's limiter is penalised; omit to penalise all keys.
   */
  on429(retryAfterMs: number, key?: string): void;
  /** No-op on KeyedAdaptiveLimiter — success tracking happens inside schedule(). */
  recordSuccess(): void;
  /** No-op on KeyedAdaptiveLimiter — failure tracking happens inside schedule(). */
  recordFailure(): void;
  /** True while the circuit breaker is open (too many consecutive hard failures). */
  isOpen(): boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface AdaptiveLimiterConfig {
  maxConcurrent: number;
  /** ms between requests for THIS limiter (per-key when used inside KeyedAdaptiveLimiter). */
  initialMinTime: number;
  backoffFactor: number;
  maxMinTime: number;
  recoveryFactor: number;
  minMinTime: number;
  recoveryThreshold: number;
  circuitThreshold: number;
  circuitCooldownMs: number;
  /** Max queued jobs (-1 = unlimited). */
  highWater: number;
}

// ─── AdaptiveLimiter ─────────────────────────────────────────────────────────

export class AdaptiveLimiter implements IAdaptiveLimiter {
  private readonly bottleneck: Bottleneck;
  private currentMinTime: number;
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  /** While Date.now() < this, further 429s are the same event and are ignored. */
  private pausedUntil = 0;

  constructor(
    private readonly name: string,
    private readonly config: AdaptiveLimiterConfig,
    /** The API key string passed to fn inside schedule(). '' for anonymous. */
    private readonly key: string = '',
  ) {
    this.currentMinTime = config.initialMinTime;
    this.bottleneck = new Bottleneck({
      maxConcurrent: config.maxConcurrent,
      minTime: config.initialMinTime,
      highWater: config.highWater === -1 ? undefined : config.highWater,
      strategy: Bottleneck.strategy.OVERFLOW,
      reservoir: 100_000,
    });
  }

  /** Passes `this.key` into fn when Bottleneck grants a slot. */
  schedule<T>(fn: (key: string) => Promise<T>): Promise<T> {
    return this.bottleneck.schedule(() => fn(this.key));
  }

  /** Number of jobs currently waiting for a Bottleneck slot. */
  queued(): number {
    return this.bottleneck.queued();
  }

  on429(retryAfterMs: number): void {
    // Coalesce a burst of concurrent 429s into ONE backoff. Many in-flight
    // requests on the same key get 429'd together; without this guard each one
    // multiplies the backoff, collapsing the rate geometrically (e.g. LI.FI
    // 0.66→0.13 req/s in one second from 5 simultaneous 429s). The floor keeps
    // the dedup window sane when retryAfterMs is small.
    const now = Date.now();
    if (now < this.pausedUntil) return;
    this.pausedUntil = now + Math.max(retryAfterMs, 2_000);

    void this.bottleneck.currentReservoir().then((current) => {
      if (current !== null && current > 0) {
        void this.bottleneck.incrementReservoir(-current);
      }
    });

    const prevRps = (1000 / this.currentMinTime).toFixed(2);
    this.currentMinTime = Math.min(
      this.currentMinTime * this.config.backoffFactor,
      this.config.maxMinTime,
    );
    const newRps = (1000 / this.currentMinTime).toFixed(2);

    logger.warn(
      { limiter: this.name, pauseSec: Math.ceil(retryAfterMs / 1000), prevRps: Number(prevRps), newRps: Number(newRps) },
      `${this.name}: 429 — pausing ${Math.ceil(retryAfterMs / 1000)}s, rate ${prevRps}→${newRps} req/s`,
    );

    this.consecutiveSuccesses = 0;

    setTimeout(() => {
      this.bottleneck.updateSettings({ minTime: this.currentMinTime });
      void this.bottleneck.incrementReservoir(100_000);
      logger.info(
        { limiter: this.name, rps: Number(newRps) },
        `${this.name}: cooldown over — resuming at ${newRps} req/s`,
      );
    }, retryAfterMs);
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;
    if (this.consecutiveSuccesses >= this.config.recoveryThreshold) {
      this.consecutiveSuccesses = 0;
      const prev = this.currentMinTime;
      this.currentMinTime = Math.max(
        this.currentMinTime * this.config.recoveryFactor,
        this.config.minMinTime,
      );
      if (this.currentMinTime < prev - 0.5) {
        this.bottleneck.updateSettings({ minTime: this.currentMinTime });
        logger.info(
          { limiter: this.name, rps: Number((1000 / this.currentMinTime).toFixed(2)) },
          `${this.name}: rate recovering → ${(1000 / this.currentMinTime).toFixed(2)} req/s`,
        );
      }
    }
  }

  recordFailure(): void {
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures++;
    if (this.consecutiveFailures === this.config.circuitThreshold) {
      this.circuitOpenUntil = Date.now() + this.config.circuitCooldownMs;
      logger.warn(
        { limiter: this.name, cooldownMs: this.config.circuitCooldownMs },
        `${this.name}: circuit breaker opened — too many consecutive failures`,
      );
    }
  }

  isOpen(): boolean {
    if (this.consecutiveFailures < this.config.circuitThreshold) return false;
    if (Date.now() > this.circuitOpenUntil) {
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  currentRps(): number {
    return 1000 / this.currentMinTime;
  }
}

// ─── KeyedAdaptiveLimiter ─────────────────────────────────────────────────────

/**
 * Wraps N AdaptiveLimiter instances — one per API key.
 *
 * Key selection at schedule() time:
 *   1. Filter to keys whose cooldown has expired.
 *   2. Among available keys, prefer the one with the fewest queued jobs.
 *   3. If ALL keys are in cooldown, pick the soonest-expiry key (it will queue
 *      inside Bottleneck until the reservoir is restored).
 *
 * on429(ms, key): penalises only that key's limiter.
 * on429(ms):     penalises all keys (used when the key is unknown).
 *
 * recordSuccess / recordFailure are no-ops — tracked per key inside schedule().
 * isOpen() returns true only when ALL per-key limiters are open simultaneously.
 */
export class KeyedAdaptiveLimiter implements IAdaptiveLimiter {
  private readonly keyLimiters: Map<string, AdaptiveLimiter>;
  private readonly keyPausedUntil = new Map<string, number>();

  constructor(
    private readonly name: string,
    keys: readonly string[],
    config: AdaptiveLimiterConfig,
  ) {
    this.keyLimiters = new Map();
    for (const key of keys) {
      const label = key ? key.slice(0, 8) : 'anon';
      this.keyLimiters.set(key, new AdaptiveLimiter(`${name}:${label}`, config, key));
    }
  }

  private selectKey(): string {
    const now = Date.now();
    const available = [...this.keyLimiters.keys()]
      .filter((k) => (this.keyPausedUntil.get(k) ?? 0) <= now);

    if (available.length === 0) {
      // All paused — pick soonest-expiry (will queue inside that Bottleneck)
      return [...this.keyPausedUntil.entries()]
        .sort(([, a], [, b]) => a - b)[0]![0];
    }

    // Prefer least-loaded key (Bottleneck.queued() is synchronous)
    return available.reduce((best, k) => {
      const bq = this.keyLimiters.get(best)!.queued();
      const kq = this.keyLimiters.get(k)!.queued();
      return kq < bq ? k : best;
    });
  }

  schedule<T>(fn: (key: string) => Promise<T>): Promise<T> {
    const key = this.selectKey();
    const limiter = this.keyLimiters.get(key)!;
    return limiter
      .schedule(fn)
      .then((result) => {
        limiter.recordSuccess();
        return result;
      })
      .catch((err: unknown) => {
        if (!(err instanceof RateLimitError)) limiter.recordFailure();
        throw err;
      });
  }

  on429(retryAfterMs: number, key?: string): void {
    const targets =
      key && this.keyLimiters.has(key)
        ? [key]
        : [...this.keyLimiters.keys()];
    for (const k of targets) {
      this.keyPausedUntil.set(k, Date.now() + retryAfterMs);
      this.keyLimiters.get(k)!.on429(retryAfterMs);
      setTimeout(() => this.keyPausedUntil.delete(k), retryAfterMs);
    }
  }

  /** No-op — per-key success tracking happens inside schedule(). */
  recordSuccess(): void {}
  /** No-op — per-key failure tracking happens inside schedule(). */
  recordFailure(): void {}

  /** True only when every per-key limiter's circuit breaker is open. */
  isOpen(): boolean {
    return [...this.keyLimiters.values()].every((l) => l.isOpen());
  }
}

// ─── Per-aggregator configs ───────────────────────────────────────────────────

/**
 * LI.FI: 3 keys × 200 rpm = 600 rpm total.
 * Per-key config: 200 rpm = 3.33 rps → minTime 300ms.
 * (KeyedAdaptiveLimiter creates one Bottleneck per key, so minTime is per-key.)
 */
const LIFI_PER_KEY_CONFIG: AdaptiveLimiterConfig = {
  maxConcurrent:     8,
  initialMinTime:    300,   // 3.33 rps per key → ~10 rps across 3 keys
  backoffFactor:     1.5,
  maxMinTime:        30_000,
  recoveryFactor:    0.9,
  minMinTime:        300,   // floor = 200 rpm per key
  recoveryThreshold: 100,
  circuitThreshold:  50,
  circuitCooldownMs: 60_000,
  highWater:         -1,
};

const AGGREGATOR_CONFIGS: Record<AggregatorId, AdaptiveLimiterConfig> = {
  lifi: LIFI_PER_KEY_CONFIG, // used as per-key config inside KeyedAdaptiveLimiter

  // Rango: free tier ~10 rpm (0.17 rps → 6000ms). Conservative backoff.
  rango: {
    maxConcurrent:     1,
    initialMinTime:    6_000,
    backoffFactor:     2.0,
    maxMinTime:        600_000,
    recoveryFactor:    0.85,
    minMinTime:        6_000,
    recoveryThreshold: 20,
    circuitThreshold:  8,
    circuitCooldownMs: 60_000,
    highWater:         -1,
  },

  // Bungee: ~100 rpm (1.67 rps → 600ms).
  bungee: {
    maxConcurrent:     4,
    initialMinTime:    600,
    backoffFactor:     1.5,
    maxMinTime:        60_000,
    recoveryFactor:    0.9,
    minMinTime:        600,
    recoveryThreshold: 50,
    circuitThreshold:  15,
    circuitCooldownMs: 60_000,
    highWater:         -1,
  },

  // Rubic: ~12 rpm (0.2 rps → 5000ms). Fallback chains only.
  rubic: {
    maxConcurrent:     1,
    initialMinTime:    5_000,
    backoffFactor:     2.0,
    maxMinTime:        300_000,
    recoveryFactor:    0.85,
    minMinTime:        5_000,
    recoveryThreshold: 20,
    circuitThreshold:  10,
    circuitCooldownMs: 60_000,
    highWater:         -1,
  },

  // Squid: burst-tested at 10 RPS for 30s.
  // Result: 85.9% ok, 7.4% 429, p50=800ms, retry-after 0.016–0.314s (fractional seconds).
  // Conservative config: maxConcurrent=10 caps in-flight. At p50 (800ms) that yields
  // 10/0.8 = 12.5 RPS but minTime=100ms limits launches to 10 RPS. When responses
  // slow to p90 (1429ms) the cap binds: 10/1.429 ≈ 7 RPS — averaging ~8 RPS sustained.
  squid: {
    maxConcurrent:     10,    // conservative cap — ~8 RPS effective at avg latency
    initialMinTime:    100,   // 10 RPS launch rate
    backoffFactor:     1.5,
    maxMinTime:        30_000,
    recoveryFactor:    0.9,
    minMinTime:        100,   // hold floor at 10 RPS; no adaptive acceleration
    recoveryThreshold: 50,
    circuitThreshold:  20,
    circuitCooldownMs: 60_000,
    highWater:         -1,
  },
};

// ─── Per-bridge configs ───────────────────────────────────────────────────────

const BRIDGE_DEFAULT_CONFIG: AdaptiveLimiterConfig = {
  maxConcurrent:     2,
  initialMinTime:    333,   // ~3 rps
  backoffFactor:     2.0,
  maxMinTime:        60_000,
  recoveryFactor:    0.85,
  minMinTime:        333,
  recoveryThreshold: 30,
  circuitThreshold:  10,
  circuitCooldownMs: 60_000,
  highWater:         -1,
};

const BRIDGE_CONFIGS: Partial<Record<string, AdaptiveLimiterConfig>> = {
  cbridge:   { ...BRIDGE_DEFAULT_CONFIG, initialMinTime: 1_000, minMinTime: 1_000 },
  thorchain: { ...BRIDGE_DEFAULT_CONFIG, maxConcurrent: 1, initialMinTime: 1_000, minMinTime: 1_000 },
};

// ─── LI.FI key list ───────────────────────────────────────────────────────────

// Resolved once at module init. The KeyedAdaptiveLimiter for lifi uses one
// AdaptiveLimiter per key so a 429 on key-A never pauses key-B or key-C.
const LIFI_API_KEYS: readonly string[] = (
  [process.env.LIFI_API_KEY_1, process.env.LIFI_API_KEY_2, process.env.LIFI_API_KEY_3]
    .filter(Boolean) as string[]
);

// ─── Limiter registries ───────────────────────────────────────────────────────

const aggregatorLimiters = new Map<AggregatorId, IAdaptiveLimiter>();

export function getAggregatorLimiter(id: AggregatorId): IAdaptiveLimiter {
  let limiter = aggregatorLimiters.get(id);
  if (!limiter) {
    const cfg = AGGREGATOR_CONFIGS[id];
    const keys = id === 'lifi'
      ? (LIFI_API_KEYS.length > 0 ? LIFI_API_KEYS : [''])
      : [''];
    limiter = new KeyedAdaptiveLimiter(id, keys, cfg);
    aggregatorLimiters.set(id, limiter);
    const rps = (1000 / cfg.initialMinTime).toFixed(2);
    logger.info(
      { aggregator: id, rps: Number(rps), keyCount: keys.length },
      `${id}: adaptive limiter — ${keys.length} key(s) @ ${rps} rps/key`,
    );
  }
  return limiter;
}

const bridgeLimiters = new Map<string, IAdaptiveLimiter>();

export function getBridgeLimiter(id: string): IAdaptiveLimiter {
  let limiter = bridgeLimiters.get(id);
  if (!limiter) {
    const cfg = BRIDGE_CONFIGS[id] ?? BRIDGE_DEFAULT_CONFIG;
    limiter = new KeyedAdaptiveLimiter(id, [''], cfg);
    bridgeLimiters.set(id, limiter);
    logger.info(
      { bridge: id, rps: (1000 / cfg.initialMinTime).toFixed(2) },
      `${id}: adaptive limiter initialised at ${(1000 / cfg.initialMinTime).toFixed(2)} req/s`,
    );
  }
  return limiter;
}
