import { describe, it, expect } from 'vitest';
import { AdaptiveLimiter, type AdaptiveLimiterConfig } from '../../src/lib/rate-limiter.js';

const CONFIG: AdaptiveLimiterConfig = {
  maxConcurrent: 8,
  initialMinTime: 300, // 1000/300 ≈ 3.33 rps
  backoffFactor: 1.5,
  maxMinTime: 30_000,
  recoveryFactor: 0.9,
  minMinTime: 300,
  recoveryThreshold: 100,
  circuitThreshold: 50,
  circuitCooldownMs: 60_000,
  highWater: -1,
};

describe('AdaptiveLimiter.on429 coalescing', () => {
  it('applies a single backoff for a burst of concurrent 429s on the same key', () => {
    const limiter = new AdaptiveLimiter('test', CONFIG);
    const before = limiter.currentRps(); // ≈ 3.33

    // Simulate 5 in-flight requests all getting 429'd in the same instant.
    // Use a long retry window so the resume timer doesn't fire during the test.
    for (let i = 0; i < 5; i++) limiter.on429(60_000);

    const after = limiter.currentRps();

    // Exactly one backoff: 300 * 1.5 = 450 → ≈ 2.22 rps.
    // The old per-request behaviour would compound 5×: 300 * 1.5^5 → ≈ 0.44 rps.
    expect(after).toBeCloseTo(before / CONFIG.backoffFactor, 5);
    expect(after).toBeGreaterThan(2);
  });
});
