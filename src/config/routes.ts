// src/config/routes.ts
import type { Route, RefreshTier, Asset } from '../types/index.js';
import { CHAIN_SLUGS } from './chains.js';

// ═══════════════════════════════════════════
// TIER DEFINITIONS (corridors = undirected pairs)
// Routes are generated as bidirectional from these
// ═══════════════════════════════════════════

/** Tier 1 corridors: 60s refresh, $1K only, 3 assets */
const TIER1_CORRIDORS: [string, string][] = [
  // Group 1A: ETH ↔ Top L2s
  ['ethereum', 'arbitrum'], ['ethereum', 'base'], ['ethereum', 'optimism'], ['ethereum', 'polygon'],
  // Group 1B: L2 ↔ L2
  ['arbitrum', 'base'], ['arbitrum', 'optimism'], ['base', 'optimism'],
  ['arbitrum', 'polygon'], ['base', 'polygon'],
  // Group 1C: Solana ↔ Major EVM
  ['solana', 'ethereum'], ['solana', 'arbitrum'], ['solana', 'base'], ['solana', 'bsc'],
  // Group 1D: BNB ↔ Major EVM
  ['bsc', 'ethereum'], ['bsc', 'arbitrum'], ['bsc', 'base'],
  // Group 1E: ETH ↔ AVAX
  ['ethereum', 'avalanche'],
  // Group 1F: Additional high-volume
  ['ethereum', 'bsc'], ['optimism', 'arbitrum'], ['optimism', 'polygon'],
  ['arbitrum', 'avalanche'], ['base', 'avalanche'],
  // Group 1G: ETH ↔ L2 extended
  ['ethereum', 'linea'], ['ethereum', 'zksync'], ['ethereum', 'scroll'],
  ['ethereum', 'mantle'], ['ethereum', 'sonic'],
  // Group 1H: L2 ↔ Growth
  ['arbitrum', 'linea'], ['arbitrum', 'zksync'], ['base', 'linea'],
  ['base', 'zksync'], ['optimism', 'base'],
  // Group 1I: SOL ↔ Other
  ['solana', 'optimism'], ['solana', 'polygon'], ['solana', 'avalanche'],
  // Group 1J: Cross L1
  ['polygon', 'bsc'], ['polygon', 'avalanche'], ['bsc', 'avalanche'],
  ['optimism', 'bsc'],
];

/** Tier 2 corridors: 120s refresh, 3 tiers ($50/$1K/$50K), 3 assets */
const TIER2_CORRIDORS: [string, string][] = [
  // Bitcoin corridors
  ['bitcoin', 'ethereum'], ['bitcoin', 'arbitrum'], ['bitcoin', 'base'],
  ['bitcoin', 'solana'], ['bitcoin', 'bsc'], ['bitcoin', 'avalanche'],
  // Monad corridors
  ['monad', 'ethereum'], ['monad', 'arbitrum'], ['monad', 'base'],
  ['monad', 'solana'], ['monad', 'bsc'],
  // MegaETH corridors
  ['megaeth', 'ethereum'], ['megaeth', 'arbitrum'], ['megaeth', 'base'], ['megaeth', 'optimism'],
  // Berachain corridors
  ['berachain', 'ethereum'], ['berachain', 'arbitrum'], ['berachain', 'base'],
  // Hyperliquid corridors
  ['hyperliquid', 'ethereum'], ['hyperliquid', 'arbitrum'],
  // Abstract, Unichain, Starknet ↔ major EVM (Tier 2 for better refresh)
  ['abstract', 'ethereum'], ['abstract', 'arbitrum'], ['abstract', 'base'],
  ['unichain', 'ethereum'], ['unichain', 'arbitrum'], ['unichain', 'base'],
  // More L2 ↔ Growth
  ['arbitrum', 'sonic'], ['arbitrum', 'mantle'],
  ['arbitrum', 'scroll'], ['base', 'sonic'],
  ['base', 'mantle'], ['base', 'scroll'], ['optimism', 'linea'],
  ['optimism', 'zksync'], ['optimism', 'avalanche'],
  // Monad/MegaETH secondary
  ['monad', 'optimism'], ['monad', 'polygon'], ['monad', 'avalanche'],
  ['megaeth', 'bsc'], ['megaeth', 'polygon'],
  // Cross L2
  ['polygon', 'linea'], ['polygon', 'zksync'],
  ['linea', 'zksync'], ['scroll', 'zksync'],
  ['bsc', 'polygon'],
  // Native-to-native: BERA↔SOL, etc. Asset 'ETH' = chain native in tokens.ts
  ['berachain', 'solana'],
];

