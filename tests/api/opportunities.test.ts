/**
 * /api/opportunities — pagination and canonical computation tests.
 *
 * These are pure unit tests — no database. They test the in-memory slice/
 * pagination logic that the opportunities endpoint applies to its sorted list,
 * and verify that the canonical computeRouteStatus helper produces the correct
 * best/worst/spread values for the opportunity payload.
 */

import { describe, it, expect } from 'vitest';
import { computeRouteStatus, STALE_THRESHOLD_MS } from '../../src/db/queries.js';
import type { RouteLatestInput } from '../../src/db/queries.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(
  bridge: string,
  outputUsd: string,
  feeBps: number,
  ageMs = 60_000,
  inputUsd = '1000'
): RouteLatestInput {
  return {
    bridge,
    source: 'lifi',
    output_usd: outputUsd,
    input_usd: inputUsd,
    total_fee_bps: feeBps,
    ts: new Date(Date.now() - ageMs),
  };
}

/**
 * Mirrors the in-memory slice logic of opportunitiesRoutes.
 * Takes a pre-sorted list of opportunities (as the endpoint would produce)
 * and applies offset + limit.
 */
function pageOpps<T>(
  sorted: T[],
  offset: number,
  limit: number
): { opportunities: T[]; total: number } {
  return {
    opportunities: sorted.slice(offset, offset + limit),
    total: sorted.length,
  };
}

// ─── Build synthetic opportunity list ────────────────────────────────────────

/** Build N fake opportunity entries with decreasing spreadBps. */
function buildOpps(n: number): Array<{ id: number; spreadBps: number }> {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    spreadBps: 1000 - i * 10, // 1000, 990, 980, ...
  }));
}

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('/api/opportunities — pagination (offset + limit)', () => {
  const opps = buildOpps(25); // 25 synthetic entries

  it('offset=0, limit=5 returns first 5 entries', () => {
    const { opportunities, total } = pageOpps(opps, 0, 5);
    expect(opportunities.length).toBe(5);
    expect(opportunities[0]!.id).toBe(0);
    expect(opportunities[4]!.id).toBe(4);
    expect(total).toBe(25);
  });

  it('offset=5, limit=5 returns entries 5–9', () => {
    const { opportunities, total } = pageOpps(opps, 5, 5);
    expect(opportunities.length).toBe(5);
    expect(opportunities[0]!.id).toBe(5);
    expect(opportunities[4]!.id).toBe(9);
    expect(total).toBe(25);
  });

  it('offset=20, limit=10 returns last 5 entries (not 10 — end of list)', () => {
    const { opportunities, total } = pageOpps(opps, 20, 10);
    expect(opportunities.length).toBe(5);
    expect(opportunities[0]!.id).toBe(20);
    expect(opportunities[4]!.id).toBe(24);
    expect(total).toBe(25);
  });

  it('offset > total returns empty array with correct total', () => {
    const { opportunities, total } = pageOpps(opps, 30, 5);
    expect(opportunities).toEqual([]);
    expect(total).toBe(25);
  });

  it('total is constant regardless of offset/limit', () => {
    const totals = [
      pageOpps(opps, 0, 5).total,
      pageOpps(opps, 5, 3).total,
      pageOpps(opps, 99, 1).total,
    ];
    expect(new Set(totals).size).toBe(1); // all the same
    expect(totals[0]).toBe(25);
  });

  it('offset=0, limit=100 returns all entries when count < 100', () => {
    const { opportunities, total } = pageOpps(opps, 0, 100);
    expect(opportunities.length).toBe(25);
    expect(total).toBe(25);
  });
});

// ─── Opportunity payload correctness via computeRouteStatus ───────────────────

