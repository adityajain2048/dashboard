/**
 * Cross-endpoint consistency tests.
 *
 * These tests use fixture data to verify that the matrix and opportunities
 * endpoints return the same canonical winner as /api/quotes — without hitting
 * a real database.
 *
 * Regression routes (per QA report):
 *   A. ethereum → arbitrum  USDC $1K  — symbiosis/bungee should beat axelar/squid
 *   B. ethereum → base      USDC $1K  — negative bestFeeBps (-1) must be clamped to 0
 *   C. polygon  → bsc       USDC $50K — cbridge should be best, axelar worst
 */

import { describe, it, expect } from 'vitest';
import { computeRouteStatus, STALE_THRESHOLD_MS } from '../../src/db/queries.js';
import type { RouteLatestInput } from '../../src/db/queries.js';
import { reRankQuotes } from '../../src/lib/quoteRanking.js';

// ─── Fixture builder ─────────────────────────────────────────────────────────

function row(
  bridge: string,
  source: string,
  outputUsd: string,
  totalFeeBps: number,
  ageMs = 60_000,   // 1 min = fresh for T1
  inputUsd = '1000'
): RouteLatestInput {
  return {
    bridge,
    source,
    output_usd: outputUsd,
    input_usd: inputUsd,
    total_fee_bps: totalFeeBps,
    ts: new Date(Date.now() - ageMs),
  };
}

// ─── Regression A: ethereum → arbitrum USDC $1K ───────────────────────────────

describe('Regression A — ethereum→arbitrum USDC $1K', () => {
  // Fixture mirrors live API response from QA report.
  // Matrix showed axelar as best; /api/quotes showed symbiosis as #1.
  const rows: RouteLatestInput[] = [
    row('symbiosis', 'bungee', '1001.25264400', 0),
    row('axelar',    'squid',  '999.96285600',  0),
  ];

  it('computeRouteStatus: bestBridge = symbiosis (highest output)', () => {
    const { bestBridge } = computeRouteStatus(rows, 1);
    expect(bestBridge).toBe('symbiosis');
  });

  it('computeRouteStatus: worstBridge = axelar (lowest output)', () => {
    const { worstBridge } = computeRouteStatus(rows, 1);
    expect(worstBridge).toBe('axelar');
  });

  it('computeRouteStatus: bestFeeBps is not negative', () => {
    const { bestFeeBps } = computeRouteStatus(rows, 1);
    expect(bestFeeBps).toBeGreaterThanOrEqual(0);
  });

  it('reRankQuotes: first quote is symbiosis with spreadBps = 0', () => {
    const ranked = reRankQuotes(rows.map(r => ({
      bridge: r.bridge,
      source: r.source,
      outputUsd: r.output_usd,
      totalFeeBps: r.total_fee_bps,
    })));
    expect(ranked[0]!.bridge).toBe('symbiosis');
    expect(ranked[0]!.spreadBps).toBe(0);
    expect(ranked[1]!.spreadBps).toBeGreaterThan(0);
  });

  it('matrix bestBridge matches /api/quotes row[0].bridge', () => {
    // Simulate what matrix endpoint and quotes endpoint both compute
    const { bestBridge: matrixBest } = computeRouteStatus(rows, 1);
    const ranked = reRankQuotes(rows.map(r => ({
      bridge: r.bridge, source: r.source,
      outputUsd: r.output_usd, totalFeeBps: r.total_fee_bps,
    })));
    expect(matrixBest).toBe(ranked[0]!.bridge);
  });
});

// ─── Regression B: ethereum → base USDC $1K (negative fee) ───────────────────

describe('Regression B — ethereum→base USDC $1K (no negative bestFeeBps)', () => {
  // The bridge gives slightly more than the input USD (gas rebate / tight spread).
  // totalFeeBps = 0 stored, outputUsd > inputUsd → formula used to give -1 bps.
  const rows: RouteLatestInput[] = [
    row('axelar', 'squid', '1000.50', 0, 60_000, '1000'),
  ];

  it('bestFeeBps is 0 (not -1) when outputUsd > inputUsd', () => {
    const { bestFeeBps } = computeRouteStatus(rows, 1);
    expect(bestFeeBps).toBe(0);
    expect(bestFeeBps).toBeGreaterThanOrEqual(0);
  });

  it('matrix cell bestFeeBps is never negative', () => {
    // Use a variety of "positive output" rows
    const moreRows: RouteLatestInput[] = [
      row('a', 'lifi',  '1002', 0, 60_000, '1000'),
      row('b', 'bungee','1001', 0, 60_000, '1000'),
      row('c', 'squid', '999',  5, 60_000, '1000'),
    ];
    const { bestFeeBps } = computeRouteStatus(moreRows, 1);
    expect(bestFeeBps).toBeGreaterThanOrEqual(0);
  });
});

