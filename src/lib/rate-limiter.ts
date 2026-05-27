import type { AggregatorId } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Token bucket rate limiter with circuit breaker.
 * - acquire() blocks until a token is available.
 * - recordFailure()/recordSuccess() track consecutive fails.
 * - After CIRCUIT_BREAK_THRESHOLD consecutive failures, isOpen() returns true
 *   and the aggregator is skipped until the cooldown expires.
 */
export class RateLimiter {
  private readonly maxTokens: number;
  private readonly burstLimit: number;

  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private readonly circuitThreshold: number;
  private readonly circuitCooldownMs: number;

  constructor(
    maxPerMinute: number,
    opts?: { burst?: number; circuitThreshold?: number; circuitCooldownMs?: number }
  ) {
    this.maxTokens = maxPerMinute;
    this.burstLimit = opts?.burst ?? Math.min(5, maxPerMinute);
    this.circuitThreshold = opts?.circuitThreshold ?? 10;
    this.circuitCooldownMs = opts?.circuitCooldownMs ?? 60_000;
    // Pre-load burst: set nextSlotMs back by (burst - 1) intervals so the first
    // `burst` callers can fire without waiting.
    const intervalMs = 60_000 / maxPerMinute;
    this.nextSlotMs = Date.now() - (this.burstLimit - 1) * intervalMs;
  }

  isOpen(): boolean {
    if (this.consecutiveFailures < this.circuitThreshold) return false;
    if (Date.now() > this.circuitOpenUntil) {
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures === this.circuitThreshold) {
      this.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Serialized acquire: each caller is assigned a unique time slot so concurrent
   * callers don't all fire simultaneously (the thundering-herd bug in a naive
   * token-bucket when many waiters share the same computed waitMs).
   *
   * nextSlotMs tracks the earliest time the next caller may fire.
   * Burst capacity is pre-loaded by setting nextSlotMs back by burstLimit intervals.
   */
  private nextSlotMs: number;

  async acquire(): Promise<void> {
    const intervalMs = 60_000 / this.maxTokens; // ms between requests at steady-state
    const now = Date.now();

    // Claim a slot atomically (JS is single-threaded, so no real race here)
    if (this.nextSlotMs <= now) {
      // Slot is in the past — fire immediately and reset to now
      this.nextSlotMs = now + intervalMs;
      return;
    }

    // Slot is in the future — queue this caller behind the last one
    const mySlot = this.nextSlotMs;
    this.nextSlotMs += intervalMs;
    const waitMs = mySlot - now;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }
}

const RATE_LIMITS: Record<AggregatorId, { rpm: number; burst: number; circuitThreshold: number }> = {
  // LI.FI: 3 keys × 200 rpm = 600 rpm. High threshold — a few slow routes on new chains
  // should never trip the circuit for the whole cycle.
  lifi:   { rpm: 400, burst: 8,  circuitThreshold: 50 },
  // Rango free tier is very limited (~15-20 req/min per IP). Keep it low to avoid 429 loops.
  // Circuit opens after 8 consecutive failures; unsupported chains are now excluded upstream.
  rango:  { rpm: 10,  burst: 1,  circuitThreshold: 8  },
  // Bungee: burst=2 prevents 429 floods on startup; 429s excluded from circuit failures anyway.
  bungee: { rpm: 40,  burst: 2,  circuitThreshold: 15 },
  rubic:  { rpm: 12,  burst: 1,  circuitThreshold: 10 },
  // Squid: integrator tier allows ~1 req/sec observed; burst=1 forces sequential dispatch.
  squid:  { rpm: 30,  burst: 1,  circuitThreshold: 20 },
};

const limiters = new Map<AggregatorId, RateLimiter>();

export function getAggregatorLimiter(id: AggregatorId): RateLimiter {
  let limiter = limiters.get(id);
  if (!limiter) {
    const cfg = RATE_LIMITS[id] ?? { rpm: 30, burst: 3, circuitThreshold: 10 };
    limiter = new RateLimiter(cfg.rpm, { burst: cfg.burst, circuitThreshold: cfg.circuitThreshold });
    limiters.set(id, limiter);
    logger.info({ aggregator: id, rpm: cfg.rpm, burst: cfg.burst }, 'Rate limiter initialized');
  }
  return limiter;
}
