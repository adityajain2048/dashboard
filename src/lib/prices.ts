/**
 * Real-time native token prices via CoinGecko (no API key).
 * Refreshed at the start of each fetcher cycle; used for USD → token amount conversion.
 */
import { logger } from './logger.js';

/** Our chain slug → CoinGecko API coin id (https://api.coingecko.com/api/v3/coins/list) */
const CHAIN_TO_COINGECKO_ID: Record<string, string> = {
  ethereum: 'ethereum',
  arbitrum: 'ethereum',
  base: 'ethereum',
  optimism: 'ethereum',
  polygon: 'matic-network',
  bsc: 'binancecoin',
  avalanche: 'avalanche-2',
  sonic: 'ethereum',       // S token may not be listed; fallback ETH
  berachain: 'ethereum',   // BERA; fallback
  scroll: 'ethereum',
  linea: 'ethereum',
  zksync: 'ethereum',
  mantle: 'mantle',
  hyperliquid: 'hyperliquid',
  abstract: 'ethereum',
  unichain: 'ethereum',
  monad: 'ethereum',      // MON when listed
  megaeth: 'ethereum',
  solana: 'solana',
  bitcoin: 'bitcoin',
};

const COINGECKO_IDS = [...new Set(Object.values(CHAIN_TO_COINGECKO_ID))];
const CACHE_TTL_MS = 60_000; // refresh at most once per minute
const FALLBACK_ETH_PRICE = 2_500;

/** Chain-specific fallback when CoinGecko cache is empty (avalanche, bsc, etc. use native token price) */
const CHAIN_FALLBACK_NATIVE_PRICE: Record<string, number> = {
  'avalanche': 35,   // AVAX
  'bsc': 700,       // BNB
  'polygon': 0.5,   // POL
  'sonic': 2_500,   // S (fallback to ETH)
  'berachain': 0.1, // BERA
  'mantle': 0.6,    // MNT
  'hyperliquid': 25, // HYPE
  'monad': 2_500,   // MON (fallback)
};

let cache: Record<string, number> = {};
let lastFetchMs = 0;

/**
 * Fetch native token prices from CoinGecko (free, no key). Updates in-memory cache.
 */
export async function refreshNativePrices(): Promise<void> {
  const now = Date.now();
  if (now - lastFetchMs < CACHE_TTL_MS) return;

  const ids = COINGECKO_IDS.join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) {
      logger.warn({ status: res.status }, 'CoinGecko price fetch failed');
      return;
    }
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const next: Record<string, number> = {};
    for (const [id, val] of Object.entries(data)) {
      if (typeof val?.usd === 'number' && val.usd > 0) next[id] = val.usd;
    }
    cache = next;
    lastFetchMs = now;
    logger.debug({ coins: Object.keys(next).length }, 'Native prices updated from CoinGecko');
  } catch (e) {
    clearTimeout(t);
    logger.warn({ err: e instanceof Error ? e.message : e }, 'CoinGecko price fetch error');
  }
}

/**
 * USD price for a chain's native token. Uses cache from last refresh.
 * When cache is empty, uses chain-specific fallback (AVAX ~35, BNB ~700) so input amounts are correct.
 */
export function getNativePriceUsd(chainSlug: string): number {
  const id = CHAIN_TO_COINGECKO_ID[chainSlug];
  if (!id) return CHAIN_FALLBACK_NATIVE_PRICE[chainSlug] ?? FALLBACK_ETH_PRICE;
  const price = cache[id];
  if (typeof price === 'number' && price > 0) return price;
  return CHAIN_FALLBACK_NATIVE_PRICE[chainSlug] ?? FALLBACK_ETH_PRICE;
}
