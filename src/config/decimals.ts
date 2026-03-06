/**
 * Central decimals config for all chain+asset pairs.
 * Derived from TOKENS — single source of truth for formatting and conversions.
 */
import { TOKENS } from './tokens.js';

/** chain:asset → decimals. Built from TOKENS. */
const DECIMALS_MAP = new Map<string, number>();
for (const t of TOKENS) {
  DECIMALS_MAP.set(`${t.chain}:${t.asset}`, t.decimals);
}

/** Default decimals by asset when chain is unknown (e.g. ETH 18, USDC 6, USDT 6). */
const ASSET_DEFAULTS: Record<string, number> = { ETH: 18, USDC: 6, USDT: 6 };

/**
 * Get decimals for a chain+asset pair.
 * Fallback: ethereum:asset → asset default → 18.
 */
export function getDecimals(chain: string, asset: string): number {
  const key = `${chain}:${asset}`;
  const dec = DECIMALS_MAP.get(key);
  if (dec !== undefined) return dec;
  const ethKey = `ethereum:${asset}`;
  const ethDec = DECIMALS_MAP.get(ethKey);
  if (ethDec !== undefined) return ethDec;
  return ASSET_DEFAULTS[asset] ?? 18;
}

/** Raw map for consumers that need full lookup. Key format: "chain:asset". */
export function getDecimalsMap(): ReadonlyMap<string, number> {
  return DECIMALS_MAP;
}
