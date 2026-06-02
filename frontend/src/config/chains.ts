export interface ChainMeta {
  id: string;
  name: string;
  abbr: string;
  color: string;
  type: 'L1' | 'L2' | 'Non-EVM' | 'Cosmos';
  tier: 1 | 2 | 3;
  chainId?: number | string;
  isNew?: boolean;
  /** Native token symbol for this chain */
  nativeToken: string;
}

export const CHAIN_META: Record<string, ChainMeta> = {
  // ─── Tier 1: High Volume EVM + Non-EVM ───────────────────────────────────
  ethereum:    { id: 'ethereum',    name: 'Ethereum',    abbr: 'ETH',  color: '#627EEA', type: 'L1',     tier: 1, chainId: 1,       nativeToken: 'ETH'   },
  arbitrum:    { id: 'arbitrum',    name: 'Arbitrum',    abbr: 'ARB',  color: '#28A0F0', type: 'L2',     tier: 1, chainId: 42161,   nativeToken: 'ETH'   },
  base:        { id: 'base',        name: 'Base',        abbr: 'BAS',  color: '#0052FF', type: 'L2',     tier: 1, chainId: 8453,    nativeToken: 'ETH'   },
  optimism:    { id: 'optimism',    name: 'Optimism',    abbr: 'OP',   color: '#FF0420', type: 'L2',     tier: 1, chainId: 10,      nativeToken: 'ETH'   },
  polygon:     { id: 'polygon',     name: 'Polygon',     abbr: 'POL',  color: '#8247E5', type: 'L1',     tier: 1, chainId: 137,     nativeToken: 'POL'   },
  bsc:         { id: 'bsc',         name: 'BNB Chain',   abbr: 'BNB',  color: '#F0B90B', type: 'L1',     tier: 1, chainId: 56,      nativeToken: 'BNB'   },
  solana:      { id: 'solana',      name: 'Solana',      abbr: 'SOL',  color: '#9945FF', type: 'Non-EVM',tier: 1,                   nativeToken: 'SOL'   },

  // ─── Tier 2: Medium Volume ────────────────────────────────────────────────
  avalanche:   { id: 'avalanche',   name: 'Avalanche',   abbr: 'AVA',  color: '#E84142', type: 'L1',     tier: 2, chainId: 43114,   nativeToken: 'AVAX'  },
  bitcoin:     { id: 'bitcoin',     name: 'Bitcoin',     abbr: 'BTC',  color: '#F7931A', type: 'Non-EVM',tier: 2,                   nativeToken: 'BTC'   },
  monad:       { id: 'monad',       name: 'Monad',       abbr: 'MON',  color: '#836EF9', type: 'L2',     tier: 2, chainId: 143,     nativeToken: 'MON',  isNew: true },
  megaeth:     { id: 'megaeth',     name: 'MegaETH',     abbr: 'MEG',  color: '#00E5FF', type: 'L2',     tier: 2, chainId: 4326,    nativeToken: 'ETH',  isNew: true },
  linea:       { id: 'linea',       name: 'Linea',       abbr: 'LNA',  color: '#61DFFF', type: 'L2',     tier: 2, chainId: 59144,   nativeToken: 'ETH'   },
  zksync:      { id: 'zksync',      name: 'zkSync',      abbr: 'ZKS',  color: '#4E529A', type: 'L2',     tier: 2, chainId: 324,     nativeToken: 'ETH'   },
  scroll:      { id: 'scroll',      name: 'Scroll',      abbr: 'SCR',  color: '#FFEEDA', type: 'L2',     tier: 2, chainId: 534352,  nativeToken: 'ETH'   },
  sonic:       { id: 'sonic',       name: 'Sonic',       abbr: 'S',    color: '#1DB954', type: 'L1',     tier: 2, chainId: 146,     nativeToken: 'S'     },
  mantle:      { id: 'mantle',      name: 'Mantle',      abbr: 'MNT',  color: '#65B3AE', type: 'L2',     tier: 2, chainId: 5000,    nativeToken: 'MNT'   },
  berachain:   { id: 'berachain',   name: 'Berachain',   abbr: 'BER',  color: '#804A26', type: 'L1',     tier: 2, chainId: 80094,   nativeToken: 'BERA'  },
  hyperliquid: { id: 'hyperliquid', name: 'HyperEVM',    abbr: 'HL',   color: '#00FF88', type: 'L2',     tier: 2, chainId: 999,     nativeToken: 'HYPE'  },
  abstract:    { id: 'abstract',    name: 'Abstract',    abbr: 'ABS',  color: '#5C6BC0', type: 'L2',     tier: 2, chainId: 2741,    nativeToken: 'ETH'   },
  unichain:    { id: 'unichain',    name: 'Unichain',    abbr: 'UNI',  color: '#FF007A', type: 'L2',     tier: 2, chainId: 130,     nativeToken: 'ETH'   },

  // ─── Tier 3: Long-tail EVM ────────────────────────────────────────────────
  blast:       { id: 'blast',       name: 'Blast',       abbr: 'BLA',  color: '#FCFC03', type: 'L2',     tier: 3, chainId: 81457,   nativeToken: 'ETH'   },
  celo:        { id: 'celo',        name: 'Celo',        abbr: 'CEL',  color: '#35D07F', type: 'L1',     tier: 3, chainId: 42220,   nativeToken: 'CELO'  },
  fantom:      { id: 'fantom',      name: 'Fantom',      abbr: 'FTM',  color: '#1969FF', type: 'L1',     tier: 3, chainId: 250,     nativeToken: 'FTM'   },
  fraxtal:     { id: 'fraxtal',     name: 'Fraxtal',     abbr: 'FRX',  color: '#000000', type: 'L2',     tier: 3, chainId: 252,     nativeToken: 'frxETH'},
  gnosis:      { id: 'gnosis',      name: 'Gnosis',      abbr: 'GNO',  color: '#048A81', type: 'L1',     tier: 3, chainId: 100,     nativeToken: 'xDAI'  },
  hedera:      { id: 'hedera',      name: 'Hedera',      abbr: 'HED',  color: '#222222', type: 'L1',     tier: 3, chainId: 295,     nativeToken: 'HBAR'  },
  filecoin:    { id: 'filecoin',    name: 'Filecoin',    abbr: 'FIL',  color: '#0090FF', type: 'L1',     tier: 3, chainId: 314,     nativeToken: 'FIL'   },
  immutable:   { id: 'immutable',   name: 'Immutable',   abbr: 'IMX',  color: '#17B5CB', type: 'L2',     tier: 3, chainId: 13371,   nativeToken: 'IMX'   },
  kava:        { id: 'kava',        name: 'Kava',        abbr: 'KAV',  color: '#FF433E', type: 'L1',     tier: 3, chainId: 2222,    nativeToken: 'KAVA'  },
  moonbeam:    { id: 'moonbeam',    name: 'Moonbeam',    abbr: 'GLM',  color: '#53CBC9', type: 'L1',     tier: 3, chainId: 1284,    nativeToken: 'GLMR'  },
  peaq:        { id: 'peaq',        name: 'Peaq',        abbr: 'PEQ',  color: '#00C896', type: 'L1',     tier: 3, chainId: 3338,    nativeToken: 'PEAQ'  },
  soneium:     { id: 'soneium',     name: 'Soneium',     abbr: 'SON',  color: '#9966FF', type: 'L2',     tier: 3, chainId: 1868,    nativeToken: 'ETH'   },
  sui:         { id: 'sui',         name: 'Sui',         abbr: 'SUI',  color: '#4DA2FF', type: 'Non-EVM',tier: 3,                   nativeToken: 'SUI'   },

  // ─── Tier 3: Cosmos / IBC ─────────────────────────────────────────────────
  osmosis:     { id: 'osmosis',     name: 'Osmosis',     abbr: 'OSM',  color: '#750BBB', type: 'Cosmos', tier: 3,                   nativeToken: 'OSMO'  },
  cosmoshub:   { id: 'cosmoshub',   name: 'Cosmos Hub',  abbr: 'ATM',  color: '#2E3148', type: 'Cosmos', tier: 3,                   nativeToken: 'ATOM'  },
  neutron:     { id: 'neutron',     name: 'Neutron',     abbr: 'NTR',  color: '#1C1C1C', type: 'Cosmos', tier: 3,                   nativeToken: 'NTRN'  },
  dydx:        { id: 'dydx',        name: 'dYdX',        abbr: 'DYX',  color: '#6966FF', type: 'Cosmos', tier: 3,                   nativeToken: 'DYDX'  },
  sei:         { id: 'sei',         name: 'Sei',         abbr: 'SEI',  color: '#9D2235', type: 'Cosmos', tier: 3,                   nativeToken: 'SEI'   },
  injective:   { id: 'injective',   name: 'Injective',   abbr: 'INJ',  color: '#00A3FF', type: 'Cosmos', tier: 3,                   nativeToken: 'INJ'   },
  celestia:    { id: 'celestia',    name: 'Celestia',    abbr: 'TIA',  color: '#7B2FBE', type: 'Cosmos', tier: 3,                   nativeToken: 'TIA'   },
  axelar:      { id: 'axelar',      name: 'Axelar',      abbr: 'AXL',  color: '#FF4D00', type: 'Cosmos', tier: 3,                   nativeToken: 'AXL'   },
  kujira:      { id: 'kujira',      name: 'Kujira',      abbr: 'KUJ',  color: '#E53935', type: 'Cosmos', tier: 3,                   nativeToken: 'KUJI'  },
  terra:       { id: 'terra',       name: 'Terra',       abbr: 'LUN',  color: '#0E3CA5', type: 'Cosmos', tier: 3,                   nativeToken: 'LUNA'  },
  dymension:   { id: 'dymension',   name: 'Dymension',   abbr: 'DYM',  color: '#FF6B35', type: 'Cosmos', tier: 3,                   nativeToken: 'DYM'   },
  stargaze:    { id: 'stargaze',    name: 'Stargaze',    abbr: 'SGZ',  color: '#DB2777', type: 'Cosmos', tier: 3,                   nativeToken: 'STARS' },
  akash:       { id: 'akash',       name: 'Akash',       abbr: 'AKT',  color: '#E74C3C', type: 'Cosmos', tier: 3,                   nativeToken: 'AKT'   },
  stride:      { id: 'stride',      name: 'Stride',      abbr: 'STR',  color: '#E91E8C', type: 'Cosmos', tier: 3,                   nativeToken: 'STRD'  },
  juno:        { id: 'juno',        name: 'Juno',        abbr: 'JNO',  color: '#F0827D', type: 'Cosmos', tier: 3,                   nativeToken: 'JUNO'  },
  noble:       { id: 'noble',       name: 'Noble',       abbr: 'NBL',  color: '#3B82F6', type: 'Cosmos', tier: 3,                   nativeToken: 'USDC'  },
  persistence: { id: 'persistence', name: 'Persistence', abbr: 'PER',  color: '#E5222A', type: 'Cosmos', tier: 3,                   nativeToken: 'XPRT'  },
  agoric:      { id: 'agoric',      name: 'Agoric',      abbr: 'AGR',  color: '#C11D1D', type: 'Cosmos', tier: 3,                   nativeToken: 'BLD'   },
  archway:     { id: 'archway',     name: 'Archway',     abbr: 'ARW',  color: '#FF6B00', type: 'Cosmos', tier: 3,                   nativeToken: 'ARCH'  },
  xion:        { id: 'xion',        name: 'Xion',        abbr: 'XIO',  color: '#6B21A8', type: 'Cosmos', tier: 3,                   nativeToken: 'XION'  },
  elys:        { id: 'elys',        name: 'Elys',        abbr: 'ELY',  color: '#10B981', type: 'Cosmos', tier: 3,                   nativeToken: 'ELYS'  },
  saga:        { id: 'saga',        name: 'Saga',        abbr: 'SAG',  color: '#7C3AED', type: 'Cosmos', tier: 3,                   nativeToken: 'SAGA'  },
  migaloo:     { id: 'migaloo',     name: 'Migaloo',     abbr: 'WHL',  color: '#0EA5E9', type: 'Cosmos', tier: 3,                   nativeToken: 'WHALE' },
};

