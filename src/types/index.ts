// src/types/index.ts
// ─── All shared interfaces for the bridge rate dashboard ───

// ═══════════════════════════════════════════
// CHAIN
// ═══════════════════════════════════════════

export type ChainType = 'evm-l1' | 'evm-l2' | 'non-evm';

export interface Chain {
  readonly id: string;            // slug: "ethereum", "arbitrum", "solana"
  readonly chainId: number | string; // EVM numeric or non-EVM string identifier
  readonly name: string;          // Display name
  readonly type: ChainType;
  readonly nativeToken: string;   // "ETH", "BNB", "SOL", "MON"
  readonly nativeDecimals: number;
  readonly explorerUrl: string;
  /** Override for LI.FI API when chainId is string (e.g. Starknet). Remove from LIFI_UNSUPPORTED when set. */
  readonly lifiChainId?: number;
  /** Override for Bungee/Socket API when they use a different chainId than our chainId. */
  readonly bungeeChainId?: number;
}

// ═══════════════════════════════════════════
// ROUTE
// ═══════════════════════════════════════════

export type RefreshTier = 1 | 2 | 3;

export interface Route {
  readonly src: string;           // Chain slug
  readonly dst: string;           // Chain slug
  readonly tier: RefreshTier;
  readonly assets: readonly Asset[];
  readonly amountTiers: readonly number[];  // USD values: [1000] or [50, 1000, 50000]
}

export type Asset = 'ETH' | 'USDC' | 'USDT';

export interface RouteKey {
  readonly src: string;
  readonly dst: string;
  readonly asset: Asset;
  readonly amountTier: number;
}

// ═══════════════════════════════════════════
// BRIDGE
// ═══════════════════════════════════════════

export type BridgeApiType = 'rest-get' | 'rest-post' | 'sdk' | 'aggregator-only';
export type AggregatorId = 'lifi' | 'rango' | 'bungee' | 'rubic';

export interface BridgeConfig {
  readonly id: string;            // "across", "stargate", "debridge", etc.
  readonly name: string;          // Display name
  readonly apiType: BridgeApiType;
  readonly baseUrl: string | null;
  readonly authType: 'none' | 'optional-key' | 'required-key';
  readonly inAggregators: readonly AggregatorId[];
  readonly gapFillPriority: 'low' | 'medium' | 'high' | 'skip' | 'phase2';
  readonly v1Direct: boolean;     // true = call directly in V1
}

export interface AggregatorConfig {
  readonly id: AggregatorId;
  readonly name: string;
  readonly baseUrl: string;
  readonly authHeader: string | null;
  readonly envKey: string | null;  // .env variable name for API key
  readonly chainCount: number;
  readonly bridgeCount: number;
}

// ═══════════════════════════════════════════
// TOKEN
// ═══════════════════════════════════════════

export interface TokenEntry {
  readonly chain: string;          // Chain slug
  readonly asset: Asset;
  readonly address: string;        // Contract address or special identifier
  readonly decimals: number;
  readonly notes?: string;
}

// ═══════════════════════════════════════════
// NORMALIZED QUOTE (core data model)
// ═══════════════════════════════════════════

export interface NormalizedQuote {
  // Identity
  readonly batchId: string;        // UUID per fetch cycle
  readonly ts: Date;

  // Route
  readonly srcChain: string;
  readonly dstChain: string;
  readonly asset: Asset;
  readonly amountTier: number;

  // Source
  readonly source: 'lifi' | 'rango' | 'bungee' | 'rubic' | 'direct';
  readonly bridge: string;         // Bridge slug: "across", "stargate", etc.

  // Amounts (strings for bigint safety)
  readonly inputAmount: string;    // Raw input in token base units
  readonly outputAmount: string;   // Raw output in token base units
  readonly inputUsd: string;       // USD value of input
  readonly outputUsd: string;      // USD value of output

  // Fees
  readonly gasCostUsd: string;     // Gas in USD
  readonly protocolFeeBps: number; // Protocol fee in basis points
  readonly totalFeeBps: number;    // Total fee in basis points (gas + protocol)
  readonly totalFeeUsd: string;    // Total fee in USD

  // Timing
  readonly estimatedSeconds: number;

  // Flags
  readonly isMultihop: boolean;    // Route involves intermediate swap
  readonly steps: number;          // Number of steps in route

  // Rank (computed after all quotes for a route are collected)
  rank?: number;                   // 1 = best output for this route
  spreadBps?: number;              // Spread from best quote in bps
}

// ═══════════════════════════════════════════
// ROUTE STATUS (for heatmap)
// ═══════════════════════════════════════════

export type RouteState = 'active' | 'dead' | 'stale' | 'single-bridge';

export interface RouteStatus {
  readonly srcChain: string;
  readonly dstChain: string;
  readonly asset: Asset;
  readonly amountTier: number;
  readonly state: RouteState;
  readonly lastSeen: Date | null;
  readonly quoteCount: number;
  readonly bridgeCount: number;
  readonly bestBridge: string | null;
  readonly bestOutputUsd: string | null;
  readonly worstOutputUsd: string | null;
  readonly spreadBps: number | null;
  readonly refreshTier: RefreshTier;
}

// ═══════════════════════════════════════════
// FETCH LOG
// ═══════════════════════════════════════════

export interface FetchLogEntry {
  readonly batchId: string;
  readonly ts: Date;
  readonly srcChain: string;
  readonly dstChain: string;
  readonly asset: Asset;
  readonly amountTier: number;
  readonly source: string;
  readonly bridge: string | null;
  readonly status: 'success' | 'error' | 'timeout' | 'no_route' | 'skipped';
  readonly responseMs: number;
  readonly errorMessage: string | null;
  readonly quoteCount: number;
}

// ═══════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════

export interface QuotesResponse {
  readonly route: RouteKey;
  readonly quotes: NormalizedQuote[];
  readonly fetchedAt: string;       // ISO timestamp
  readonly quoteCount: number;
}

export interface MatrixCell {
  readonly src: string;
  readonly dst: string;
  readonly state: RouteState;
  readonly spreadBps: number | null;
  readonly bestBridge: string | null;
  readonly quoteCount: number;
  readonly lastSeen: string | null;  // ISO timestamp
}

export interface MatrixResponse {
  readonly asset: Asset;
  readonly amountTier: number;
  readonly chains: string[];         // Ordered chain slugs
  readonly cells: MatrixCell[];      // 870 cells (30×30 minus diagonal)
  readonly stats: {
    readonly active: number;
    readonly dead: number;
    readonly stale: number;
    readonly singleBridge: number;
  };
}

export interface HealthResponse {
  readonly status: 'ok' | 'degraded' | 'down';
  readonly uptime: number;
  readonly lastFetch: {
    readonly tier1: string | null;
    readonly tier2: string | null;
    readonly tier3: string | null;
  };
  readonly db: {
    readonly connected: boolean;
    readonly quoteCount: number;
    readonly oldestQuote: string | null;
  };
}
