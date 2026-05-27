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
