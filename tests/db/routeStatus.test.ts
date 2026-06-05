import { describe, it, expect } from 'vitest';
import { computeRouteStatus, STALE_THRESHOLD_MS } from '../../src/db/queries.js';
import type { RouteLatestInput } from '../../src/db/queries.js';
import { reRankQuotes } from '../../src/lib/quoteRanking.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function row(overrides: Partial<RouteLatestInput> & { ageMs?: number } = {}): RouteLatestInput {
  const { ageMs = 0, ...rest } = overrides;
  const ts = new Date(Date.now() - ageMs);
  return {
    bridge: 'across',
    source: 'lifi',
    output_usd: '999',
    input_usd: '1000',
    total_fee_bps: 10,
    ts,
    ...rest,
  };
}

/** Returns a `now` Date aligned so thresholdMs expires exactly after `ageMs`. */
const T1_THRESHOLD = STALE_THRESHOLD_MS;
const T2_THRESHOLD = STALE_THRESHOLD_MS;
const T3_THRESHOLD = STALE_THRESHOLD_MS;

// ─── State classification ─────────────────────────────────────────────────────

describe('computeRouteStatus — state', () => {
  it('dead when no rows', () => {
    const result = computeRouteStatus([]);
    expect(result.state).toBe('dead');
    expect(result.bestFeeBps).toBeNull();
    expect(result.bestBridge).toBeNull();
  });

  it('active when 2+ bridges with fresh quotes', () => {
    const rows = [
      row({ bridge: 'across', ageMs: 60_000 }),
      row({ bridge: 'stargate', ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('active');
  });

  it('single-bridge when only 1 bridge with fresh quote', () => {
    const rows = [row({ bridge: 'across', ageMs: 60_000 })];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('single-bridge');
  });

  it('stale when most recent quote is older than threshold (T1 = 47 min)', () => {
    const rows = [
      row({ bridge: 'across',   ageMs: T1_THRESHOLD + 1000 }),
      row({ bridge: 'stargate', ageMs: T1_THRESHOLD + 2000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('stale');
  });

  it('stale when most recent quote is older than threshold (T2 = 47 min)', () => {
    const rows = [row({ bridge: 'across', ageMs: T2_THRESHOLD + 1000 })];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('stale');
  });

  it('stale when most recent quote is older than threshold (T3 = 47 min)', () => {
    const rows = [row({ bridge: 'across', ageMs: T3_THRESHOLD + 1000 })];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('stale');
  });

  it('active (not stale) when most recent quote is exactly at threshold boundary', () => {
    // 1ms inside the window → still fresh
    const rows = [
      row({ bridge: 'across',   ageMs: T1_THRESHOLD - 1 }),
      row({ bridge: 'stargate', ageMs: T1_THRESHOLD - 1 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('active');
  });

  it('stale even when one bridge is fresh but another dragged lastSeen — no, lastSeen is MAX', () => {
    // The FRESHEST quote determines lastSeen.
    // If the freshest bridge quote is within threshold → not stale.
    const rows = [
      row({ bridge: 'across',   ageMs: 60_000 }),           // fresh
      row({ bridge: 'stargate', ageMs: T1_THRESHOLD * 10 }), // very old
    ];
    const result = computeRouteStatus(rows);
    // lastSeen is 1 min ago → within 47 min threshold → active
    expect(result.state).toBe('active');
  });
});

// ─── Fee accuracy ─────────────────────────────────────────────────────────────

describe('computeRouteStatus — bestFeeBps', () => {
  it('returns correct fee from stored total_fee_bps', () => {
    const rows = [row({ bridge: 'across', total_fee_bps: 25, ageMs: 60_000 })];
    const result = computeRouteStatus(rows);
    expect(result.bestFeeBps).toBe(25);
  });

  it('derives fee from (input - output) / input when total_fee_bps is 0 and output < input', () => {
    // input=1000, output=990 → fee = (1000-990)/1000 = 1% = 100 bps
    const rows = [row({
      bridge: 'across',
      input_usd: '1000',
      output_usd: '990',
      total_fee_bps: 0,
      ageMs: 60_000,
    })];
    const result = computeRouteStatus(rows);
    expect(result.bestFeeBps).toBe(100);
  });

  it('clamps fee to 0 when total_fee_bps is 0 and output > input (rebate / net gain)', () => {
    // outputUsd 1001 > inputUsd 1000 — bridge provides a small gain.
    // Fee must never be negative; it should be clamped to 0.
    const rows = [row({
      bridge: 'rebate-bridge',
      input_usd: '1000',
      output_usd: '1001',
      total_fee_bps: 0,
      ageMs: 60_000,
    })];
    const result = computeRouteStatus(rows);
    expect(result.bestFeeBps).toBeGreaterThanOrEqual(0);
    expect(result.bestFeeBps).toBe(0);
  });

  it('picks the best (highest output) fresh bridge for fee', () => {
    const rows = [
      row({ bridge: 'across',   output_usd: '995', total_fee_bps: 50,  ageMs: 60_000 }),
      row({ bridge: 'stargate', output_usd: '998', total_fee_bps: 20,  ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    // stargate has higher output → lower fee → should win
    expect(result.bestBridge).toBe('stargate');
    expect(result.bestFeeBps).toBe(20);
  });

  it('preserves latest known fee when route is stale — stale data stays visible on the matrix', () => {
    // Stale routes keep showing their latest available fee. Indexing takes 30+ min,
    // so many routes are naturally stale; freshness only drives STATE classification,
    // not whether a fee is shown. across has the higher output (tie at 999) and lower fee.
    const rows = [
      row({ bridge: 'across',   total_fee_bps: 15, ageMs: T1_THRESHOLD + 5000 }),
      row({ bridge: 'stargate', total_fee_bps: 20, ageMs: T1_THRESHOLD + 5000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('stale');
    expect(result.bestFeeBps).toBe(15);
  });

  it('preserves latest known fee when only stale rows exist', () => {
    const rows = [
      row({ bridge: 'across', total_fee_bps: 15, ageMs: T1_THRESHOLD * 2 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('stale');
    expect(result.bestFeeBps).toBe(15);
  });

  it('picks old-bridge when it has better output — all valid rows ranked regardless of age', () => {
    // old-bridge quote is STALE_THRESHOLD+5s old; new-bridge is 60s old (= lastSeen).
    // Canonical spec: both are valid rows → both ranked → old-bridge wins (higher output).
    const rows = [
      row({ bridge: 'old-bridge', output_usd: '995', total_fee_bps: 5,  ageMs: T1_THRESHOLD + 5000 }),
      row({ bridge: 'new-bridge', output_usd: '980', total_fee_bps: 200, ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('active'); // lastSeen = 1min ago (new-bridge) → fresh
    expect(result.bestBridge).toBe('old-bridge'); // higher output → wins
    expect(result.bestFeeBps).toBe(5);
  });

  it('drops quotes with total_fee_bps > 1000 (garbage quotes)', () => {
    const rows = [
      row({ bridge: 'garbage', total_fee_bps: 1500, ageMs: 60_000 }),
      row({ bridge: 'good',    total_fee_bps: 30,   ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.bestBridge).toBe('good');
    expect(result.bestFeeBps).toBe(30);
  });

  it('drops quotes with output_usd ≤ 0.01 (broken quotes)', () => {
    const rows = [
      row({ bridge: 'broken', output_usd: '0', total_fee_bps: 0, ageMs: 60_000 }),
      row({ bridge: 'good',   output_usd: '999', total_fee_bps: 10, ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.bestBridge).toBe('good');
  });
});

// ─── Spread ───────────────────────────────────────────────────────────────────

describe('computeRouteStatus — spreadBps', () => {
  it('spread is 0 when only one fresh bridge', () => {
    const rows = [row({ bridge: 'across', output_usd: '990', total_fee_bps: 100, ageMs: 60_000 })];
    const result = computeRouteStatus(rows);
    expect(result.spreadBps).toBe(0);
  });

  it('computes spread from best vs worst fresh bridge outputs', () => {
    const rows = [
      row({ bridge: 'across',   output_usd: '990', total_fee_bps: 100, ageMs: 60_000 }),
      row({ bridge: 'stargate', output_usd: '980', total_fee_bps: 200, ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    // spread = (990 - 980) / 990 * 10000 ≈ 101 bps
    expect(result.spreadBps).toBeGreaterThan(0);
    expect(result.spreadBps).toBeCloseTo(Math.round((10000 * (990 - 980)) / 990), -1);
  });

  it('null spread when route is stale (no fresh rows)', () => {
    const rows = [
      row({ bridge: 'across',   output_usd: '990', ageMs: T1_THRESHOLD + 1000 }),
      row({ bridge: 'stargate', output_usd: '980', ageMs: T1_THRESHOLD + 1000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('stale');
    expect(result.spreadBps).toBeNull();
  });

  it('includes all valid rows in ranking regardless of individual timestamp — spread reflects real diff', () => {
    // across is 60s old (= lastSeen). stargate is 2× threshold old but still a valid quote.
    // Canonical spec: both rows pass validity (output > 0.01, fee <= 1000) → both ranked.
    // spread = round((990 - 970) / 990 * 10000) ≈ 202 bps — real price difference is shown.
    const rows = [
      row({ bridge: 'across',   output_usd: '990', total_fee_bps: 100, ageMs: 60_000 }),
      row({ bridge: 'stargate', output_usd: '970', total_fee_bps: 300, ageMs: T1_THRESHOLD * 2 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('active');      // lastSeen = 60s ago → fresh
    expect(result.bestBridge).toBe('across'); // higher output
    expect(result.worstBridge).toBe('stargate');
    // Both valid rows ranked → spread is non-zero
    expect(result.spreadBps).toBeGreaterThan(0);
    expect(result.spreadBps).toBe(Math.round((10000 * (990 - 970)) / 990));
  });
});

// ─── worstBridge ──────────────────────────────────────────────────────────────

describe('computeRouteStatus — worstBridge', () => {
  it('worstBridge is null when no valid rows', () => {
    const result = computeRouteStatus([]);
    expect(result.worstBridge).toBeNull();
  });

  it('worstBridge equals bestBridge when only one valid row', () => {
    const rows = [row({ bridge: 'across', output_usd: '990', ageMs: 60_000 })];
    const result = computeRouteStatus(rows);
    expect(result.worstBridge).toBe('across');
    expect(result.bestBridge).toBe('across');
  });

  it('worstBridge is the bridge with the lowest output_usd', () => {
    const rows = [
      row({ bridge: 'across',   output_usd: '990', ageMs: 60_000 }),
      row({ bridge: 'stargate', output_usd: '970', ageMs: 60_000 }),
      row({ bridge: 'relay',    output_usd: '950', ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.bestBridge).toBe('across');  // highest
    expect(result.worstBridge).toBe('relay');  // lowest
  });

  it('worstBridge is tracked even when route is stale', () => {
    const rows = [
      row({ bridge: 'across',   output_usd: '990', ageMs: T1_THRESHOLD + 1000 }),
      row({ bridge: 'stargate', output_usd: '970', ageMs: T1_THRESHOLD + 1000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.state).toBe('stale');
    expect(result.worstBridge).toBe('stargate');
  });

  it('Regression E: polygon→bsc USDC $50K — worstBridge is axelar', () => {
    const rows = [
      row({ bridge: 'cbridge',  input_usd: '50000', output_usd: '49997.98504000', total_fee_bps: 0, ageMs: 60_000 }),
      row({ bridge: 'across',   input_usd: '50000', output_usd: '49987.90762800', total_fee_bps: 2, ageMs: 60_000 }),
      row({ bridge: 'debridge', input_usd: '50000', output_usd: '49960.00800046', total_fee_bps: 8, ageMs: 60_000 }),
      row({ bridge: 'axelar',   input_usd: '50000', output_usd: '49954.41385768', total_fee_bps: 9, ageMs: 60_000 }),
    ];
    const result = computeRouteStatus(rows);
    expect(result.bestBridge).toBe('cbridge');
    expect(result.worstBridge).toBe('axelar');
    expect(result.bestOutputUsd).toBe('49997.98504000');
    expect(result.worstOutputUsd).toBe('49954.41385768');
  });
});

// ─── Regression G: production mismatch pattern ───────────────────────────────
// Root cause of 1,528 audit mismatches: freshness window excluded older bridge
// quotes with BETTER output, causing an inferior fresh quote to rank as "best".
// Pattern confirmed by audit: web_quoteCount == correct_quoteCount (same valid rows)
// but correct_bestOutputUsd > web_bestOutputUsd in 970/1528 mismatch rows.

describe('computeRouteStatus — Regression G (canonical mismatch pattern)', () => {
  // Mirrors production: relay (direct, 2× threshold old, output=$49,995) vs
  // polymer (fresh 60s, output=$49,875). Relay has $120 better output.
  const LARGE_INPUT = '50000';
  const rows = [
    row({
      bridge: 'polymer',
      source: 'squid',
      input_usd: LARGE_INPUT,
      output_usd: '49875',
      total_fee_bps: 25,
      ageMs: 60_000,                    // very fresh
    }),
    row({
      bridge: 'relay',
      source: 'direct',
      input_usd: LARGE_INPUT,
      output_usd: '49995',
      total_fee_bps: 1,
      ageMs: T1_THRESHOLD * 2 + 10_000, // 2× threshold old — was excluded by old window
    }),
  ];

  it('relay (better output, older quote) is bestBridge under canonical spec', () => {
    const { bestBridge } = computeRouteStatus(rows);
    expect(bestBridge).toBe('relay');
  });

  it('bestOutputUsd is relay\'s output (not polymer\'s inferior output)', () => {
    const { bestOutputUsd } = computeRouteStatus(rows);
    expect(bestOutputUsd).toBe('49995');
  });

  it('state is active (lastSeen driven by polymer\'s fresh quote)', () => {
    const { state } = computeRouteStatus(rows);
    expect(state).toBe('active');
  });

  it('spreadBps > 0 — both bridges in ranking, real price difference shown', () => {
    const { spreadBps } = computeRouteStatus(rows);
    expect(spreadBps).toBeGreaterThan(0);
    expect(spreadBps).toBe(Math.round((10000 * (49995 - 49875)) / 49995));
  });

  it('bestBridge matches reRankQuotes rank[0]', () => {
    const ranked = reRankQuotes(rows.map((r) => ({
      bridge: r.bridge,
      source: r.source,
      outputUsd: r.output_usd,
      totalFeeBps: r.total_fee_bps,
    })));
    const { bestBridge } = computeRouteStatus(rows);
    expect(bestBridge).toBe(ranked[0]!.bridge);
  });

  it('worstBridge is polymer (lower output)', () => {
    const { worstBridge } = computeRouteStatus(rows);
    expect(worstBridge).toBe('polymer');
  });
});

// ─── quoteCount / bridgeCount ──────────────────────────────────────────────────

describe('computeRouteStatus — counts', () => {
  it('counts all rows regardless of freshness', () => {
    const rows = [
      row({ bridge: 'across',   ageMs: 60_000 }),
      row({ bridge: 'stargate', ageMs: T1_THRESHOLD + 5000 }), // stale
    ];
    const result = computeRouteStatus(rows);
    expect(result.quoteCount).toBe(2);
    expect(result.bridgeCount).toBe(2);
  });

  it('lastSeen is the most recent ts across all rows', () => {
    const now = new Date();
    const rows = [
      { ...row(), ts: new Date(now.getTime() - 120_000) }, // 2 min ago
      { ...row(), ts: new Date(now.getTime() - 30_000) },  // 30 s ago  ← newest
    ];
    const result = computeRouteStatus(rows, now);
    expect(result.lastSeen!.getTime()).toBeCloseTo(now.getTime() - 30_000, -2);
  });
});
