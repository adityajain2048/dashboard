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

  // ─── Additional EVM chains (Squid-supported) ───
  blast:       { id: 'blast',       chainId: 81457,  name: 'Blast',           type: 'evm-l2',  nativeToken: 'ETH',   nativeDecimals: 18, explorerUrl: 'https://blastscan.io' },
  celo:        { id: 'celo',        chainId: 42220,  name: 'Celo',            type: 'evm-l1',  nativeToken: 'CELO',  nativeDecimals: 18, explorerUrl: 'https://celoscan.io' },
  fantom:      { id: 'fantom',      chainId: 250,    name: 'Fantom',          type: 'evm-l1',  nativeToken: 'FTM',   nativeDecimals: 18, explorerUrl: 'https://ftmscan.com' },
  fraxtal:     { id: 'fraxtal',     chainId: 252,    name: 'Fraxtal',         type: 'evm-l2',  nativeToken: 'frxETH',nativeDecimals: 18, explorerUrl: 'https://fraxscan.com' },
  gnosis:      { id: 'gnosis',      chainId: 100,    name: 'Gnosis',          type: 'evm-l1',  nativeToken: 'xDAI',  nativeDecimals: 18, explorerUrl: 'https://gnosisscan.io' },
  hedera:      { id: 'hedera',      chainId: 295,    name: 'HEDERA',          type: 'evm-l1',  nativeToken: 'HBAR',  nativeDecimals: 8,  explorerUrl: 'https://hashscan.io' },
  filecoin:    { id: 'filecoin',    chainId: 314,    name: 'Filecoin',        type: 'evm-l1',  nativeToken: 'FIL',   nativeDecimals: 18, explorerUrl: 'https://filfox.info' },
  immutable:   { id: 'immutable',   chainId: 13371,  name: 'Immutable zkEVM', type: 'evm-l2',  nativeToken: 'IMX',   nativeDecimals: 18, explorerUrl: 'https://explorer.immutable.com' },
  kava:        { id: 'kava',        chainId: 2222,   name: 'Kava EVM',        type: 'evm-l1',  nativeToken: 'KAVA',  nativeDecimals: 18, explorerUrl: 'https://kavascan.io' },
  moonbeam:    { id: 'moonbeam',    chainId: 1284,   name: 'Moonbeam',        type: 'evm-l1',  nativeToken: 'GLMR',  nativeDecimals: 18, explorerUrl: 'https://moonscan.io' },
  peaq:        { id: 'peaq',        chainId: 3338,   name: 'Peaq',            type: 'evm-l1',  nativeToken: 'PEAQ',  nativeDecimals: 18, explorerUrl: 'https://peaq.subscan.io' },
  soneium:     { id: 'soneium',     chainId: 1868,   name: 'Soneium',         type: 'evm-l2',  nativeToken: 'ETH',   nativeDecimals: 18, explorerUrl: 'https://soneium.blockscout.com' },

  // ═══════════════════════════════════════════
  // Non-EVM — Solana / Bitcoin
  // ═══════════════════════════════════════════
  solana:      { id: 'solana',      chainId: 'solana',     name: 'Solana',    type: 'non-evm', nativeToken: 'SOL',  nativeDecimals: 9,  explorerUrl: 'https://solscan.io', lifiChainId: 1151111081099710, squidChainId: 'solana-mainnet-beta' },
  bitcoin:     { id: 'bitcoin',     chainId: 'bitcoin',    name: 'Bitcoin',   type: 'non-evm', nativeToken: 'BTC',  nativeDecimals: 8,  explorerUrl: 'https://mempool.space', lifiChainId: 20000000000001 },

  // ═══════════════════════════════════════════
  // Non-EVM — Sui
  // ═══════════════════════════════════════════
  sui:         { id: 'sui',         chainId: 'sui-mainnet',name: 'Sui',       type: 'non-evm', nativeToken: 'SUI',  nativeDecimals: 9,  explorerUrl: 'https://suiscan.xyz' },

  // ═══════════════════════════════════════════
  // Non-EVM — Cosmos IBC chains
  // ═══════════════════════════════════════════
  osmosis:     { id: 'osmosis',     chainId: 'osmosis-1',        name: 'Osmosis',    type: 'non-evm', nativeToken: 'OSMO', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/osmosis' },
  noble:       { id: 'noble',       chainId: 'noble-1',          name: 'Noble',      type: 'non-evm', nativeToken: 'USDC', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/noble' },
  neutron:     { id: 'neutron',     chainId: 'neutron-1',        name: 'Neutron',    type: 'non-evm', nativeToken: 'NTRN', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/neutron' },
  dydx:        { id: 'dydx',        chainId: 'dydx-mainnet-1',   name: 'DYDX',       type: 'non-evm', nativeToken: 'DYDX', nativeDecimals: 18, explorerUrl: 'https://www.mintscan.io/dydx' },
  sei:         { id: 'sei',         chainId: 'pacific-1',        name: 'Sei',        type: 'non-evm', nativeToken: 'SEI',  nativeDecimals: 6,  explorerUrl: 'https://www.seiscan.app' },
  cosmoshub:   { id: 'cosmoshub',   chainId: 'cosmoshub-4',      name: 'Cosmos Hub', type: 'non-evm', nativeToken: 'ATOM', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/cosmos' },
  kujira:      { id: 'kujira',      chainId: 'kaiyo-1',          name: 'Kujira',     type: 'non-evm', nativeToken: 'KUJI', nativeDecimals: 6,  explorerUrl: 'https://finder.kujira.network' },
  terra:       { id: 'terra',       chainId: 'phoenix-1',        name: 'Terra',      type: 'non-evm', nativeToken: 'LUNA', nativeDecimals: 6,  explorerUrl: 'https://finder.terra.money' },
  injective:   { id: 'injective',   chainId: 'injective-1',      name: 'Injective',  type: 'non-evm', nativeToken: 'INJ',  nativeDecimals: 18, explorerUrl: 'https://explorer.injective.network' },
  stargaze:    { id: 'stargaze',    chainId: 'stargaze-1',       name: 'Stargaze',   type: 'non-evm', nativeToken: 'STARS',nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/stargaze' },
  juno:        { id: 'juno',        chainId: 'juno-1',           name: 'Juno',       type: 'non-evm', nativeToken: 'JUNO', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/juno' },
  axelar:      { id: 'axelar',      chainId: 'axelar-dojo-1',    name: 'Axelar',     type: 'non-evm', nativeToken: 'AXL',  nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/axelar' },
  celestia:    { id: 'celestia',    chainId: 'celestia',         name: 'Celestia',   type: 'non-evm', nativeToken: 'TIA',  nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/celestia' },
  dymension:   { id: 'dymension',   chainId: 'dymension_1100-1', name: 'Dymension',  type: 'non-evm', nativeToken: 'DYM',  nativeDecimals: 18, explorerUrl: 'https://www.mintscan.io/dymension' },
  stride:      { id: 'stride',      chainId: 'stride-1',         name: 'Stride',     type: 'non-evm', nativeToken: 'STRD', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/stride' },
  agoric:      { id: 'agoric',      chainId: 'agoric-3',         name: 'Agoric',     type: 'non-evm', nativeToken: 'BLD',  nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/agoric' },
  akash:       { id: 'akash',       chainId: 'akashnet-2',       name: 'Akash',      type: 'non-evm', nativeToken: 'AKT',  nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/akash' },
  archway:     { id: 'archway',     chainId: 'archway-1',        name: 'Archway',    type: 'non-evm', nativeToken: 'ARCH', nativeDecimals: 18, explorerUrl: 'https://www.mintscan.io/archway' },
  xion:        { id: 'xion',        chainId: 'xion-mainnet-1',   name: 'Xion',       type: 'non-evm', nativeToken: 'XION', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/xion' },
  elys:        { id: 'elys',        chainId: 'elys-1',           name: 'Elys',       type: 'non-evm', nativeToken: 'ELYS', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/elys' },
  persistence: { id: 'persistence', chainId: 'core-1',           name: 'Persistence',type: 'non-evm', nativeToken: 'XPRT', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/persistence' },
  saga:        { id: 'saga',        chainId: 'ssc-1',            name: 'Saga',       type: 'non-evm', nativeToken: 'SAGA', nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/saga' },
  migaloo:     { id: 'migaloo',     chainId: 'migaloo-1',        name: 'Migaloo',    type: 'non-evm', nativeToken: 'WHALE',nativeDecimals: 6,  explorerUrl: 'https://www.mintscan.io/migaloo' },
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
