// src/config/bridges.ts
import type { BridgeConfig, AggregatorConfig, AggregatorId } from '../types/index.js';

// ═══════════════════════════════════════════
// AGGREGATORS (query these first)
// ═══════════════════════════════════════════

export const AGGREGATORS: Record<AggregatorId, AggregatorConfig> = {
  lifi: {
    id: 'lifi',
    name: 'LI.FI',
    baseUrl: 'https://li.quest/v1',
    authHeader: 'x-lifi-api-key',
    envKey: null,  // Uses LIFI_API_KEY_1/2/3 rotation — see lifi.ts
    chainCount: 22,
    bridgeCount: 19,
  },
  rango: {
    id: 'rango',
    name: 'Rango',
    baseUrl: 'https://api.rango.exchange',
    authHeader: 'apiKey',  // query param, not header
    envKey: 'RANGO_API_KEY',
    chainCount: 18,
    bridgeCount: 22,
  },
  bungee: {
    id: 'bungee',
    name: 'Bungee (Socket)',
    baseUrl: 'https://api.socket.tech/v2',
    authHeader: 'API-KEY',
    envKey: 'BUNGEE_API_KEY',
    chainCount: 12,
    bridgeCount: 15,
  },
  rubic: {
    id: 'rubic',
    name: 'Rubic',
    baseUrl: 'https://api-v2.rubic.exchange/api',
    authHeader: null,  // no auth needed
    envKey: 'RUBIC_API_KEY',
    chainCount: 14,
    bridgeCount: 20,
  },
} as const;

export const AGGREGATOR_IDS = Object.keys(AGGREGATORS) as AggregatorId[];

// ═══════════════════════════════════════════
// BRIDGES (17 tracked)
// ═══════════════════════════════════════════

export const BRIDGES: Record<string, BridgeConfig> = {
  // ─── V1 Direct REST APIs (12 bridges) ───
  across: {
    id: 'across',       name: 'Across',          apiType: 'rest-get',
    baseUrl: 'https://app.across.to/api',
    authType: 'none',   inAggregators: ['lifi', 'rango', 'bungee', 'rubic'],
    gapFillPriority: 'low',  v1Direct: true,
  },
  stargate: {
    id: 'stargate',     name: 'Stargate V2',     apiType: 'rest-get',
    baseUrl: 'https://mainnet.stargate-api.com',
    authType: 'none',   inAggregators: ['lifi', 'rango', 'bungee', 'rubic'],
    gapFillPriority: 'low',  v1Direct: true,
  },
  debridge: {
    id: 'debridge',     name: 'deBridge DLN',    apiType: 'rest-get',
    baseUrl: 'https://deswap.debridge.finance/v1.0',
    authType: 'none',   inAggregators: ['lifi', 'rango', 'rubic'],
    gapFillPriority: 'medium',  v1Direct: true,
  },
  symbiosis: {
    id: 'symbiosis',    name: 'Symbiosis',       apiType: 'rest-post',
    baseUrl: 'https://api-v2.symbiosis.finance/crosschain/v1',
    authType: 'none',   inAggregators: ['lifi', 'rango', 'rubic'],
    gapFillPriority: 'medium',  v1Direct: true,
  },
  relay: {
    id: 'relay',        name: 'Relay',            apiType: 'rest-post',
    baseUrl: 'https://api.relay.link',
    authType: 'none',   inAggregators: ['lifi', 'rubic'],
    gapFillPriority: 'high',  v1Direct: true,
  },
  mayan: {
    id: 'mayan',        name: 'Mayan Finance',   apiType: 'rest-get',
    baseUrl: 'https://price-api.mayan.finance/v3',
    authType: 'none',   inAggregators: ['rango', 'rubic'],
    gapFillPriority: 'high',  v1Direct: true,
  },
  everclear: {
    id: 'everclear',    name: 'Everclear',       apiType: 'rest-post',
    baseUrl: 'https://api.everclear.org',
    authType: 'none',   inAggregators: ['lifi'],
    gapFillPriority: 'high',  v1Direct: true,
  },
  meson: {
    id: 'meson',        name: 'Meson',           apiType: 'rest-post',
    baseUrl: 'https://relayer.meson.fi/api/v1',
    authType: 'none',   inAggregators: ['rango'],
    gapFillPriority: 'high',  v1Direct: true,
  },
  hop: {
    id: 'hop',          name: 'Hop Protocol',    apiType: 'rest-get',
    baseUrl: 'https://api.hop.exchange/v1',
    authType: 'none',   inAggregators: ['lifi', 'bungee'],
    gapFillPriority: 'medium',  v1Direct: true,
  },
  orbiter: {
    id: 'orbiter',      name: 'Orbiter Finance', apiType: 'rest-post',
    baseUrl: 'https://openapi.orbiter.finance/sdk',
    authType: 'none',   inAggregators: ['lifi', 'rango'],
    gapFillPriority: 'medium',  v1Direct: true,
  },
  cbridge: {
    id: 'cbridge',      name: 'cBridge (Celer)', apiType: 'rest-get',
    baseUrl: 'https://cbridge-prod2.celer.app/v2',
    authType: 'none',   inAggregators: ['lifi', 'rango', 'bungee'],
    gapFillPriority: 'low',  v1Direct: true,
  },
  thorchain: {
    id: 'thorchain',    name: 'THORChain',       apiType: 'rest-get',
    baseUrl: 'https://thornode.ninerealms.com/thorchain',
    authType: 'none',   inAggregators: ['rango'],
    gapFillPriority: 'high',  v1Direct: true,
  },

  // ─── Aggregator-only (2 bridges, no direct API call in V1) ───
  wormhole: {
    id: 'wormhole',     name: 'Wormhole/Portal', apiType: 'aggregator-only',
    baseUrl: null,
    authType: 'none',   inAggregators: ['lifi', 'rango', 'bungee', 'rubic'],
    gapFillPriority: 'skip',  v1Direct: false,
  },
  cctp: {
    id: 'cctp',         name: 'Circle CCTP',     apiType: 'aggregator-only',
    baseUrl: null,
    authType: 'none',   inAggregators: ['lifi', 'rango', 'bungee'],
    gapFillPriority: 'skip',  v1Direct: false,
  },

  // ─── Phase 2: SDK-based (3 bridges) ───
  chainflip: {
    id: 'chainflip',    name: 'Chainflip',       apiType: 'sdk',
    baseUrl: null,
    authType: 'none',   inAggregators: ['rango'],
    gapFillPriority: 'phase2',  v1Direct: false,
  },
  garden: {
    id: 'garden',       name: 'Garden Finance',  apiType: 'sdk',
    baseUrl: 'https://api.garden.finance',
    authType: 'none',   inAggregators: [],
    gapFillPriority: 'phase2',  v1Direct: false,
  },
  allbridge: {
    id: 'allbridge',    name: 'Allbridge Core',  apiType: 'sdk',
    baseUrl: null,
    authType: 'none',   inAggregators: ['lifi', 'rango'],
    gapFillPriority: 'phase2',  v1Direct: false,
  },
} as const;

