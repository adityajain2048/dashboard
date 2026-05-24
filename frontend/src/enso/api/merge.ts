import type { EnsoProtocol, EnsoStandardEntry } from './enso';
import { buildStandardsMap as buildMap } from './enso';
import type { LlamaProtocol, LlamaVolumeProtocol } from './defiLlama';
import { inferCategory } from '../utils/categorize';

export interface EnrichedProtocol extends EnsoProtocol {
  category: string;
  tvl: number;
  volume24h: number;
  volume7d: number;
  llamaCategory: string;
  standards: string[];
  matched: boolean;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[-_\s.]/g, '').replace(/v\d+/g, '');
}

function buildVolumeMap(
  dex: LlamaVolumeProtocol[],
  lending: LlamaVolumeProtocol[],
): Map<string, { vol24h: number; vol7d: number }> {
  const map = new Map<string, { vol24h: number; vol7d: number }>();
  for (const p of [...dex, ...lending]) {
    const key = normalise(p.name);
    const existing = map.get(key);
    const vol24h = p.total24h ?? 0;
    const vol7d = p.total7d ?? 0;
    if (!existing || vol24h > existing.vol24h) {
      map.set(key, { vol24h, vol7d });
    }
  }
  return map;
}

function matchLlama(
  ensoSlug: string,
  ensoProjectId: string,
  llamaMap: Map<string, LlamaProtocol>,
): LlamaProtocol | undefined {
  const normSlug = normalise(ensoSlug);
  const normProject = normalise(ensoProjectId);

  // 1. exact slug match
  if (llamaMap.has(normSlug)) return llamaMap.get(normSlug);
  // 2. exact project match
  if (llamaMap.has(normProject)) return llamaMap.get(normProject);
  // 3. partial: enso slug starts with a llama key (min 4 chars)
  for (const [key, proto] of llamaMap) {
    if (key.length >= 4 && normSlug.startsWith(key)) return proto;
    if (key.length >= 4 && key.startsWith(normSlug) && normSlug.length >= 4) return proto;
  }
  // 4. partial on project id
  for (const [key, proto] of llamaMap) {
    if (key.length >= 4 && normProject.startsWith(key)) return proto;
  }
  return undefined;
}

export function buildStandardsMap(standards: EnsoStandardEntry[]): Map<string, string[]> {
  return buildMap(standards);
}

export function crossReference(
  ensoProtocols: EnsoProtocol[],
  llamaProtocols: LlamaProtocol[],
  dexVolumes: LlamaVolumeProtocol[],
  lendingVolumes: LlamaVolumeProtocol[],
  standardsMap: Map<string, string[]>,
): EnrichedProtocol[] {
  // Build lookup maps
  const llamaByNorm = new Map<string, LlamaProtocol>();
  for (const p of llamaProtocols) {
    const key = normalise(p.slug || p.name);
    if (!llamaByNorm.has(key) || (llamaByNorm.get(key)!.tvl ?? 0) < (p.tvl ?? 0)) {
      llamaByNorm.set(key, p);
    }
  }

  const volMap = buildVolumeMap(dexVolumes, lendingVolumes);

  return ensoProtocols.map((ep) => {
    const llamaMatch = matchLlama(ep.slug, ep.projectId, llamaByNorm);
    const normName = normalise(ep.name);
    const volEntry = volMap.get(normalise(ep.slug)) ?? volMap.get(normalise(ep.projectId)) ?? volMap.get(normName);
    const protoStandards = standardsMap.get(ep.slug) ?? [];

    return {
      ...ep,
      standards: protoStandards,
      tvl: llamaMatch?.tvl ?? 0,
      llamaCategory: llamaMatch?.category ?? '',
      volume24h: volEntry?.vol24h ?? 0,
      volume7d: volEntry?.vol7d ?? 0,
      matched: !!llamaMatch,
      category: inferCategory(ep.slug, protoStandards, llamaMatch?.category ?? ''),
    };
  });
}

export function computeCoverageGaps(
  ensoProtocols: EnsoProtocol[],
  llamaProtocols: LlamaProtocol[],
  minTvl = 200_000_000,
): LlamaProtocol[] {
  const ensoNorms = new Set<string>();
  for (const p of ensoProtocols) {
    ensoNorms.add(normalise(p.slug));
    ensoNorms.add(normalise(p.projectId));
    ensoNorms.add(normalise(p.name));
  }

  return llamaProtocols
    .filter((p) => {
      if ((p.tvl ?? 0) < minTvl) return false;
      const norm = normalise(p.slug || p.name);
      // Check if any enso slug starts with or contains this llama slug
      for (const ensoNorm of ensoNorms) {
        if (ensoNorm.startsWith(norm) || norm.startsWith(ensoNorm)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, 30);
}
