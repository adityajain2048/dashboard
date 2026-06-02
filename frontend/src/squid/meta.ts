/* ════════════════════════════════════════════════════════════════════════
   Squid metadata + formatting helpers.
   Chain meta comes from config/chains (the real 56-chain registry); bridge and
   aggregator meta (name + brand colour) live here. Everything is keyed by the
   canonical slugs the backend emits in `bridge` / `source` fields.
   ════════════════════════════════════════════════════════════════════════ */
import { getChainMeta, type ChainMeta } from '../config/chains';

export interface TagMeta {
  id: string;
  name: string;
  color: string;
}

/** Bridge brand colours — superset of the design palette + backend bridges. */
const BRIDGE_META: Record<string, TagMeta> = {
  across:       { id: 'across',       name: 'Across',        color: '#6CF9D8' },
  stargate:     { id: 'stargate',     name: 'Stargate',      color: '#FFD700' },
  relay:        { id: 'relay',        name: 'Relay',         color: '#FF6B6B' },
  debridge:     { id: 'debridge',     name: 'deBridge',      color: '#9945FF' },
  mayan:        { id: 'mayan',        name: 'Mayan',         color: '#F59E0B' },
  cctp:         { id: 'cctp',         name: 'CCTP',          color: '#2775CA' },
  symbiosis:    { id: 'symbiosis',    name: 'Symbiosis',     color: '#34D399' },
  orbiter:      { id: 'orbiter',      name: 'Orbiter',       color: '#60A5FA' },
  squid:        { id: 'squid',        name: 'Squid Coral',   color: '#E6FA36' },
  hop:          { id: 'hop',          name: 'Hop',           color: '#A78BFA' },
  meson:        { id: 'meson',        name: 'Meson',         color: '#00E5FF' },
  thorchain:    { id: 'thorchain',    name: 'THORChain',     color: '#0098EA' },
  cbridge:      { id: 'cbridge',      name: 'cBridge',       color: '#F472B6' },
  everclear:    { id: 'everclear',    name: 'Everclear',     color: '#627EEA' },
  wormhole:     { id: 'wormhole',     name: 'Wormhole',      color: '#8247E5' },
  chainflip:    { id: 'chainflip',    name: 'Chainflip',     color: '#1DB954' },
  garden:       { id: 'garden',       name: 'Garden',        color: '#804A26' },
  allbridge:    { id: 'allbridge',    name: 'Allbridge',     color: '#EC796B' },
  synapse:      { id: 'synapse',      name: 'Synapse',       color: '#BC8EE4' },
  gaszip:       { id: 'gaszip',       name: 'GasZip',        color: '#F5C451' },
  ibc:          { id: 'ibc',          name: 'IBC',           color: '#7C3AED' },
  near:         { id: 'near',         name: 'NEAR',          color: '#00C1DE' },
  polymer:      { id: 'polymer',      name: 'Polymer',       color: '#7EB8F7' },
  eco:          { id: 'eco',          name: 'Eco',           color: '#86EFAC' },
  lifiintents:  { id: 'lifiintents',  name: 'LI.FI Intents', color: '#CBA6EE' },
  glacis:       { id: 'glacis',       name: 'Glacis',        color: '#F87171' },
  mayanmctp:    { id: 'mayanmctp',    name: 'Mayan MCTP',    color: '#FCD34D' },
  near_intents: { id: 'near_intents', name: 'NEAR Intents',  color: '#00A8D4' },
  stealthex:    { id: 'stealthex',    name: 'StealthEx',     color: '#A855F7' },
};

/** Aggregator brand colours (the four data sources + Squid). */
const AGG_META: Record<string, TagMeta> = {
  lifi:   { id: 'lifi',   name: 'LI.FI',  color: '#BC8EE4' },
  rango:  { id: 'rango',  name: 'Rango',  color: '#7BE0A6' },
  bungee: { id: 'bungee', name: 'Bungee', color: '#F5C451' },
  rubic:  { id: 'rubic',  name: 'Rubic',  color: '#FF9159' },
  squid:  { id: 'squid',  name: 'Squid',  color: '#E6FA36' },
};

/** Deterministic fallback colour for any slug we don't have a brand colour for. */
function hashColor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 60% 60%)`;
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function bridgeMeta(id: string): TagMeta {
  const key = (id ?? '').toLowerCase();
  return BRIDGE_META[key] ?? { id: key, name: titleCase(key), color: hashColor(key) };
}

export function aggMeta(id: string): TagMeta {
  const key = (id ?? '').toLowerCase();
  return AGG_META[key] ?? { id: key, name: titleCase(key), color: hashColor(key) };
}

export function chainMeta(id: string): ChainMeta {
  return getChainMeta(id);
}

/* ─── formatting helpers (ported from Brand.jsx) ──────────────────────────── */
export function contrast(hex: string): string {
  if (!hex.startsWith('#')) return '#0B0B0F';
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0B0B0F' : '#FFFFFF';
}

export function fmtUsd(n: number | null | undefined, dp = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtPct(bps: number | null | undefined): string {
  return ((bps || 0) / 100).toFixed(2) + '%';
}

export function fmtTime(s: number | null | undefined): string {
  const v = s ?? 0;
  return v < 60 ? `${v}s` : v < 3600 ? `${Math.round(v / 60)}m` : `${(v / 3600).toFixed(1)}h`;
}

const HEAT_VARS = ['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'] as const;
const HEAT_HEX = ['#34D17A', '#9BD63F', '#E8D43A', '#F2A93E', '#EC7A3C', '#E04444'] as const;

function heatIndex(bps: number): number {
  if (bps < 10) return 0;
  if (bps < 25) return 1;
  if (bps < 50) return 2;
  if (bps < 100) return 3;
  if (bps < 200) return 4;
  return 5;
}

/** CSS var() colour for a fee in bps (cheap → expensive). */
export function heatColor(bps: number | null | undefined): string {
  if (bps == null) return 'transparent';
  return `var(${HEAT_VARS[heatIndex(bps)]})`;
}

/** Resolved hex for a fee in bps — used where contrast() needs a real colour. */
export function heatHex(bps: number | null | undefined): string {
  if (bps == null) return '#222';
  return HEAT_HEX[heatIndex(bps)];
}