export const HEATMAP_ORDER: readonly string[] = [
  // Tier 1 — always first
  'ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'bsc', 'solana',
  // Tier 2 — high volume non-EVM + major L2s
  'avalanche', 'bitcoin', 'monad', 'megaeth',
  'linea', 'zksync', 'scroll', 'sonic', 'mantle',
  'berachain', 'abstract', 'unichain', 'hyperliquid',
  // Tier 3 — long-tail EVM
  'blast', 'celo', 'fantom', 'fraxtal', 'gnosis', 'hedera',
  'filecoin', 'immutable', 'kava', 'moonbeam', 'peaq', 'soneium', 'sui',
  // Tier 3 — Cosmos / IBC
  'osmosis', 'cosmoshub', 'neutron', 'dydx', 'sei', 'injective',
  'celestia', 'axelar', 'kujira', 'terra', 'dymension',
  'stargaze', 'akash', 'stride', 'juno', 'noble',
  'persistence', 'agoric', 'archway', 'xion', 'elys', 'saga', 'migaloo',
];

/**
 * Chain logo URLs keyed by our chain slug.
 * Source: DeFi Llama icons CDN (icons.llamao.fi).
 * ChainChip falls back to brand-color + abbr on image load error.
 */
export const CHAIN_LOGOS: Record<string, string> = {
  // ─── Tier 1 ───────────────────────────────────────────────────────────────
  ethereum:    'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg',
  arbitrum:    'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg',
  base:        'https://icons.llamao.fi/icons/chains/rsz_base.jpg',
  optimism:    'https://icons.llamao.fi/icons/chains/rsz_optimism.jpg',
  polygon:     'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg',
  bsc:         'https://icons.llamao.fi/icons/chains/rsz_bsc.jpg',
  solana:      'https://icons.llamao.fi/icons/chains/rsz_solana.jpg',
  // ─── Tier 2 ───────────────────────────────────────────────────────────────
  avalanche:   'https://icons.llamao.fi/icons/chains/rsz_avax.jpg',
  bitcoin:     'https://icons.llamao.fi/icons/chains/rsz_bitcoin.jpg',
  monad:       'https://icons.llamao.fi/icons/chains/rsz_monad.jpg',
  megaeth:     'https://icons.llamao.fi/icons/chains/rsz_megaeth.jpg',
  linea:       'https://icons.llamao.fi/icons/chains/rsz_linea.jpg',
  zksync:      'https://icons.llamao.fi/icons/chains/rsz_era.jpg',
  scroll:      'https://icons.llamao.fi/icons/chains/rsz_scroll.jpg',
  sonic:       'https://icons.llamao.fi/icons/chains/rsz_sonic.jpg',
  mantle:      'https://icons.llamao.fi/icons/chains/rsz_mantle.jpg',
  berachain:   'https://icons.llamao.fi/icons/chains/rsz_berachain.jpg',
  hyperliquid: 'https://icons.llamao.fi/icons/chains/rsz_hyperliquid.jpg',
  abstract:    'https://icons.llamao.fi/icons/chains/rsz_abstract.jpg',
  unichain:    'https://icons.llamao.fi/icons/chains/rsz_unichain.jpg',
  // ─── Tier 3 EVM ───────────────────────────────────────────────────────────
  blast:       'https://icons.llamao.fi/icons/chains/rsz_blast.jpg',
  celo:        'https://icons.llamao.fi/icons/chains/rsz_celo.jpg',
  fantom:      'https://icons.llamao.fi/icons/chains/rsz_fantom.jpg',
  fraxtal:     'https://icons.llamao.fi/icons/chains/rsz_fraxtal.jpg',
  gnosis:      'https://icons.llamao.fi/icons/chains/rsz_xdai.jpg',
  hedera:      'https://icons.llamao.fi/icons/chains/rsz_hbar.jpg',
  filecoin:    'https://icons.llamao.fi/icons/chains/rsz_filecoin.jpg',
  immutable:   'https://icons.llamao.fi/icons/chains/rsz_immutablex.jpg',
  kava:        'https://icons.llamao.fi/icons/chains/rsz_kava.jpg',
  moonbeam:    'https://icons.llamao.fi/icons/chains/rsz_moonbeam.jpg',
  peaq:        'https://icons.llamao.fi/icons/chains/rsz_peaq.jpg',
  soneium:     'https://icons.llamao.fi/icons/chains/rsz_soneium.jpg',
  sui:         'https://icons.llamao.fi/icons/chains/rsz_sui.jpg',
  // ─── Tier 3 Cosmos / IBC ──────────────────────────────────────────────────
  osmosis:     'https://icons.llamao.fi/icons/chains/rsz_osmosis.jpg',
  cosmoshub:   'https://icons.llamao.fi/icons/chains/rsz_cosmos.jpg',
  neutron:     'https://icons.llamao.fi/icons/chains/rsz_neutron.jpg',
  dydx:        'https://icons.llamao.fi/icons/chains/rsz_dydx.jpg',
  sei:         'https://icons.llamao.fi/icons/chains/rsz_sei.jpg',
  injective:   'https://icons.llamao.fi/icons/chains/rsz_injective.jpg',
  celestia:    'https://icons.llamao.fi/icons/chains/rsz_celestia.jpg',
  axelar:      'https://icons.llamao.fi/icons/chains/rsz_axelar.jpg',
  kujira:      'https://icons.llamao.fi/icons/chains/rsz_kujira.jpg',
  terra:       'https://icons.llamao.fi/icons/chains/rsz_terra.jpg',
  dymension:   'https://icons.llamao.fi/icons/chains/rsz_dymension.jpg',
  stargaze:    'https://icons.llamao.fi/icons/chains/rsz_stargaze.jpg',
  akash:       'https://icons.llamao.fi/icons/chains/rsz_akash.jpg',
  stride:      'https://icons.llamao.fi/icons/chains/rsz_stride.jpg',
  juno:        'https://icons.llamao.fi/icons/chains/rsz_juno.jpg',
  noble:       'https://icons.llamao.fi/icons/chains/rsz_noble.jpg',
  persistence: 'https://icons.llamao.fi/icons/chains/rsz_persistence.jpg',
  agoric:      'https://icons.llamao.fi/icons/chains/rsz_agoric.jpg',
  archway:     'https://icons.llamao.fi/icons/chains/rsz_archway.jpg',
  xion:        'https://icons.llamao.fi/icons/chains/rsz_xion.jpg',
  elys:        'https://icons.llamao.fi/icons/chains/rsz_elys.jpg',
  saga:        'https://icons.llamao.fi/icons/chains/rsz_saga.jpg',
  migaloo:     'https://icons.llamao.fi/icons/chains/rsz_migaloo.jpg',
};

export const CHAIN_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(CHAIN_META).map(c => [c.id, c.name])
);

export function getChainMeta(slug: string): ChainMeta {
  return CHAIN_META[slug] ?? {
    id: slug,
    name: slug,
    abbr: slug.slice(0, 3).toUpperCase(),
    color: '#555',
    type: 'L1' as const,
    tier: 3 as const,
    nativeToken: 'ETH',
  };
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
