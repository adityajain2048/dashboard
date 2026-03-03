// src/config/chains.ts
import type { Chain } from '../types/index.js';

export const CHAINS: Record<string, Chain> = {
  // ═══════════════════════════════════════════
  // EVM L1s (6)
  // ═══════════════════════════════════════════
  ethereum:    { id: 'ethereum',    chainId: 1,      name: 'Ethereum',     type: 'evm-l1',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://etherscan.io' },
  bsc:         { id: 'bsc',         chainId: 56,     name: 'BNB Chain',    type: 'evm-l1',  nativeToken: 'BNB',  nativeDecimals: 18, explorerUrl: 'https://bscscan.com' },
  avalanche:   { id: 'avalanche',   chainId: 43114,  name: 'Avalanche',    type: 'evm-l1',  nativeToken: 'AVAX', nativeDecimals: 18, explorerUrl: 'https://snowtrace.io' },
  polygon:     { id: 'polygon',     chainId: 137,    name: 'Polygon',      type: 'evm-l1',  nativeToken: 'POL',  nativeDecimals: 18, explorerUrl: 'https://polygonscan.com' },
  sonic:       { id: 'sonic',       chainId: 146,    name: 'Sonic',        type: 'evm-l1',  nativeToken: 'S',    nativeDecimals: 18, explorerUrl: 'https://sonicscan.org' },
  berachain:   { id: 'berachain',   chainId: 80094,  name: 'Berachain',    type: 'evm-l1',  nativeToken: 'BERA', nativeDecimals: 18, explorerUrl: 'https://berascan.io' },

  // ═══════════════════════════════════════════
  // EVM L2s / Rollups (14)
  // ═══════════════════════════════════════════
  arbitrum:    { id: 'arbitrum',    chainId: 42161,  name: 'Arbitrum',     type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://arbiscan.io' },
  optimism:    { id: 'optimism',    chainId: 10,     name: 'Optimism',     type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://optimistic.etherscan.io' },
  base:        { id: 'base',        chainId: 8453,   name: 'Base',         type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://basescan.org' },
  scroll:      { id: 'scroll',      chainId: 534352, name: 'Scroll',       type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://scrollscan.com' },
  linea:       { id: 'linea',       chainId: 59144,  name: 'Linea',        type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://lineascan.build' },
  zksync:      { id: 'zksync',      chainId: 324,    name: 'zkSync Era',   type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://explorer.zksync.io' },
  mantle:      { id: 'mantle',      chainId: 5000,   name: 'Mantle',       type: 'evm-l2',  nativeToken: 'MNT',  nativeDecimals: 18, explorerUrl: 'https://mantlescan.xyz' },
  hyperliquid: { id: 'hyperliquid', chainId: 999,    name: 'HyperEVM',     type: 'evm-l2',  nativeToken: 'HYPE', nativeDecimals: 18, explorerUrl: 'https://hyperscan.com', bungeeChainId: 9 },
  abstract:    { id: 'abstract',    chainId: 2741,   name: 'Abstract',     type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://abscan.org' },
  unichain:    { id: 'unichain',    chainId: 130,    name: 'Unichain',     type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://uniscan.xyz' },
  monad:       { id: 'monad',       chainId: 143,    name: 'Monad',        type: 'evm-l2',  nativeToken: 'MON',  nativeDecimals: 18, explorerUrl: 'https://monadvision.com' },
  megaeth:     { id: 'megaeth',     chainId: 4326,   name: 'MegaETH',      type: 'evm-l2',  nativeToken: 'ETH',  nativeDecimals: 18, explorerUrl: 'https://megaexplorer.xyz' },

  // ═══════════════════════════════════════════
  // Non-EVM (2)
  // ═══════════════════════════════════════════
  solana:      { id: 'solana',      chainId: 'solana',     name: 'Solana',    type: 'non-evm', nativeToken: 'SOL',  nativeDecimals: 9,  explorerUrl: 'https://solscan.io', lifiChainId: 1151111081099710 },
  bitcoin:     { id: 'bitcoin',     chainId: 'bitcoin',    name: 'Bitcoin',   type: 'non-evm', nativeToken: 'BTC',  nativeDecimals: 8,  explorerUrl: 'https://mempool.space', lifiChainId: 20000000000001 },
} as const;

// ─── Derived lookups ───

export const CHAIN_SLUGS = Object.keys(CHAINS) as readonly string[];
export const CHAIN_COUNT = CHAIN_SLUGS.length; // 22

export const EVM_CHAINS = CHAIN_SLUGS.filter(s => CHAINS[s].type !== 'non-evm');
export const NON_EVM_CHAINS = CHAIN_SLUGS.filter(s => CHAINS[s].type === 'non-evm');

/** Get chain by EVM chainId (number) */
export function getChainByChainId(chainId: number): Chain | undefined {
  return Object.values(CHAINS).find(c => c.chainId === chainId);
}

/** Get chain by slug */
export function getChain(slug: string): Chain {
  const chain = CHAINS[slug];
  if (!chain) throw new Error(`Unknown chain: ${slug}`);
  return chain;
}

/** Ordered chain slugs for heatmap display (mega chains first, then by type) */
export const HEATMAP_ORDER: readonly string[] = [
  // Mega
  'ethereum', 'arbitrum', 'base', 'solana', 'bsc',
  // Major
  'optimism', 'polygon', 'avalanche', 'bitcoin',
  // High-growth
  'monad', 'megaeth',
  // Growth L2s
  'linea', 'zksync', 'scroll', 'sonic', 'mantle',
  // Emerging EVM
  'berachain', 'abstract', 'unichain', 'hyperliquid',
]; // Non-EVM: solana, bitcoin only