export const BRIDGE_IDS = Object.keys(BRIDGES) as readonly string[];

/** Bridges that have direct REST APIs for V1 gap-fill */
export const V1_DIRECT_BRIDGES = Object.values(BRIDGES).filter(b => b.v1Direct);

/** Get all bridges NOT in a given aggregator (for gap-fill) */
export function getMissingBridges(
  aggregatorResults: Set<string>,
): BridgeConfig[] {
  return V1_DIRECT_BRIDGES.filter(b => !aggregatorResults.has(b.id));
}

// ─── Aggregator bridge name mapping ───
// Aggregators use different names for the same bridge. This maps their names → our canonical ID.

export const LIFI_BRIDGE_MAP: Record<string, string> = {
  'across':     'across',
  'stargate':   'stargate',
  'hop':        'hop',
  'cbridge':    'cbridge',
  'orbiter':    'orbiter',
  'relay':      'relay',
  'symbiosis':  'symbiosis',
  'cctp':       'cctp',
  'allbridge':  'allbridge',
  'connext':    'everclear',
  'squid':      'squid',       // aggregator-only
  'thorswap':   'thorchain',
  'debridge':   'debridge',
  'wormhole':   'wormhole',
  'meson':      'meson',
  'chainflip':  'chainflip',
  'hyperlane':  'hyperlane',   // not in our tracked list
  'mayan':      'mayan',
  'gaszip':     'gaszip',     // LI.FI route option
  'arbitrum':   'arbitrum',   // Arbitrum native bridge
};

export const RANGO_BRIDGE_MAP: Record<string, string> = {
  'Across':              'across',
  'Allbridge':           'allbridge',
  'Stargate':            'stargate',
  'Symbiosis':           'symbiosis',
  'ThorChain':           'thorchain',
  'Squid':               'squid',
  'Orbiter':             'orbiter',
  'cBridge':             'cbridge',
  'Wormhole':            'wormhole',
  'deBridge':            'debridge',
  'Chainflip':           'chainflip',
  'Meson':               'meson',
  'CCTP':                'cctp',
  'Circle CCTP':         'cctp',
  'CCTP Aggregator':     'cctp',
  'Relay':               'relay',
  'Hyperlane':           'hyperlane',
  'Mayan':               'mayan',
  'IBC':                 'ibc',
  'Across Aggregator':   'across',
  'Stargate Aggregator': 'stargate',
};

