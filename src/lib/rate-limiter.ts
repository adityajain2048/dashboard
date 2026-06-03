/**
 * AdaptiveLimiter — Bottleneck-backed rate limiter with self-correcting throughput.
 *
 * Behaviour on 429:
 *   1. Drains Bottleneck's reservoir to 0, pausing all queued jobs for `retryAfterMs`.
 *   2. Multiplies minTime by `backoffFactor` (permanently reduces rate).
 *   3. After the cooldown, restores the reservoir and logs the new effective rate.
 *
 * Recovery:
 *   After `recoveryThreshold` consecutive successes, multiplies minTime by `recoveryFactor`
 *   (< 1.0) to gradually creep the rate back up, but never past `minMinTime` (the floor).
 *
 * Circuit breaker:
 *   After `circuitThreshold` consecutive non-429/non-timeout failures, isOpen() returns
 *   true for `circuitCooldownMs`. This protects against APIs that are fully down.
 */
import Bottleneck from 'bottleneck';
import type { AggregatorId } from '../types/index.js';
import { logger } from './logger.js';

// ─── Config ──────────────────────────────────────────────────────────────────

export interface AdaptiveLimiterConfig {
  /** Max concurrent in-flight requests. */
  maxConcurrent: number;
  /** Initial ms between requests (= 1000 / rps). */
  initialMinTime: number;

  // Adaptive backoff on 429 ─────────────────────────────────────────────────
  /** Multiply minTime by this on each 429 (e.g. 1.5 = 33 % rate cut). */
  backoffFactor: number;
  /** Never space requests further apart than this (ms). Safety valve against runaway backoff. */
  maxMinTime: number;

  // Gradual recovery after sustained success ────────────────────────────────
  /** Multiply minTime by this on each recovery step (must be < 1.0). */
  recoveryFactor: number;
  /** Never space requests closer than this (ms). Prevents recovering past the original rate. */
  minMinTime: number;
  /** Consecutive successes required before one recovery step. */
  recoveryThreshold: number;

  // Circuit breaker ─────────────────────────────────────────────────────────
  /** Consecutive non-transient failures before opening circuit. */
  circuitThreshold: number;
  /** How long the circuit stays open (ms). */
  circuitCooldownMs: number;

  // Bottleneck queue ────────────────────────────────────────────────────────
  /**
   * Max queued jobs before Bottleneck drops new ones (OVERFLOW strategy).
   * -1 = unlimited. Set high for sweep-heavy aggregators.
   */
  highWater: number;
}

// ─── AdaptiveLimiter ─────────────────────────────────────────────────────────

export class AdaptiveLimiter {
  private readonly bottleneck: Bottleneck;
  private currentMinTime: number;
  private consecutiveSuccesses = 0;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  constructor(
    private readonly name: string,
    private readonly config: AdaptiveLimiterConfig,
  ) {
    this.currentMinTime = config.initialMinTime;
    this.bottleneck = new Bottleneck({
      maxConcurrent: config.maxConcurrent,
      minTime: config.initialMinTime,
      highWater: config.highWater === -1 ? undefined : config.highWater,
      strategy: Bottleneck.strategy.OVERFLOW,
      // Large reservoir — acts as an on/off switch during 429 cooldowns.
      // No reservoirRefreshInterval so we control restore timing manually.
      reservoir: 100_000,
    });
  }

