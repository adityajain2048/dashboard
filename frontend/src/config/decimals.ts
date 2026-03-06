/**
 * Decimals config for all chain+asset pairs.
 * Must stay in sync with backend src/config/tokens.ts.
 */
const CHAINS = [
  'ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'bsc', 'avalanche',
  'sonic', 'linea', 'zksync', 'scroll', 'mantle', 'berachain', 'hyperliquid',
  'abstract', 'unichain', 'monad', 'megaeth', 'solana', 'bitcoin',
] as const;

/** chain:asset → decimals. Special cases: BSC USDC/USDT 18, Solana ETH 9, Bitcoin ETH 8. */
const DECIMALS: Record<string, number> = {};
for (const chain of CHAINS) {
  DECIMALS[`${chain}:ETH`] = chain === 'solana' ? 9 : chain === 'bitcoin' ? 8 : 18;
  DECIMALS[`${chain}:USDC`] = chain === 'bsc' ? 18 : chain === 'megaeth' || chain === 'bitcoin' ? 0 : 6;
  DECIMALS[`${chain}:USDT`] = chain === 'bsc' ? 18 : chain === 'bitcoin' ? 0 : 6;
}

/** Default decimals by asset when chain is unknown. */
const ASSET_DEFAULTS: Record<string, number> = { ETH: 18, USDC: 6, USDT: 6 };

/**
 * Get decimals for a chain+asset pair.
 * Fallback: ethereum:asset → asset default → 18.
 */
export function getDecimals(chain: string, asset: string): number {
  const key = `${chain}:${asset}`;
  const dec = DECIMALS[key];
  if (dec !== undefined) return dec;
  const ethDec = DECIMALS[`ethereum:${asset}`];
  if (ethDec !== undefined) return ethDec;
  return ASSET_DEFAULTS[asset] ?? 18;
}