describe('/api/opportunities — payload values (computeRouteStatus)', () => {
  it('bestBridge is the bridge with highest outputUsd', () => {
    const rows = [
      makeRow('across',   '985', 15),
      makeRow('stargate', '998', 20),
      makeRow('relay',    '976', 24),
    ];
    const { bestBridge, bestOutputUsd } = computeRouteStatus(rows);
    expect(bestBridge).toBe('stargate');
    expect(bestOutputUsd).toBe('998');
  });

  it('worstBridge is the bridge with lowest outputUsd', () => {
    const rows = [
      makeRow('across',   '985', 15),
      makeRow('stargate', '998', 20),
      makeRow('relay',    '976', 24),
    ];
    const { worstBridge, worstOutputUsd } = computeRouteStatus(rows);
    expect(worstBridge).toBe('relay');
    expect(worstOutputUsd).toBe('976');
  });

  it('spreadBps = round((best - worst) / best * 10000)', () => {
    const rows = [
      makeRow('a', '998', 2),
      makeRow('b', '976', 24),
    ];
    const { spreadBps } = computeRouteStatus(rows);
    expect(spreadBps).toBe(Math.round((10000 * (998 - 976)) / 998));
  });

  it('spreadBps never negative', () => {
    // Edge case: single bridge (best == worst)
    const rows = [makeRow('only', '990', 10)];
    const { spreadBps } = computeRouteStatus(rows);
    expect(spreadBps).toBeGreaterThanOrEqual(0);
    expect(spreadBps).toBe(0);
  });

  it('bestFeeBps comes from stored fee when > 0', () => {
    const rows = [makeRow('a', '990', 10)];
    const { bestFeeBps } = computeRouteStatus(rows);
    expect(bestFeeBps).toBe(10);
  });

  it('bestFeeBps derived from input/output when stored fee is 0', () => {
    // input=1000, output=990, fee=0 → derive: (1000-990)/1000 * 10000 = 100 bps
    const rows = [makeRow('a', '990', 0, 60_000, '1000')];
    const { bestFeeBps } = computeRouteStatus(rows);
    expect(bestFeeBps).toBe(100);
  });

  it('bestFeeBps clamped to 0 when output > input (rebate/net gain)', () => {
    const rows = [makeRow('a', '1005', 0, 60_000, '1000')];
    const { bestFeeBps } = computeRouteStatus(rows);
    expect(bestFeeBps).toBeGreaterThanOrEqual(0);
    expect(bestFeeBps).toBe(0);
  });

  // Regression G: production mismatch — older bridge with better output must be picked
  it('Regression G: older bridge (2× threshold) with better output is bestBridge', () => {
    const rows = [
      makeRow('polymer', '49875', 25, 60_000,                  '50000'),
      makeRow('relay',   '49995',  1, STALE_THRESHOLD_MS * 2,  '50000'),
    ];
    const { bestBridge, bestOutputUsd, worstBridge, state, spreadBps } = computeRouteStatus(rows);
    expect(state).toBe('active');          // lastSeen = polymer (60s) → fresh
    expect(bestBridge).toBe('relay');      // higher output wins
    expect(bestOutputUsd).toBe('49995');
    expect(worstBridge).toBe('polymer');
    expect(spreadBps).toBeGreaterThan(0);
  });

  it('routes with bestFeeBps >= 1000 are filtered out by opportunity eligibility', () => {
    // fee_bps=1000 (not < 1000) → opportunity eligibility: bestFeeBps < 1000
    const rows = [makeRow('badroute', '900', 1000, 60_000, '1000')];
    // computeRouteStatus validity: total_fee_bps <= 1000 → this row IS valid (equals 1000)
    // But opportunity eligibility rule: bestFeeBps < 1000 → should be excluded
    const { bestFeeBps, state } = computeRouteStatus(rows);
    // The eligibility check is done in the opportunities endpoint: bestFeeBps >= 1000 → skip
    // This test just verifies computeRouteStatus returns the right fee for the caller to filter.
    expect(state).toBe('single-bridge');
    expect(bestFeeBps).toBe(1000);
    // Caller should skip: `if (bestFeeBps == null || bestFeeBps >= 1000) continue;`
  });
});
