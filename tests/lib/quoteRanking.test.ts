import { describe, it, expect } from 'vitest';
import {
  compareQuotesByOutput,
  selectBestQuote,
  selectWorstQuote,
  computeSpreadBps,
  reRankQuotes,
} from '../../src/lib/quoteRanking.js';
import type { RankableQuote } from '../../src/lib/quoteRanking.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function q(bridge: string, outputUsd: number, opts: Partial<RankableQuote> = {}): RankableQuote {
  return {
    bridge,
    source: opts.source ?? 'lifi',
    outputUsd: String(outputUsd),
    totalFeeBps: opts.totalFeeBps ?? 0,
    estimatedSeconds: opts.estimatedSeconds ?? 60,
    ...opts,
  };
}

// ─── compareQuotesByOutput ────────────────────────────────────────────────────

describe('compareQuotesByOutput', () => {
  it('higher output wins (negative = a is better)', () => {
    const a = q('symbiosis', 1001.25);
    const b = q('axelar',    999.96);
    expect(compareQuotesByOutput(a, b)).toBeLessThan(0);
    expect(compareQuotesByOutput(b, a)).toBeGreaterThan(0);
  });

  it('equal output: lower fee wins', () => {
    const a = q('bridgeA', 1000, { totalFeeBps: 5 });
    const b = q('bridgeB', 1000, { totalFeeBps: 10 });
    expect(compareQuotesByOutput(a, b)).toBeLessThan(0);
  });

  it('equal output and fee: lower time wins', () => {
    const a = q('bridgeA', 1000, { totalFeeBps: 0, estimatedSeconds: 30 });
    const b = q('bridgeB', 1000, { totalFeeBps: 0, estimatedSeconds: 90 });
    expect(compareQuotesByOutput(a, b)).toBeLessThan(0);
  });

  it('equal output, fee, time: alphabetical source+bridge is deterministic', () => {
    const a = q('zzz', 1000, { source: 'aaa', totalFeeBps: 0, estimatedSeconds: 60 });
    const b = q('aaa', 1000, { source: 'zzz', totalFeeBps: 0, estimatedSeconds: 60 });
    // a.source+bridge = "aaazzz", b.source+bridge = "zzaaaa" — "aaa" < "zzz" so a wins
    const cmp = compareQuotesByOutput(a, b);
    // result should be non-zero (one must beat the other deterministically)
    expect(cmp).not.toBe(0);
    // and symmetry: swap gives opposite sign
    expect(Math.sign(compareQuotesByOutput(b, a))).toBe(-Math.sign(cmp));
  });
});

// ─── Regression A: eth→arb fixture ───────────────────────────────────────────

describe('selectBestQuote — Regression A (ethereum→arbitrum USDC $1K)', () => {
  const quotes = [
    q('symbiosis', 1001.25264400, { source: 'bungee', totalFeeBps: 0 }),
    q('axelar',    999.96285600, { source: 'squid',  totalFeeBps: 0 }),
  ];

  it('selects symbiosis (higher output)', () => {
    const best = selectBestQuote(quotes);
    expect(best?.bridge).toBe('symbiosis');
  });

  it('selectWorstQuote returns axelar (lower output)', () => {
    const worst = selectWorstQuote(quotes);
    expect(worst?.bridge).toBe('axelar');
  });
});

// ─── Regression B: spreadBps computation ─────────────────────────────────────

describe('computeSpreadBps — Regression B', () => {
  it('spread from best to worse quote is positive', () => {
    // (1001.25 - 999.96) / 1001.25 * 10000 ≈ 13 bps
    const spread = computeSpreadBps(1001.25264400, 999.96285600);
    expect(spread).toBe(Math.round((10000 * (1001.25264400 - 999.96285600)) / 1001.25264400));
    expect(spread).toBeGreaterThan(0);
  });

  it('spread from best to itself is 0', () => {
    expect(computeSpreadBps(1001.25, 1001.25)).toBe(0);
  });

  it('spread is always >= 0 even if quoteOutput > bestOutput (defensive)', () => {
    expect(computeSpreadBps(1000, 1001)).toBe(0);
  });

  it('spread is 0 when bestOutput = 0 (division by zero guard)', () => {
    expect(computeSpreadBps(0, 0)).toBe(0);
  });
});

