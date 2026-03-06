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

/** Resolve aggregator bridge name → canonical bridge ID. Returns null if unknown. */
export function resolveBridgeName(aggregator: AggregatorId, rawName: string): string | null {
  const lower = rawName.toLowerCase();
  const map = aggregator === 'lifi' ? LIFI_BRIDGE_MAP
    : aggregator === 'rango' ? RANGO_BRIDGE_MAP
    : aggregator === 'bungee' ? BUNGEE_BRIDGE_MAP
    : null;

  if (!map) return lower; // Rubic: use raw provider name
  return map[rawName] ?? map[lower] ?? null;
}