export const BUNGEE_BRIDGE_MAP: Record<string, string> = {
  'across':                  'across',
  'stargate':                'stargate',
  'hop':                     'hop',
  'orbiter':                 'orbiter',
  'relay':                   'relay',
  'symbiosis':               'symbiosis',
  'synapse':                 'synapse',     // not tracked
  'cbridge':                 'cbridge',
  'celer':                   'cbridge',
  'cctp':                    'cctp',
  'connext':                 'everclear',
  'hyperlane':               'hyperlane',
  'wormhole':                'wormhole',
  'mantle-native-bridge':    'mantle-native-bridge',
  'optimism-bridge':         'optimism-bridge',
  'arbitrum-bridge':         'arbitrum-bridge',
};

// ─── Rubic bridge name mapping ───
export const RUBIC_BRIDGE_MAP: Record<string, string> = {
  'symbiosis':       'symbiosis',
  'across':          'across',
  'stargate':        'stargate',
  'debridge':        'debridge',
  'relay':           'relay',
  'celer_bridge':    'cbridge',
  'cbridge':         'cbridge',
  'orbiter':         'orbiter',
  'hop':             'hop',
  'meson':           'meson',
  'mayan':           'mayan',
  'allbridge':       'allbridge',
  'wormhole':        'wormhole',
  'chainflip':       'chainflip',
  'thorswap':        'thorchain',
  'thorchain':       'thorchain',
  'cctp':            'cctp',
  'hyperlane':       'hyperlane',
  'squid':           'squid',
  'multichain':      'multichain',
  'synapse':         'synapse',
  'bridgers':        'bridgers',
  'changenow':       'changenow',
  'via_protocol':    'via',
  'rocketpool':      'rocketpool',
  'lifi':            'lifi',   // dedup handled upstream
  'rango':           'rango',  // dedup handled upstream
};

// ─── Catch-all slug normalization ───
// Maps all known variant slugs (from any source) to canonical bridge IDs.
// Applied as a fallback after aggregator-specific maps.
export const SLUG_ALIASES: Record<string, string> = {
  // Stargate variants
  'stargatev2':                'stargate',
  'stargate-v2':               'stargate',
  'stargatev2bus':             'stargate',
  'stargate v2':               'stargate',
  'stargate v2 aggregator':    'stargate',
  'stargate_v2':               'stargate',
  'stargatebus':               'stargate',
  'stargate aggregator':       'stargate',
  // Relay variants
  'relaydepository':           'relay',
  'relay_bridge':              'relay',
  'relay-bridge':              'relay',
  'relaybridge':               'relay',
  // Across variants
  'acrossv2':                  'across',
  'across-v2':                 'across',
  'across_v2':                 'across',
  'across aggregator':         'across',
  // deBridge variants
  'debridge-dln':              'debridge',
  'dln':                       'debridge',
  'debridgedln':               'debridge',
  'debridge dln':              'debridge',
  // cBridge / Celer variants
  'celer':                     'cbridge',
  'celer_bridge':              'cbridge',
  'celercbridge':              'cbridge',
  'celer-cbridge':             'cbridge',
  // Hop variants
  'hop-protocol':              'hop',
  'hopprotocol':               'hop',
  // Symbiosis variants
  'symbiosisbridge':           'symbiosis',
  'symbiosis-bridge':          'symbiosis',
  // Mayan variants
  'mayanfinance':              'mayan',
  'mayan-finance':             'mayan',
  'mayan finance':             'mayan',
  // Orbiter variants
  'orbiterfinance':            'orbiter',
  'orbiter-finance':           'orbiter',
  'orbiter finance':           'orbiter',
  // Wormhole variants
  'portalbridge':              'wormhole',
  'portal':                    'wormhole',
  'wormhole-bridge':           'wormhole',
  // THORChain variants
  'thorswap':                  'thorchain',
  'thor':                      'thorchain',
  'thorchain-dex':             'thorchain',
  // Everclear / Connext
  'connext':                   'everclear',
  'connextbridge':             'everclear',
  'connext-bridge':            'everclear',
  // CCTP variants
  'cctp-aggregator':           'cctp',
  'circle-cctp':               'cctp',
  'circlecctp':                'cctp',
  'cctp aggregator':           'cctp',
  'circle cctp':               'cctp',
  // Allbridge
  'allbridgecore':             'allbridge',
  'allbridge-core':            'allbridge',
  // Synapse
  'synapsebridge':             'synapse',
  'synapse-bridge':            'synapse',
  // Hyperlane
  'hyperlane-bridge':          'hyperlane',
  // Native bridges
  'arbitrumbridge':            'arbitrum-bridge',
  'optimismbridge':            'optimism-bridge',
  'mantlebridge':              'mantle-native-bridge',
  // Meson
  'mesonfi':                   'meson',
  'meson-fi':                  'meson',
  // GasZip
  'gas-zip':                   'gaszip',
  'gas_zip':                   'gaszip',
  // Variants seen in live aggregator data
  'orbiter aggregator':        'orbiter',
  'orbiterv2':                 'orbiter',
  'mayanfastmctp':             'mayan',
  'mayan fast mctp':           'mayan',
  'mayanswift':                'mayan',
  'cctp-v2':                   'cctp',
  'cctp-v2-fast':              'cctp',
  'cctpv2':                    'cctp',
  'circle cctp v2 economy':    'cctp',
  'circle cctp v2':            'cctp',
  'circlecctpv2':              'cctp',
  'stargatev2 economy':        'stargate',
  'stargatev2bus economy':     'stargate',
  'bridgers aggregator':       'bridgers',
  'near':                      'near',
  'glacis':                    'glacis',
  'polymerstandard':           'polymer',
  'polymer':                   'polymer',
  'eco':                       'eco',
};

