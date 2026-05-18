/** API base URL. Set VITE_API_URL in Vercel to your backend (e.g. https://your-api.railway.app) */
const BASE = import.meta.env.VITE_API_URL ?? '';

export async function fetchQuotes(
  src: string,
  dst: string,
  asset: string,
  tier: number
): Promise<{ route: unknown; quotes: unknown[]; fetchedAt: string; quoteCount: number }> {
  const res = await fetch(
    `${BASE}/api/quotes?src=${encodeURIComponent(src)}&dst=${encodeURIComponent(dst)}&asset=${asset}&tier=${tier}`
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchMatrix(
  asset: string,
  tier: number
): Promise<{
  asset: string;
  amountTier: number;
  chains: string[];
  cells: Array<{
    src: string;
    dst: string;
    state: string;
    bestFeeBps: number | null;
    bestBridge: string | null;
    quoteCount: number;
    lastSeen: string | null;
  }>;
  stats: { active: number; dead: number; stale: number; singleBridge: number };
}> {
  const res = await fetch(`${BASE}/api/matrix?asset=${asset}&tier=${tier}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchOpportunities(
  limit = 20,
  minSpreadBps = 0
): Promise<{ opportunities: unknown[]; total: number }> {
  const res = await fetch(
    `${BASE}/api/opportunities?limit=${limit}&minSpreadBps=${minSpreadBps}`
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<{
  status: string;
  uptime: number;
  db: { connected: boolean; quoteCount: number; oldestQuote: string | null };
}> {
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface BridgeCoverageItem {
  id: string; name: string; routesCovered: number; routesCoveredPct: number;
  wins: number; winRate: number; avgFeeBps: number | null;
  avgResponseMs: number | null; successRate: number | null;
  supportedChains: string[]; maxRoutes: number; chainCoveragePct: number;
}

export async function fetchBridgeCoverage(): Promise<{
  bridges: BridgeCoverageItem[];
  totalActiveRoutes: number;
  totalTrackedBridges: number;
}> {
  const res = await fetch(`${BASE}/api/bridges/coverage`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchBridgeWinRateByTier(): Promise<{
  tiers: Array<{ amountTier: number; bridges: Array<{ bridge: string; wins: number; pct: number }> }>;
}> {
  const res = await fetch(`${BASE}/api/bridges/win-rate-by-tier`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface AggregatorHealth {
  id: string; successCount: number; errorCount: number; timeoutCount: number;
  noRouteCount: number; totalCount: number; successRate: number; avgResponseMs: number | null;
}

export interface BridgeHealth {
  id: string; activeQuotes: number; corridors: number; lastSeen: string | null; isStale: boolean;
}

export async function fetchBridgeHealth(): Promise<{
  aggregators: AggregatorHealth[];
  bridges: BridgeHealth[];
}> {
  const res = await fetch(`${BASE}/api/bridges/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface HistoryDataPoint {
  ts: string; bridge: string; avgOutputUsd: number; avgFeeBps: number; quoteCount: number;
}

export async function fetchHistory(
  src: string, dst: string, asset: string, tier: number, period: string
): Promise<{
  route: { src: string; dst: string; asset: string; amountTier: number };
  period: string;
  dataPoints: HistoryDataPoint[];
}> {
  const res = await fetch(
    `${BASE}/api/history?src=${encodeURIComponent(src)}&dst=${encodeURIComponent(dst)}&asset=${asset}&tier=${tier}&period=${period}`
  );
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface InsightsData {
  generatedAt: string;
  bestRoute: { src: string; dst: string; asset: string; feeBps: number; bridge: string } | null;
  worstRoute: { src: string; dst: string; asset: string; feeBps: number; bridge: string } | null;
  biggestSpreads: Array<{ src: string; dst: string; asset: string; spreadBps: number; bridge: string; quoteCount: number }>;
  routeHealth: { active: number; dead: number; stale: number; singleBridge: number };
  bridgeDominance: Array<{ bridge: string; wins: number }>;
  monopolyRouteCount: number;
}

export async function fetchInsights(): Promise<InsightsData> {
  const res = await fetch(`${BASE}/api/insights/daily`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── Relay Report ───

export interface RelayLoss {
  srcChain: string; dstChain: string; asset: string; amountTier: number;
  relayOutput: string; relayFeeBps: number;
  bestOutput: string; bestFeeBps: number;
  winner: string; gapBps: number; bridgeCount: number;
}

export interface RelayCompetitor {
  bridge: string; beatCount: number; avgGapBps: number;
}

export interface RelayChainPair {
  srcChain: string; dstChain: string;
  relayAvgFeeBps: number; quoteCount: number; hasWin: boolean;
}

export interface RelayReportData {
  generatedAt: string;
  summary: {
    totalRelayQuotes: number; relayCorridors: number;
    wins: number; losses: number; winRate: number;
    relayAvgFeeBps: number; marketAvgFeeBps: number; feeAdvantage: number;
    maxPossibleRoutes: number; coveragePct: number;
  };
  losses: RelayLoss[];
  competitors: RelayCompetitor[];
  chainPairMatrix: RelayChainPair[];
  coverageGaps: string[];
}

export async function fetchRelayReport(): Promise<RelayReportData> {
  try {
    const res = await fetch(`${BASE}/api/relay/report`);
    if (res.ok) return res.json();
  } catch { /* fall through to mock */ }
  return MOCK_RELAY_REPORT;
}

// Mock data for local preview when backend doesn't have /relay/report yet
const MOCK_RELAY_REPORT: RelayReportData = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalRelayQuotes: 1842, relayCorridors: 187, wins: 425, losses: 312,
    winRate: 57.7, relayAvgFeeBps: 42, marketAvgFeeBps: 67, feeAdvantage: 25,
    maxPossibleRoutes: 306, coveragePct: 61.1,
  },
  losses: [
    { srcChain: 'ethereum', dstChain: 'arbitrum', asset: 'ETH', amountTier: 1000, relayOutput: '997.20', relayFeeBps: 28, bestOutput: '999.10', bestFeeBps: 9, winner: 'across', gapBps: 19, bridgeCount: 5 },
    { srcChain: 'base', dstChain: 'optimism', asset: 'USDC', amountTier: 50000, relayOutput: '49850.00', relayFeeBps: 30, bestOutput: '49960.00', bestFeeBps: 8, winner: 'across', gapBps: 22, bridgeCount: 4 },
    { srcChain: 'arbitrum', dstChain: 'polygon', asset: 'USDT', amountTier: 1000, relayOutput: '994.50', relayFeeBps: 55, bestOutput: '998.80', bestFeeBps: 12, winner: 'stargate', gapBps: 43, bridgeCount: 6 },
    { srcChain: 'optimism', dstChain: 'base', asset: 'ETH', amountTier: 50, relayOutput: '49.60', relayFeeBps: 80, bestOutput: '49.92', bestFeeBps: 16, winner: 'across', gapBps: 64, bridgeCount: 3 },
    { srcChain: 'polygon', dstChain: 'ethereum', asset: 'USDC', amountTier: 50000, relayOutput: '49720.00', relayFeeBps: 56, bestOutput: '49910.00', bestFeeBps: 18, winner: 'cctp', gapBps: 38, bridgeCount: 5 },
    { srcChain: 'ethereum', dstChain: 'base', asset: 'USDC', amountTier: 1000, relayOutput: '998.10', relayFeeBps: 19, bestOutput: '999.50', bestFeeBps: 5, winner: 'cctp', gapBps: 14, bridgeCount: 4 },
    { srcChain: 'bsc', dstChain: 'arbitrum', asset: 'USDT', amountTier: 1000, relayOutput: '992.30', relayFeeBps: 77, bestOutput: '997.60', bestFeeBps: 24, winner: 'stargate', gapBps: 53, bridgeCount: 4 },
    { srcChain: 'avalanche', dstChain: 'ethereum', asset: 'USDC', amountTier: 50000, relayOutput: '49650.00', relayFeeBps: 70, bestOutput: '49880.00', bestFeeBps: 24, winner: 'cctp', gapBps: 46, bridgeCount: 3 },
    { srcChain: 'linea', dstChain: 'arbitrum', asset: 'ETH', amountTier: 50, relayOutput: '49.35', relayFeeBps: 130, bestOutput: '49.85', bestFeeBps: 30, winner: 'orbiter', gapBps: 100, bridgeCount: 3 },
    { srcChain: 'scroll', dstChain: 'base', asset: 'USDC', amountTier: 1000, relayOutput: '995.80', relayFeeBps: 42, bestOutput: '998.90', bestFeeBps: 11, winner: 'across', gapBps: 31, bridgeCount: 3 },
    { srcChain: 'zksync', dstChain: 'ethereum', asset: 'ETH', amountTier: 1000, relayOutput: '993.00', relayFeeBps: 70, bestOutput: '998.20', bestFeeBps: 18, winner: 'orbiter', gapBps: 52, bridgeCount: 4 },
    { srcChain: 'mantle', dstChain: 'base', asset: 'USDC', amountTier: 1000, relayOutput: '994.00', relayFeeBps: 60, bestOutput: '998.50', bestFeeBps: 15, winner: 'stargate', gapBps: 45, bridgeCount: 3 },
  ],
  competitors: [
    { bridge: 'across', beatCount: 142, avgGapBps: 24 },
    { bridge: 'stargate', beatCount: 68, avgGapBps: 47 },
    { bridge: 'cctp', beatCount: 45, avgGapBps: 33 },
    { bridge: 'orbiter', beatCount: 28, avgGapBps: 62 },
    { bridge: 'debridge', beatCount: 15, avgGapBps: 38 },
    { bridge: 'symbiosis', beatCount: 8, avgGapBps: 71 },
    { bridge: 'hop', beatCount: 6, avgGapBps: 55 },
  ],
  chainPairMatrix: [
    { srcChain: 'ethereum', dstChain: 'arbitrum', relayAvgFeeBps: 22, quoteCount: 9, hasWin: true },
    { srcChain: 'ethereum', dstChain: 'base', relayAvgFeeBps: 18, quoteCount: 9, hasWin: true },
    { srcChain: 'ethereum', dstChain: 'optimism', relayAvgFeeBps: 25, quoteCount: 9, hasWin: true },
    { srcChain: 'ethereum', dstChain: 'polygon', relayAvgFeeBps: 35, quoteCount: 6, hasWin: false },
    { srcChain: 'ethereum', dstChain: 'bsc', relayAvgFeeBps: 55, quoteCount: 6, hasWin: false },
    { srcChain: 'ethereum', dstChain: 'linea', relayAvgFeeBps: 30, quoteCount: 6, hasWin: true },
    { srcChain: 'ethereum', dstChain: 'scroll', relayAvgFeeBps: 38, quoteCount: 6, hasWin: false },
    { srcChain: 'ethereum', dstChain: 'zksync', relayAvgFeeBps: 45, quoteCount: 6, hasWin: false },
    { srcChain: 'arbitrum', dstChain: 'ethereum', relayAvgFeeBps: 20, quoteCount: 9, hasWin: true },
    { srcChain: 'arbitrum', dstChain: 'base', relayAvgFeeBps: 12, quoteCount: 9, hasWin: true },
    { srcChain: 'arbitrum', dstChain: 'optimism', relayAvgFeeBps: 15, quoteCount: 9, hasWin: true },
    { srcChain: 'arbitrum', dstChain: 'polygon', relayAvgFeeBps: 40, quoteCount: 6, hasWin: false },
    { srcChain: 'base', dstChain: 'ethereum', relayAvgFeeBps: 18, quoteCount: 9, hasWin: true },
    { srcChain: 'base', dstChain: 'arbitrum', relayAvgFeeBps: 10, quoteCount: 9, hasWin: true },
    { srcChain: 'base', dstChain: 'optimism', relayAvgFeeBps: 14, quoteCount: 9, hasWin: true },
    { srcChain: 'base', dstChain: 'polygon', relayAvgFeeBps: 42, quoteCount: 6, hasWin: false },
    { srcChain: 'optimism', dstChain: 'ethereum', relayAvgFeeBps: 24, quoteCount: 9, hasWin: true },
    { srcChain: 'optimism', dstChain: 'arbitrum', relayAvgFeeBps: 16, quoteCount: 9, hasWin: true },
    { srcChain: 'optimism', dstChain: 'base', relayAvgFeeBps: 13, quoteCount: 9, hasWin: false },
    { srcChain: 'polygon', dstChain: 'ethereum', relayAvgFeeBps: 52, quoteCount: 6, hasWin: false },
    { srcChain: 'polygon', dstChain: 'arbitrum', relayAvgFeeBps: 48, quoteCount: 6, hasWin: false },
    { srcChain: 'bsc', dstChain: 'ethereum', relayAvgFeeBps: 60, quoteCount: 6, hasWin: false },
    { srcChain: 'bsc', dstChain: 'arbitrum', relayAvgFeeBps: 65, quoteCount: 6, hasWin: false },
    { srcChain: 'linea', dstChain: 'ethereum', relayAvgFeeBps: 35, quoteCount: 6, hasWin: true },
    { srcChain: 'linea', dstChain: 'arbitrum', relayAvgFeeBps: 28, quoteCount: 6, hasWin: true },
    { srcChain: 'scroll', dstChain: 'ethereum', relayAvgFeeBps: 40, quoteCount: 6, hasWin: false },
    { srcChain: 'scroll', dstChain: 'base', relayAvgFeeBps: 32, quoteCount: 6, hasWin: false },
    { srcChain: 'zksync', dstChain: 'ethereum', relayAvgFeeBps: 50, quoteCount: 6, hasWin: false },
    { srcChain: 'avalanche', dstChain: 'ethereum', relayAvgFeeBps: 58, quoteCount: 6, hasWin: false },
    { srcChain: 'mantle', dstChain: 'base', relayAvgFeeBps: 45, quoteCount: 6, hasWin: false },
    { srcChain: 'sonic', dstChain: 'ethereum', relayAvgFeeBps: 72, quoteCount: 3, hasWin: false },
  ],
  coverageGaps: [
    'ethereum:avalanche', 'ethereum:mantle', 'ethereum:sonic', 'ethereum:berachain',
    'arbitrum:bsc', 'arbitrum:avalanche', 'arbitrum:linea', 'arbitrum:scroll',
    'base:bsc', 'base:avalanche', 'base:linea', 'base:zksync',
    'optimism:bsc', 'optimism:polygon', 'optimism:avalanche',
    'polygon:base', 'polygon:optimism', 'polygon:linea',
    'bsc:base', 'bsc:optimism', 'bsc:polygon', 'bsc:linea',
    'avalanche:arbitrum', 'avalanche:base', 'avalanche:optimism',
    'linea:base', 'linea:optimism', 'linea:polygon',
    'scroll:arbitrum', 'scroll:optimism', 'scroll:polygon',
    'zksync:arbitrum', 'zksync:base', 'zksync:polygon',
    'mantle:ethereum', 'mantle:arbitrum', 'mantle:optimism',
    'sonic:arbitrum', 'sonic:base', 'sonic:optimism',
  ],
};
