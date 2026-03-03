export interface ChainMeta {
  id: string;
  name: string;
  abbr: string;
  color: string;
  type: 'L1' | 'L2' | 'Non-EVM';
  tier: 1 | 2 | 3;
  chainId?: number | string;
  isNew?: boolean;
  /** Native token symbol for this chain (ETH, BNB, SOL, etc.) — used for native-to-native display */
  nativeToken: string;
}

export const CHAIN_META: Record<string, ChainMeta> = {
  // Tier 1 — High Volume
  ethereum:    { id: 'ethereum',    name: 'Ethereum',   abbr: 'ETH', color: '#627EEA', type: 'L1',      tier: 1, chainId: 1,      nativeToken: 'ETH' },
  arbitrum:    { id: 'arbitrum',    name: 'Arbitrum',   abbr: 'ARB', color: '#28A0F0', type: 'L2',      tier: 1, chainId: 42161, nativeToken: 'ETH' },
  base:        { id: 'base',        name: 'Base',       abbr: 'BAS', color: '#0052FF', type: 'L2',      tier: 1, chainId: 8453,  nativeToken: 'ETH' },
  optimism:    { id: 'optimism',    name: 'Optimism',   abbr: 'OP',  color: '#FF0420', type: 'L2',      tier: 1, chainId: 10,   nativeToken: 'ETH' },
  polygon:     { id: 'polygon',     name: 'Polygon',    abbr: 'POL', color: '#8247E5', type: 'L1',      tier: 1, chainId: 137,   nativeToken: 'POL' },
  bsc:         { id: 'bsc',         name: 'BNB Chain',  abbr: 'BNB', color: '#F0B90B', type: 'L1',      tier: 1, chainId: 56,   nativeToken: 'BNB' },
  solana:      { id: 'solana',      name: 'Solana',     abbr: 'SOL', color: '#9945FF', type: 'Non-EVM', tier: 1,                nativeToken: 'SOL' },

  // Tier 2 — Medium Volume
  avalanche:   { id: 'avalanche',   name: 'Avalanche',  abbr: 'AVA', color: '#E84142', type: 'L1',      tier: 2, chainId: 43114, nativeToken: 'AVAX' },
  monad:       { id: 'monad',       name: 'Monad',      abbr: 'MON', color: '#836EF9', type: 'L2',      tier: 2, chainId: 143,  nativeToken: 'MON', isNew: true },
  megaeth:     { id: 'megaeth',     name: 'MegaETH',    abbr: 'MEG', color: '#00E5FF', type: 'L2',      tier: 2, chainId: 4326, nativeToken: 'ETH', isNew: true },
  bitcoin:     { id: 'bitcoin',     name: 'Bitcoin',    abbr: 'BTC', color: '#F7931A', type: 'Non-EVM', tier: 2,                nativeToken: 'BTC' },
  linea:       { id: 'linea',       name: 'Linea',      abbr: 'LNA', color: '#61DFFF', type: 'L2',      tier: 2, chainId: 59144, nativeToken: 'ETH' },
  zksync:      { id: 'zksync',      name: 'zkSync',     abbr: 'ZKS', color: '#4E529A', type: 'L2',      tier: 2, chainId: 324,   nativeToken: 'ETH' },
  scroll:      { id: 'scroll',      name: 'Scroll',     abbr: 'SCR', color: '#FFEEDA', type: 'L2',      tier: 2, chainId: 534352, nativeToken: 'ETH' },
  sonic:       { id: 'sonic',       name: 'Sonic',      abbr: 'S',   color: '#1DB954', type: 'L1',      tier: 2, chainId: 146,  nativeToken: 'S' },
  mantle:      { id: 'mantle',      name: 'Mantle',     abbr: 'MNT', color: '#65B3AE', type: 'L2',      tier: 2, chainId: 5000,  nativeToken: 'MNT' },

  // Tier 3 — Long Tail
  berachain:   { id: 'berachain',   name: 'Berachain',  abbr: 'BER', color: '#804A26', type: 'L1',      tier: 3, chainId: 80094, nativeToken: 'BERA' },
  hyperliquid: { id: 'hyperliquid', name: 'HyperEVM',   abbr: 'HL',  color: '#00FF88', type: 'L2',      tier: 3, chainId: 999,   nativeToken: 'HYPE' },
  abstract:    { id: 'abstract',    name: 'Abstract',   abbr: 'ABS', color: '#5C6BC0', type: 'L2',      tier: 3, chainId: 2741,  nativeToken: 'ETH' },
  unichain:    { id: 'unichain',    name: 'Unichain',   abbr: 'UNI', color: '#FF007A', type: 'L2',      tier: 3, chainId: 130,   nativeToken: 'ETH' },
};

export const HEATMAP_ORDER: readonly string[] = [
  'ethereum', 'arbitrum', 'base', 'solana', 'bsc',
  'optimism', 'polygon', 'avalanche', 'bitcoin',
  'monad', 'megaeth',
  'linea', 'zksync', 'scroll', 'sonic', 'mantle',
  'berachain', 'abstract', 'unichain', 'hyperliquid',
];

export const CHAIN_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(CHAIN_META).map(c => [c.id, c.name])
);

export function getChainMeta(slug: string): ChainMeta {
  return CHAIN_META[slug] ?? { id: slug, name: slug, abbr: slug.slice(0, 3).toUpperCase(), color: '#555', type: 'L1' as const, tier: 3 as const, nativeToken: 'ETH' };
}

/** Display symbol for "you receive" — native token of dst chain when asset is ETH, else asset (USDC/USDT). */
export function getReceiveSymbol(asset: string, dstChainSlug: string): string {
  if (asset === 'ETH') return getChainMeta(dstChainSlug).nativeToken;
  return asset;
}

/** Display symbol for asset on a chain — when asset is ETH, use chain's native (HYPE, BNB, etc.). */
export function getAssetSymbol(asset: string, chainSlug: string): string {
  if (asset === 'ETH') return getChainMeta(chainSlug).nativeToken;
  return asset;
}