/** Tier 3: everything else that's active. 300s refresh, 2 assets, $1K only */
// Not enumerated — computed as "all remaining pairs not in T1/T2"

// ═══════════════════════════════════════════
// ROUTE GENERATION
// ═══════════════════════════════════════════

const T1_ASSETS: readonly Asset[] = ['ETH', 'USDC', 'USDT'];
const T2_ASSETS: readonly Asset[] = ['ETH', 'USDC', 'USDT'];
const T3_ASSETS: readonly Asset[] = ['USDC', 'ETH'];  // Reduced for long-tail

// Use all three tiers for high-volume Tier 1 corridors as well
const T1_AMOUNTS = [50, 1000, 50000] as const;
const T2_AMOUNTS = [50, 1000, 50000] as const;
const T3_AMOUNTS = [50, 1000, 50000] as const;

/** Bitcoin has no native USDC/USDT — only ETH (bridges to BTC). Skip stablecoins. */
const BITCOIN_ASSETS: readonly Asset[] = ['ETH'];
/** Berachain may not have USDT — skip to avoid dead routes. */
const BERACHAIN_ASSETS: readonly Asset[] = ['ETH', 'USDC'];

/** Get assets for a corridor; filters out unsupported asset/chain combos. */
function assetsForCorridor(src: string, dst: string, baseAssets: readonly Asset[]): Asset[] {
  const hasBitcoin = src === 'bitcoin' || dst === 'bitcoin';
  const hasBerachain = src === 'berachain' || dst === 'berachain';
  if (hasBitcoin) {
    return baseAssets.filter((a) => BITCOIN_ASSETS.includes(a));
  }
  if (hasBerachain) {
    return baseAssets.filter((a) => BERACHAIN_ASSETS.includes(a));
  }
  return [...baseAssets];
}

/** Canonical key for a corridor (sorted alphabetically, undirected) */
function corridorKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Build the tier lookup: corridor → tier */
function buildTierMap(): Map<string, RefreshTier> {
  const map = new Map<string, RefreshTier>();
  for (const [a, b] of TIER1_CORRIDORS) {
    map.set(corridorKey(a, b), 1);
  }
  for (const [a, b] of TIER2_CORRIDORS) {
    const key = corridorKey(a, b);
    if (!map.has(key)) map.set(key, 2); // T1 takes precedence
  }
  return map;
}

const TIER_MAP = buildTierMap();

/** Get tier for a corridor. Returns 3 if not explicitly in T1/T2. */
export function getRouteTier(src: string, dst: string): RefreshTier {
  return TIER_MAP.get(corridorKey(src, dst)) ?? 3;
}

/** Generate ALL 870 directional routes with tier metadata */
export function generateAllRoutes(): Route[] {
  const routes: Route[] = [];

  for (const src of CHAIN_SLUGS) {
    for (const dst of CHAIN_SLUGS) {
      if (src === dst) continue; // Skip self-to-self

      const tier = getRouteTier(src, dst);
      const baseAssets = tier === 1 ? T1_ASSETS : tier === 2 ? T2_ASSETS : T3_ASSETS;
      const assets = assetsForCorridor(src, dst, baseAssets);
      const amounts = tier === 1 ? T1_AMOUNTS : tier === 2 ? T2_AMOUNTS : T3_AMOUNTS;

      if (assets.length === 0) continue; // Skip corridor entirely if no valid assets
      routes.push({ src, dst, tier, assets, amountTiers: amounts });
    }
  }

  return routes;
}

/** All 870 routes (cached) */
export const ALL_ROUTES: readonly Route[] = generateAllRoutes();

// ─── Derived stats ───

export const ROUTE_COUNT = ALL_ROUTES.length;

export const TIER1_ROUTES = ALL_ROUTES.filter(r => r.tier === 1);
export const TIER2_ROUTES = ALL_ROUTES.filter(r => r.tier === 2);
export const TIER3_ROUTES = ALL_ROUTES.filter(r => r.tier === 3);

export const REFRESH_INTERVALS: Record<RefreshTier, number> = {
  1: 60_000,    // 60 seconds
  2: 120_000,   // 2 minutes
  3: 300_000,   // 5 minutes
};

// ─── Route key helpers ───

export function routeId(src: string, dst: string): string {
  return `${src}:${dst}`;
}

export function fullRouteKey(src: string, dst: string, asset: Asset, tier: number): string {
  return `${src}:${dst}:${asset}:${tier}`;
}