  /** Schedule a job through Bottleneck. Rate limiting and pause are handled internally. */
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.bottleneck.schedule(fn);
  }

  /**
   * Call when a 429 response is received.
   * Drains the Bottleneck reservoir (pausing all queued jobs) and permanently
   * reduces the steady-state rate by backoffFactor.
   */
  on429(retryAfterMs: number): void {
    // Drain reservoir → all waiting schedule() calls block until restored.
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
      {
        limiter: this.name,
        pauseSec: Math.ceil(retryAfterMs / 1000),
        prevRps: Number(prevRps),
        newRps: Number(newRps),
        newMinTimeMs: Math.round(this.currentMinTime),
      },
      `${this.name}: 429 — pausing ${Math.ceil(retryAfterMs / 1000)}s, rate reduced ${prevRps}→${newRps} req/s`,
    );

    this.consecutiveSuccesses = 0;

    // After cooldown: apply new minTime and restore the reservoir.
    setTimeout(() => {
      this.bottleneck.updateSettings({ minTime: this.currentMinTime });
      void this.bottleneck.incrementReservoir(100_000);
      logger.info(
        { limiter: this.name, rps: Number(newRps) },
        `${this.name}: cooldown over — resuming at ${newRps} req/s`,
      );
    }, retryAfterMs);
  }

  /**
   * Call on each successful response.
   * After `recoveryThreshold` consecutive successes, nudges the rate back up
   * by recoveryFactor, down to the `minMinTime` floor.
   */
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

  /** Call on a real (non-transient, non-429) failure to advance the circuit breaker. */
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

  /** Returns true while the circuit breaker is open; auto-resets after cooldown. */
  isOpen(): boolean {
    if (this.consecutiveFailures < this.config.circuitThreshold) return false;
    if (Date.now() > this.circuitOpenUntil) {
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  /** Current effective rate in requests/second. */
  currentRps(): number {
    return 1000 / this.currentMinTime;
  }
}

// ─── Per-aggregator config ────────────────────────────────────────────────────

const AGGREGATOR_CONFIGS: Record<AggregatorId, AdaptiveLimiterConfig> = {
  // LI.FI: 3 keys × 200 rpm = 600 rpm capacity (~10 rps).
  // initialMinTime = 100ms (10 rps). Floor = 100ms so we never go faster.
  // High circuit threshold — a few slow/new-chain errors shouldn't trip LI.FI for the whole cycle.
  lifi: {
    maxConcurrent:     8,
    initialMinTime:    100,
    backoffFactor:     1.5,
    maxMinTime:        30_000,
    recoveryFactor:    0.9,
    minMinTime:        100,
    recoveryThreshold: 100,
    circuitThreshold:  50,
    circuitCooldownMs: 60_000,
    highWater:         -1,
  },

  // Rango: free-tier is ~10 rpm (~0.17 rps → 6000ms between requests).
  // Conservative; aggressive backoff and fast recovery if it starts working.
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

  // Bungee: ~100 rpm (1.67 rps → 600ms). Moderate backoff.
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

  // Rubic: ~12 rpm (0.2 rps → 5000ms). Rarely used (fallback chains only).
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

  // Squid: 720 rpm confirmed safe (12 rps → 83ms). Large queue for cold-start sweep.
  squid: {
    maxConcurrent:     24,
    initialMinTime:    83,
    backoffFactor:     1.5,
    maxMinTime:        30_000,
    recoveryFactor:    0.9,
    minMinTime:        83,
    recoveryThreshold: 200,
    circuitThreshold:  20,
    circuitCooldownMs: 60_000,
    highWater:         -1,
  },
};

// ─── Per-bridge config ────────────────────────────────────────────────────────

/**
 * Default config for direct bridge fetchers.
 * Most bridge APIs are undocumented but generous; start at 3 rps and back off if needed.
 */
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

/** Per-bridge overrides for bridges with known tighter limits. */
const BRIDGE_CONFIGS: Partial<Record<string, AdaptiveLimiterConfig>> = {
  // cBridge has known rate limits on their public API — be conservative.
  cbridge: { ...BRIDGE_DEFAULT_CONFIG, initialMinTime: 1_000, minMinTime: 1_000 },
  // THORChain public node is shared; be polite.
  thorchain: { ...BRIDGE_DEFAULT_CONFIG, maxConcurrent: 1, initialMinTime: 1_000, minMinTime: 1_000 },
};

// ─── Limiter registries ───────────────────────────────────────────────────────

const aggregatorLimiters = new Map<AggregatorId, AdaptiveLimiter>();

export function getAggregatorLimiter(id: AggregatorId): AdaptiveLimiter {
  let limiter = aggregatorLimiters.get(id);
  if (!limiter) {
    const cfg = AGGREGATOR_CONFIGS[id];
    limiter = new AdaptiveLimiter(id, cfg);
    aggregatorLimiters.set(id, limiter);
    logger.info(
      { aggregator: id, rps: (1000 / cfg.initialMinTime).toFixed(2), maxConcurrent: cfg.maxConcurrent },
      `${id}: adaptive rate limiter initialised at ${(1000 / cfg.initialMinTime).toFixed(2)} req/s`,
    );
  }
  return limiter;
}

const bridgeLimiters = new Map<string, AdaptiveLimiter>();

export function getBridgeLimiter(id: string): AdaptiveLimiter {
  let limiter = bridgeLimiters.get(id);
  if (!limiter) {
    const cfg = BRIDGE_CONFIGS[id] ?? BRIDGE_DEFAULT_CONFIG;
    limiter = new AdaptiveLimiter(id, cfg);
    bridgeLimiters.set(id, limiter);
    logger.info(
      { bridge: id, rps: (1000 / cfg.initialMinTime).toFixed(2), maxConcurrent: cfg.maxConcurrent },
      `${id}: adaptive rate limiter initialised at ${(1000 / cfg.initialMinTime).toFixed(2)} req/s`,
    );
  }
  return limiter;
}
