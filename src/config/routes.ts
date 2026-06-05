// src/config/routes.ts
//
// Single flat route list — all 3,080 directional pairs, no refresh-tier
// distinction. Every route gets native (ETH slot), USDC, and USDT at three
// amount levels ($50 / $1K / $50K). Per-chain exceptions (Bitcoin, Berachain)
// still apply; chains with no USDC/USDT token mapping are filtered at the
// fetcher level via isPlaceholder().
import type { Route, Asset } from '../types/index.js';
import { CHAIN_SLUGS } from './chains.js';

// ─── Asset + amount config ────────────────────────────────────────────────────

/** All assets used for every corridor. */
const ALL_ASSETS: readonly Asset[] = ['ETH', 'USDC', 'USDT'];

/** All USD amount tiers used for every route. */
const ALL_AMOUNTS = [50, 1000, 50000] as const;

/** Bitcoin has no native USDC/USDT — only native (BTC). */
const BITCOIN_ASSETS: readonly Asset[] = ['ETH'];

/** Berachain does not have USDT — skip to avoid dead routes. */
const BERACHAIN_ASSETS: readonly Asset[] = ['ETH', 'USDC'];

/**
 * Chains where the native token (ETH slot) has no meaningful bridging use case:
 * tiny market-cap tokens whose USD prices are unreliable across aggregators,
 * producing inflated/garbage output_usd values that the validity filter drops.
 * Only USDC routes are generated for these chains.
 *
 * stargaze: STARS ~$0.002 — NFT chain, all native quotes show 10-20× inflation
 */
const USDC_ONLY_CHAINS = new Set(['stargaze']);

/** Get assets for a corridor; applies per-chain restrictions. */
function assetsForCorridor(src: string, dst: string): Asset[] {
  if (src === 'bitcoin' || dst === 'bitcoin') return [...BITCOIN_ASSETS];
  if (src === 'berachain' || dst === 'berachain') return [...BERACHAIN_ASSETS];
  if (USDC_ONLY_CHAINS.has(src) || USDC_ONLY_CHAINS.has(dst)) return ['USDC'];
  return [...ALL_ASSETS];
}

// ─── Route generation ─────────────────────────────────────────────────────────

/** Generate all directional routes: 56 × 55 = 3,080 pairs. */
export function generateAllRoutes(): Route[] {
  const routes: Route[] = [];
  for (const src of CHAIN_SLUGS) {
    for (const dst of CHAIN_SLUGS) {
      if (src === dst) continue;
      const assets = assetsForCorridor(src, dst);
      if (assets.length === 0) continue;
      routes.push({ src, dst, assets, amountTiers: [...ALL_AMOUNTS] });
    }
  }
  return routes;
}

/** All routes (cached). */
export const ALL_ROUTES: readonly Route[] = generateAllRoutes();

// ─── Derived stats ────────────────────────────────────────────────────────────

export const ROUTE_COUNT = ALL_ROUTES.length;

// ─── Refresh interval ─────────────────────────────────────────────────────────

/**
 * How often the all-routes non-Squid cycle fires.
 * The Squid sweep runs separately at startup and continues in the background.
 * At CYCLE_CONCURRENCY=20 and ~5-6s avg per task, a full cycle of ~27K combos
 * takes roughly 120-130 minutes, so a 30-min trigger gives one rest period
 * between completions.
 */
export const REFRESH_INTERVAL_MS = 30 * 60_000; // 30 minutes

// ─── Route key helpers ────────────────────────────────────────────────────────

export function routeId(src: string, dst: string): string {
  return `${src}:${dst}`;
}

export function fullRouteKey(src: string, dst: string, asset: Asset, amountTier: number): string {
  return `${src}:${dst}:${asset}:${amountTier}`;
}
