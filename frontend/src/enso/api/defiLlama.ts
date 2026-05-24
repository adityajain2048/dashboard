const BASE = import.meta.env.DEV ? '/llama-api' : 'https://api.llama.fi';

export interface LlamaProtocol {
  id: string;
  name: string;
  slug: string;
  symbol: string;
  category: string;
  chains: string[];
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
  logo: string;
  url: string;
}

export interface LlamaVolumeProtocol {
  name: string;
  displayName: string;
  total24h: number | null;
  total7d: number | null;
  chains: string[];
  category: string;
}

export interface LlamaVolumeOverview {
  protocols: LlamaVolumeProtocol[];
  total24h: number;
  total7d: number;
}

export async function fetchLlamaProtocols(): Promise<LlamaProtocol[]> {
  const res = await fetch(`${BASE}/protocols`);
  if (!res.ok) throw new Error(`DefiLlama /protocols → ${res.status}`);
  const data = await res.json() as LlamaProtocol[];
  return data;
}

export async function fetchLlamaDexVolumes(): Promise<LlamaVolumeOverview> {
  const res = await fetch(`${BASE}/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`);
  if (!res.ok) throw new Error(`DefiLlama /overview/dexs → ${res.status}`);
  return res.json() as Promise<LlamaVolumeOverview>;
}

export async function fetchLlamaLendingVolumes(): Promise<LlamaVolumeOverview> {
  const res = await fetch(`${BASE}/overview/lending?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`);
  if (!res.ok) throw new Error(`DefiLlama /overview/lending → ${res.status}`);
  return res.json() as Promise<LlamaVolumeOverview>;
}
