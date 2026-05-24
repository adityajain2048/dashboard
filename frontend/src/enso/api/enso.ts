// In dev, use the Vite proxy to avoid browser-side rate limiting
const BASE = import.meta.env.DEV
  ? '/enso-api/v1'
  : 'https://api.enso.finance/api/v1';

export interface EnsoChain {
  id: number;
  name: string;
  displayName: string;
}

export interface EnsoProtocol {
  slug: string;
  projectId: string;
  name: string;
  url: string;
  logosUri: string[];
  description: string;
  chains: EnsoChain[];
}

export interface EnsoNetwork {
  id: number;
  name: string;
  displayName: string;
  isConnected: boolean;
}

export interface EnsoAction {
  action: string;
  inputs: Record<string, unknown>;
  variants: unknown[];
}

// Real shape from /standards: per-protocol standard implementations
export interface EnsoStandardAction {
  action: string;
  name: string; // e.g. "ERC4626_Deposit", "AaveV3_Deposit"
  supportedChains: Array<{ id: number; name: string }>;
  inputs: string[];
}

export interface EnsoStandardEntry {
  protocol: { slug: string; url: string };
  forks: Array<{ slug: string; url: string }>;
  actions: EnsoStandardAction[];
}

export interface EnsoProject {
  id: string;
  chains: number[];
  protocols: string[];
}

async function get<T>(path: string, params: Record<string, string> = {}, retries = 3): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const fullPath = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(fullPath);
    if (res.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Enso ${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }
  throw new Error(`Enso ${path} → too many retries`);
}

async function fetchAllPages<T>(path: string, extraParams: Record<string, string> = {}): Promise<T[]> {
  const data = await get<T[]>(path, { ...extraParams, page: '1', perPage: '1000' });
  return Array.isArray(data) ? data : [];
}

export async function fetchEnsoProtocols(): Promise<EnsoProtocol[]> {
  return fetchAllPages<EnsoProtocol>('/protocols');
}

export async function fetchEnsoNetworks(): Promise<EnsoNetwork[]> {
  return get<EnsoNetwork[]>('/networks');
}

export async function fetchEnsoActions(): Promise<EnsoAction[]> {
  return get<EnsoAction[]>('/actions', { chainId: '1' });
}

export async function fetchEnsoStandards(): Promise<EnsoStandardEntry[]> {
  return get<EnsoStandardEntry[]>('/standards');
}

export async function fetchEnsoProjects(): Promise<EnsoProject[]> {
  return fetchAllPages<EnsoProject>('/projects');
}

// Extract standard pattern name from action name like "ERC4626_Deposit" → "ERC4626"
export function extractStandardPattern(actionName: string): string {
  const parts = actionName.split('_');
  if (parts.length < 2) return actionName;
  // Remove the last part (action verb like Deposit/Redeem/Borrow)
  return parts.slice(0, -1).join('_');
}

// Derive standards summary from raw entries
export interface StandardSummary {
  pattern: string;       // e.g. "ERC4626", "AaveV3"
  protocolCount: number;
  actionTypes: string[]; // unique action verbs (deposit, redeem, ...)
  protocols: string[];   // protocol slugs
}

export function buildStandardsSummary(entries: EnsoStandardEntry[]): StandardSummary[] {
  const map = new Map<string, { protocols: Set<string>; actions: Set<string> }>();
  for (const entry of entries) {
    const slug = entry.protocol.slug;
    for (const action of entry.actions) {
      const pattern = extractStandardPattern(action.name);
      if (!map.has(pattern)) map.set(pattern, { protocols: new Set(), actions: new Set() });
      const m = map.get(pattern)!;
      m.protocols.add(slug);
      // Also add forks
      for (const fork of entry.forks) m.protocols.add(fork.slug);
      m.actions.add(action.action);
    }
  }
  return [...map.entries()]
    .map(([pattern, v]) => ({
      pattern,
      protocolCount: v.protocols.size,
      actionTypes: [...v.actions],
      protocols: [...v.protocols],
    }))
    .sort((a, b) => b.protocolCount - a.protocolCount);
}

// Map protocol slug → which standard patterns it uses
export function buildStandardsMap(entries: EnsoStandardEntry[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const slug = entry.protocol.slug;
    const patterns = [...new Set(entry.actions.map((a) => extractStandardPattern(a.name)))];
    map.set(slug, patterns);
    for (const fork of entry.forks) {
      map.set(fork.slug, patterns);
    }
  }
  return map;
}
