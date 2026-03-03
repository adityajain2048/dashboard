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
