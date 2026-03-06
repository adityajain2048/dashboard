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
  polygon: 'polygon-ecosystem-token',   // POL (ex-MATIC); 'matic-network' deprecated
  bsc: 'binancecoin',
  avalanche: 'avalanche-2',
  sonic: 'sonic-3',                     // Sonic S token (chain native); 'sonic' is a different coin
  berachain: 'berachain-bera',           // BERA native token
  scroll: 'ethereum',
  linea: 'ethereum',
  zksync: 'ethereum',
  mantle: 'mantle',
  hyperliquid: 'hyperliquid',
  abstract: 'ethereum',
  unichain: 'ethereum',
  monad: 'monad',                       // MON native token
  megaeth: 'ethereum',
  solana: 'solana',
  bitcoin: 'bitcoin',
};

const COINGECKO_IDS = [...new Set(Object.values(CHAIN_TO_COINGECKO_ID))];
const CACHE_TTL_MS = 60_000; // refresh at most once per minute
const FALLBACK_ETH_PRICE = 2_500;

/** Chain-specific fallback when CoinGecko cache is empty.
 *  Updated 2026-03-06 to match approximate market prices. */
const CHAIN_FALLBACK_NATIVE_PRICE: Record<string, number> = {
  'avalanche': 10,    // AVAX (~$9-10 as of Mar 2026)
  'bsc': 650,         // BNB
  'polygon': 0.10,    // POL (ex-MATIC, ~$0.10)
  'sonic': 0.04,      // S (Sonic native, ~$0.04)
  'berachain': 0.50,  // BERA (~$0.54 as of Mar 2026)
  'mantle': 0.70,     // MNT
  'hyperliquid': 30,  // HYPE
  'monad': 0.02,      // MON (~$0.022 as of Mar 2026)
  'bitcoin': 70_000,  // BTC (~$70k as of Mar 2026)
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
