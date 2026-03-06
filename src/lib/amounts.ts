/**
 * Convert amountTier (USD) to token amounts for aggregator/bridge API requests.
 * Uses real-time native prices from prices.ts when asset is ETH (native).
 */
import type { Asset } from '../types/index.js';
import { getNativePriceUsd } from './prices.js';

const MAX_ETH_PRICE = 1_000_000;

/** USD price for the given asset. For ETH/native, pass sourceChain to use live price.
 * Uses CoinGecko cache; falls back to chain-specific defaults in prices.ts. */
export function getTokenPriceUsd(asset: Asset, sourceChain?: string): number {
  if (asset === 'USDC' || asset === 'USDT') return 1;
  const price = sourceChain ? getNativePriceUsd(sourceChain) : getNativePriceUsd('ethereum');
  if (price <= 0 || price > MAX_ETH_PRICE) return 2500;
  return price;
}

/** Token amount (human) for a given USD tier. */
export function amountTierUsdToTokenAmount(
  amountTierUsd: number,
  asset: Asset,
  sourceChain?: string
): number {
  const price = getTokenPriceUsd(asset, sourceChain);
  return amountTierUsd / price;
}

/** From-amount in token base units (wei/smallest unit) for LI.FI, Bungee, Rango, Across, etc.
 *  Uses BigInt arithmetic to avoid scientific notation (e.g. 1000 BSC-USDC@18dec → "1e+21")
 *  which fails LI.FI's isBigNumberish validation. */
export function getFromAmountBase(
  amountTierUsd: number,
  asset: Asset,
  decimals: number,
  sourceChain?: string
): string {
  let tokenAmount = amountTierUsdToTokenAmount(amountTierUsd, asset, sourceChain);
  // Sanity: for ETH/native, $1000 should yield ~0.1–10 tokens. If we get dust, price is wrong.
  if (asset === 'ETH' && amountTierUsd >= 100 && tokenAmount < 0.0001) {
    tokenAmount = amountTierUsd / 2500; // fallback: assume $2500/ETH
  }
  // Scale to 8 decimal places first (stays within safe integer range for all realistic amounts)
  const SCALE = 8;
  const scaled = BigInt(Math.round(tokenAmount * 10 ** SCALE));
  const diff = decimals - SCALE;
  if (diff >= 0) {
    return (scaled * (10n ** BigInt(diff))).toString();
  } else {
    return (scaled / (10n ** BigInt(-diff))).toString();
  }
}

/** Compute output USD from raw amount (base units), decimals, and destination chain.
 *  Use this when aggregator USD values are unreliable (e.g. Bungee for BNB, AVAX, Linea, zkSync, Scroll). */
export function outputAmountToUsd(
  amountBase: string,
  decimals: number,
  asset: Asset,
  dstChain: string
): number {
  const price = asset === 'ETH' ? getNativePriceUsd(dstChain) : 1;
  const human = Number(amountBase) / 10 ** decimals;
  return human * price;
}

/** Convert a human-readable token amount string to base units (wei).
 *  e.g. humanToBase("0.95", 6) → "950000"
 *  Uses BigInt arithmetic to avoid floating-point precision loss. */
export function humanToBase(humanAmount: string, decimals: number): string {
  const num = Number(humanAmount);
  if (!Number.isFinite(num) || num <= 0) return '0';
  const SCALE = 8;
  const scaled = BigInt(Math.round(num * 10 ** SCALE));
  const diff = decimals - SCALE;
  if (diff >= 0) {
    return (scaled * (10n ** BigInt(diff))).toString();
  } else {
    return (scaled / (10n ** BigInt(-diff))).toString();
  }
}

/** Compute USD value of a base-unit amount using CoinGecko prices.
 *  For stablecoins, uses 1:1. For native tokens, uses live CoinGecko price.
 *  Returns a string with 8 decimal places (matching DB schema). */
export function computeAmountUsd(
  amountBase: string,
  decimals: number,
  asset: Asset,
  chain: string
): string {
  const price = getTokenPriceUsd(asset, chain);
  const human = Number(amountBase) / 10 ** decimals;
  return (human * price).toFixed(8);
}

/** From-amount as human string (e.g. "0.4") for APIs that expect token amount (Rubic, Relay, Mayan).
 *  NOT for NormalizedQuote storage — use getFromAmountBase() or humanToBase() for that. */
export function getFromAmountHuman(
  amountTierUsd: number,
  asset: Asset,
  sourceChain?: string
): string {
  const tokenAmount = amountTierUsdToTokenAmount(amountTierUsd, asset, sourceChain);
  if (tokenAmount >= 1e6) return String(Math.floor(tokenAmount));
  if (tokenAmount >= 1) return tokenAmount.toFixed(4);
  if (tokenAmount >= 0.0001) return tokenAmount.toFixed(6);
  return tokenAmount.toExponential(4);
}
