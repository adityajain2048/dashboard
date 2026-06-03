import { describe, it, expect } from 'vitest';
import { aggregatorSupportsRoute } from '../../src/config/aggregator-support.js';
import type { RouteKey } from '../../src/types/index.js';

const route = (src: string, dst: string): RouteKey => ({
  src,
  dst,
  asset: 'USDC',
  amountTier: 1000,
});

describe('aggregatorSupportsRoute', () => {
  it('allows aggregators with no unsupported set (e.g. lifi) on any chain', () => {
    expect(aggregatorSupportsRoute('lifi', route('ethereum', 'peaq'))).toBe(true);
    expect(aggregatorSupportsRoute('lifi', route('ethereum', 'solana'))).toBe(true);
  });

  it('skips bungee on non-EVM endpoints (EVM-only)', () => {
    expect(aggregatorSupportsRoute('bungee', route('ethereum', 'solana'))).toBe(false);
    expect(aggregatorSupportsRoute('bungee', route('bitcoin', 'arbitrum'))).toBe(false);
  });

  it('skips bungee on the observed-unsupported newer EVM chains', () => {
    for (const chain of ['peaq', 'soneium', 'monad', 'megaeth']) {
      expect(aggregatorSupportsRoute('bungee', route('ethereum', chain))).toBe(false);
      expect(aggregatorSupportsRoute('bungee', route(chain, 'ethereum'))).toBe(false);
    }
  });

  it('allows bungee on supported EVM corridors', () => {
    expect(aggregatorSupportsRoute('bungee', route('ethereum', 'arbitrum'))).toBe(true);
    expect(aggregatorSupportsRoute('bungee', route('base', 'optimism'))).toBe(true);
  });
});