/** Normalize any bridge slug to its canonical form.
 *  Checks canonical IDs first, then SLUG_ALIASES. */
export function normalizeBridge(slug: string): string {
  if (!slug) return slug;
  const lower = slug.toLowerCase().trim();
  if (BRIDGES[lower]) return lower;
  if (SLUG_ALIASES[lower]) return SLUG_ALIASES[lower]!;
  return lower;
}

/** Resolve aggregator bridge name → canonical bridge ID. Returns null if unknown. */
export function resolveBridgeName(aggregator: AggregatorId, rawName: string): string | null {
  const lower = rawName.toLowerCase().trim();
  const map = aggregator === 'lifi' ? LIFI_BRIDGE_MAP
    : aggregator === 'rango' ? RANGO_BRIDGE_MAP
    : aggregator === 'bungee' ? BUNGEE_BRIDGE_MAP
    : aggregator === 'rubic' ? RUBIC_BRIDGE_MAP
    : null;

  if (!map) return normalizeBridge(lower);
  const resolved = map[rawName] ?? map[lower] ?? null;
  // Fallback to slug aliases if aggregator map didn't match
  return resolved ?? normalizeBridge(lower);
}

// ═══════════════════════════════════════════
// BRIDGE CHAIN SUPPORT
// ═══════════════════════════════════════════
// Which chains each bridge actually supports, based on their APIs and docs.
// Used to compute actual route coverage (theoretical max routes per bridge).

const ALL_EVM: readonly string[] = [
  'ethereum', 'bsc', 'avalanche', 'polygon', 'sonic', 'berachain',
  'arbitrum', 'optimism', 'base', 'scroll', 'linea', 'zksync',
  'mantle', 'hyperliquid', 'abstract', 'unichain', 'monad', 'megaeth',
];

const ALL_CHAINS: readonly string[] = [...ALL_EVM, 'solana', 'bitcoin'];

export const BRIDGE_SUPPORTED_CHAINS: Record<string, readonly string[]> = {
  across:    ALL_EVM,
  stargate:  ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base', 'bsc', 'avalanche', 'scroll', 'linea', 'mantle', 'sonic'],
  relay:     ALL_EVM,
  debridge:  ALL_EVM,
  symbiosis: ALL_EVM,
  hop:       ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base', 'linea', 'zksync'],
  cbridge:   ALL_EVM,
  orbiter:   ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'linea', 'zksync', 'scroll', 'mantle'],
  mayan:     ALL_CHAINS,
  meson:     ALL_CHAINS,
  everclear: ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'linea', 'mantle'],
  thorchain: ['ethereum', 'bsc', 'avalanche', 'bitcoin'],
  wormhole:  ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'avalanche', 'solana'],
  cctp:      ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'avalanche'],
  allbridge: ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'avalanche', 'solana'],
  chainflip: ['ethereum', 'arbitrum', 'bitcoin', 'solana'],
  garden:    ['ethereum', 'arbitrum', 'bitcoin'],
};

/** Compute the number of possible directional routes for a bridge */
export function getBridgeMaxRoutes(bridgeId: string): number {
  const chains = BRIDGE_SUPPORTED_CHAINS[bridgeId];
  if (!chains) return 0;
  return chains.length * (chains.length - 1); // directional pairs
}