// ─── Regression C: polygon → bsc USDC $50K ────────────────────────────────────

describe('Regression C — polygon→bsc USDC $50K', () => {
  const rows: RouteLatestInput[] = [
    row('cbridge',  'bungee', '49997.98504000', 0, 60_000, '50000'),
    row('across',   'bungee', '49987.90762800', 2, 60_000, '50000'),
    row('debridge', 'direct', '49960.00800046', 8, 60_000, '50000'),
    row('axelar',   'squid',  '49954.41385768', 9, 60_000, '50000'),
  ];

  it('bestBridge = cbridge (highest output)', () => {
    const { bestBridge } = computeRouteStatus(rows, 2);
    expect(bestBridge).toBe('cbridge');
  });

  it('worstBridge = axelar (lowest output)', () => {
    const { worstBridge } = computeRouteStatus(rows, 2);
    expect(worstBridge).toBe('axelar');
  });

  it('bestOutputUsd matches cbridge output', () => {
    const { bestOutputUsd } = computeRouteStatus(rows, 2);
    expect(bestOutputUsd).toBe('49997.98504000');
  });

  it('worstOutputUsd matches axelar output', () => {
    const { worstOutputUsd } = computeRouteStatus(rows, 2);
    expect(worstOutputUsd).toBe('49954.41385768');
  });

  it('spreadBps > 0 (cbridge vs axelar)', () => {
    const { spreadBps } = computeRouteStatus(rows, 2);
    expect(spreadBps).toBeGreaterThan(0);
  });

  it('opportunities would include worstBridge = axelar (not null)', () => {
    const { worstBridge } = computeRouteStatus(rows, 2);
    expect(worstBridge).not.toBeNull();
    expect(worstBridge).toBe('axelar');
  });

  it('reRankQuotes first = cbridge, last = axelar', () => {
    const ranked = reRankQuotes(rows.map(r => ({
      bridge: r.bridge, source: r.source,
      outputUsd: r.output_usd, totalFeeBps: r.total_fee_bps,
    })));
    expect(ranked[0]!.bridge).toBe('cbridge');
    expect(ranked[ranked.length - 1]!.bridge).toBe('axelar');
  });
});

// ─── No negative bestFeeBps from computeRouteStatus ────────────────────────────

describe('Regression F — no negative bestFeeBps in any scenario', () => {
  const staleThreshold = STALE_THRESHOLD_MS[1];

  const scenarios: Array<{ name: string; rows: RouteLatestInput[] }> = [
    {
      name: 'outputUsd slightly > inputUsd, totalFeeBps=0',
      rows: [row('a', 'lifi', '1001', 0, 60_000, '1000')],
    },
    {
      name: 'outputUsd much > inputUsd, totalFeeBps=0',
      rows: [row('a', 'lifi', '1100', 0, 60_000, '1000')],
    },
    {
      name: 'multiple routes, best has outputUsd > inputUsd',
      rows: [
        row('rebate',  'lifi',  '1005', 0, 60_000, '1000'),
        row('regular', 'squid', '995',  5, 60_000, '1000'),
      ],
    },
    {
      name: 'all rows stale — bestFeeBps should be null',
      rows: [row('a', 'lifi', '1001', 0, staleThreshold + 1000, '1000')],
    },
  ];

  it.each(scenarios)('$name', ({ rows }) => {
    const { bestFeeBps } = computeRouteStatus(rows, 1);
    // Either null (stale) or >= 0 (active). Never a negative number.
    if (bestFeeBps !== null) {
      expect(bestFeeBps).toBeGreaterThanOrEqual(0);
    }
  });
});
