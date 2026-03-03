import { describe, it, expect } from 'vitest';
import type { RouteKey } from '../../src/types/index.js';

const { gapFill } = await import('../../src/fetcher/bridges/index.js');

describe('gapFill', () => {
  it('returns an array (only queries bridges not in bridgesSeen)', async () => {
    const routeKey: RouteKey = { src: 'ethereum', dst: 'arbitrum', asset: 'USDC', amountTier: 1000 };
    const bridgesSeen = new Set<string>(['across', 'stargate']);
    const result = await gapFill(routeKey, bridgesSeen, 'batch-1');
    expect(Array.isArray(result)).toBe(true);
    expect(result.every((q) => q.source === 'direct')).toBe(true);
  });
});
