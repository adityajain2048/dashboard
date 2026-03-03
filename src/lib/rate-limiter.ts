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
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
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
    this.tokens = this.burstLimit;
    this.refillRate = maxPerMinute / 60_000;
    this.lastRefill = Date.now();
    this.circuitThreshold = opts?.circuitThreshold ?? 10;
    this.circuitCooldownMs = opts?.circuitCooldownMs ?? 60_000;
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

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
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
