import { describe, it, expect } from 'vitest';
import { rankQuotes, deduplicateQuotes } from '../../src/fetcher/normalizer.js';
import type { NormalizedQuote } from '../../src/types/index.js';

function quote(overrides: Partial<NormalizedQuote>): NormalizedQuote {
  return {
    batchId: 'test',
    ts: new Date(),
    srcChain: 'ethereum',
    dstChain: 'arbitrum',
    asset: 'USDC',
    amountTier: 1000,
    source: 'lifi',
    bridge: 'across',
    inputAmount: '1000000000',
    outputAmount: '999000000',
    inputUsd: '1000',
    outputUsd: '999',
    gasCostUsd: '0',
    protocolFeeBps: 10,
    totalFeeBps: 10,
    totalFeeUsd: '1',
    estimatedSeconds: 12,
    isMultihop: false,
    steps: 1,
    ...overrides,
  };
}

describe('rankQuotes', () => {
  it('assigns rank 1 to highest output, spread_bps 0 for best', () => {
    const quotes: NormalizedQuote[] = [
      quote({ bridge: 'a', outputUsd: '998' }),
      quote({ bridge: 'b', outputUsd: '999' }),
      quote({ bridge: 'c', outputUsd: '997' }),
    ];
    const ranked = rankQuotes(quotes);
    expect(ranked[0]!.outputUsd).toBe('999');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[0]!.spreadBps).toBe(0);
    expect(ranked[1]!.rank).toBe(2);
    expect(ranked[1]!.spreadBps).toBeGreaterThan(0);
  });

  it('computes spread_bps from best', () => {
    const quotes: NormalizedQuote[] = [
      quote({ outputUsd: '1000' }),
      quote({ outputUsd: '990' }),
    ];
    const ranked = rankQuotes(quotes);
    expect(ranked[0]!.spreadBps).toBe(0);
    expect(ranked[1]!.spreadBps).toBe(100); // (1000-990)/1000 * 10000
  });
});

describe('deduplicateQuotes', () => {
  it('keeps one quote per (bridge, source) with higher output', () => {
    const quotes: NormalizedQuote[] = [
      quote({ bridge: 'across', source: 'lifi', outputUsd: '999' }),
      quote({ bridge: 'across', source: 'lifi', outputUsd: '999.5' }),
    ];
    const deduped = deduplicateQuotes(quotes);
    expect(deduped.length).toBe(1);
    expect(deduped[0]!.outputUsd).toBe('999.5');
    expect(deduped[0]!.source).toBe('lifi');
  });
});