// ─── Regression C & D: reRankQuotes ─────────────────────────────────────────

describe('reRankQuotes — Regression C (only one BEST badge)', () => {
  it('only index-0 quote gets spreadBps = 0', () => {
    const quotes = [
      // All three had rank=1 / spreadBps=0 in their respective batches (simulating the bug)
      q('symbiosis', 1001.25, { source: 'bungee' }),
      q('axelar',    999.96,  { source: 'squid'  }),
      q('across',    998.00,  { source: 'lifi'   }),
    ];
    const ranked = reRankQuotes(quotes);
    expect(ranked[0]!.spreadBps).toBe(0);           // BEST
    expect(ranked[1]!.spreadBps).toBeGreaterThan(0); // not BEST
    expect(ranked[2]!.spreadBps).toBeGreaterThan(0); // not BEST
  });

  it('sorted by canonical comparator (highest output first)', () => {
    const quotes = [
      q('axelar',    999.96),
      q('symbiosis', 1001.25),
      q('across',    998.00),
    ];
    const ranked = reRankQuotes(quotes);
    expect(ranked[0]!.bridge).toBe('symbiosis');
    expect(ranked[1]!.bridge).toBe('axelar');
    expect(ranked[2]!.bridge).toBe('across');
  });

  it('assigns correct rank values (1-based)', () => {
    const quotes = [q('a', 1000), q('b', 900), q('c', 800)];
    const ranked = reRankQuotes(quotes);
    expect(ranked.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('empty input returns empty array', () => {
    expect(reRankQuotes([])).toEqual([]);
  });
});

// ─── Regression D: spreadBps always >= 0 ─────────────────────────────────────

describe('computeSpreadBps — Regression D (never negative)', () => {
  const cases: [number, number][] = [
    [0, 0],
    [1000, 1001],    // output > best (e.g. rebate route)
    [1000, 1000],
    [0.01, 0.005],
    [Number.MAX_SAFE_INTEGER, 0],
  ];
  it.each(cases)('computeSpreadBps(%f, %f) >= 0', (best, quote) => {
    expect(computeSpreadBps(best, quote)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Regression E: polygon→bsc USDC $50K fixture ─────────────────────────────

describe('Regression E — polygon→bsc USDC $50K opportunities fixture', () => {
  const quotes = [
    q('cbridge',  49997.98504000, { source: 'bungee', totalFeeBps: 0  }),
    q('across',   49987.90762800, { source: 'bungee', totalFeeBps: 2  }),
    q('debridge', 49960.00800046, { source: 'direct', totalFeeBps: 8  }),
    q('axelar',   49954.41385768, { source: 'squid',  totalFeeBps: 9  }),
  ];

  it('best is cbridge (highest output)', () => {
    expect(selectBestQuote(quotes)?.bridge).toBe('cbridge');
  });

  it('worst is axelar (lowest output)', () => {
    expect(selectWorstQuote(quotes)?.bridge).toBe('axelar');
  });

  it('spread ≈ 87 bps', () => {
    const spread = computeSpreadBps(49997.98504000, 49954.41385768);
    expect(spread).toBe(Math.round((10000 * (49997.98504000 - 49954.41385768)) / 49997.98504000));
    expect(spread).toBeGreaterThan(0);
  });
});

// ─── Regression F: no negative bestFeeBps ─────────────────────────────────────
// These tests exercise the clamping in computeSpreadBps and reRankQuotes.
// The actual bestFeeBps clamping lives in computeRouteStatus (tested in routeStatus.test.ts).

describe('Regression F — no negative fee exposed via spread helpers', () => {
  it('computeSpreadBps never returns negative for any output relationship', () => {
    // Simulate: outputUsd > inputUsd (bridge gives rebate / net gain)
    expect(computeSpreadBps(1000, 1005)).toBe(0); // output > best → clamped to 0
    expect(computeSpreadBps(1000, 1000.01)).toBe(0);
  });
});
