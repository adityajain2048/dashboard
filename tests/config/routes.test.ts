import { describe, it, expect } from 'vitest';
import {
  ALL_ROUTES,
  TIER1_ROUTES,
  TIER2_ROUTES,
  TIER3_ROUTES,
} from '../../src/config/routes.js';
import { CHAIN_SLUGS } from '../../src/config/chains.js';
import { TOKENS, getToken } from '../../src/config/tokens.js';
import type { Route } from '../../src/types/index.js';

const EXPECTED_ROUTES = 22 * 21; // 22 chains × 21 destinations (no self-routes)

describe('Route Config', () => {
  it('generates expected routes (chains × (chains-1))', () => {
    expect(ALL_ROUTES.length).toBe(EXPECTED_ROUTES);
  });

  it('has no self-routes', () => {
    const selfRoutes = ALL_ROUTES.filter((r: Route) => r.src === r.dst);
    expect(selfRoutes.length).toBe(0);
  });

  it('covers all chain pairs bidirectionally', () => {
    const pairs = new Set(ALL_ROUTES.map((r: Route) => `${r.src}:${r.dst}`));
    for (const a of CHAIN_SLUGS) {
      for (const b of CHAIN_SLUGS) {
        if (a !== b) expect(pairs.has(`${a}:${b}`)).toBe(true);
      }
    }
  });

  it('tier counts are reasonable', () => {
    // Tier 1 should be biggest explicit set (high-volume pairs)
    expect(TIER1_ROUTES.length).toBeGreaterThan(50);
    expect(TIER1_ROUTES.length).toBeLessThan(200);
    // Tier 2 should cover Bitcoin, Monad, MegaETH, etc.
    expect(TIER2_ROUTES.length).toBeGreaterThan(50);
    // Tier 3 should be the remainder
    expect(TIER3_ROUTES.length).toBeGreaterThan(100);
    // All tiers sum to total routes
    expect(TIER1_ROUTES.length + TIER2_ROUTES.length + TIER3_ROUTES.length).toBe(EXPECTED_ROUTES);
  });
});

describe('Chain Config', () => {
  it('has exactly 22 chains', () => {
    expect(CHAIN_SLUGS.length).toBe(22);
  });
});

describe('Token Config', () => {
  it('has 3 entries per chain (66 total)', () => {
    expect(TOKENS.length).toBe(66);
  });

  it('getToken works for known chain+asset', () => {
    const eth_usdc = getToken('ethereum', 'USDC');
    expect(eth_usdc.decimals).toBe(6);
    expect(eth_usdc.address).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  });
});
