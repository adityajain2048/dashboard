/* ════════════════════════════════════════════════════════════════════════
   Squid brand primitives + shared UI atoms (ported from the design Brand.jsx).
   ════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { chainMeta, bridgeMeta, aggMeta, contrast } from './meta';
import { CHAIN_LOGOS } from '../config/chains';

/* ─── Squid mascot icon ─── */
export function SquidMark({ size = 28, variant = 'lime' }: { size?: number; variant?: 'lime' | 'purple' | 'white' | 'black' }) {
  const src =
    variant === 'purple' ? '/squid/squid-icon-purple.svg'
    : variant === 'white' ? '/squid/squid-icon-white.svg'
    : variant === 'black' ? '/squid/squid-icon-black.svg'
    : '/squid/squid-icon-yellow.svg';
  return (
    <img
      src={src}
      alt="Squid"
      width={size}
      height={size}
      style={{ display: 'block', borderRadius: variant === 'lime' || variant === 'purple' ? '50%' : 0 }}
    />
  );
}

export function SquidWordmark({ height = 20, dark = false }: { height?: number; dark?: boolean }) {
  return (
    <img
      src={`/squid/${dark ? 'Squid_Logo_Black' : 'Squid_Logo_White'}.svg`}
      alt="Squid"
      style={{ height, display: 'block' }}
    />
  );
}

/* ─── Chain chip: logo image w/ brand-color + abbr fallback ─── */
export function ChainChip({ id, size = 26, ring = false }: { id: string; size?: number; ring?: boolean }) {
  const c = chainMeta(id);
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = CHAIN_LOGOS[id];
  const br = Math.round(size * 0.3);
  const ringStyle = ring ? `0 0 0 2px var(--bg-1), 0 0 0 3px ${c.color}55` : undefined;

  if (logoUrl && !imgFailed) {
    return (
      <div
        title={c.name}
        style={{ width: size, height: size, borderRadius: br, overflow: 'hidden', flexShrink: 0, boxShadow: ringStyle }}
      >
        <img
          src={logoUrl}
          alt={c.name}
          width={size}
          height={size}
          style={{ display: 'block', width: size, height: size, objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  // Fallback: brand-colored square with abbreviation
  const fs = size <= 20 ? 7 : size <= 26 ? 8 : 9;
  const abbr = c.abbr.length > 4 ? c.abbr.slice(0, 4) : c.abbr;
  return (
    <div
      title={c.name}
      style={{
        width: size, height: size, borderRadius: br,
        background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: ring ? `0 0 0 2px var(--bg-1), 0 0 0 3px ${c.color}55` : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: fs, color: contrast(c.color), letterSpacing: '-0.02em', lineHeight: 1, zIndex: 1 }}>
        {abbr}
      </span>
    </div>
  );
}

export function ChainLabel({ id, size = 22, sub = false }: { id: string; size?: number; sub?: boolean }) {
  const c = chainMeta(id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <ChainChip id={id} size={size} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
        {sub && <div className="t-mono-xs" style={{ marginTop: 1 }}>{c.type}</div>}
      </div>
    </div>
  );
}

/* ─── Bridge / aggregator dot + name ─── */
export function BridgeTag({ id, kind = 'bridge', size = 8 }: { id: string; kind?: 'bridge' | 'agg'; size?: number }) {
  const meta = kind === 'agg' ? aggMeta(id) : bridgeMeta(id);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: size, height: size, borderRadius: 3, background: meta.color, flexShrink: 0, boxShadow: `0 0 8px ${meta.color}66` }} />
      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)' }}>{meta.name}</span>
    </span>
  );
}

/* ─── Pill / badge ─── */
type PillTone = 'default' | 'win' | 'lime' | 'lav' | 'good' | 'warn' | 'bad';
const PILL_TONES: Record<PillTone, { fg: string; bg: string; bd: string }> = {
  default: { fg: 'var(--fg-2)', bg: 'var(--bg-3)', bd: 'var(--line)' },
  win:     { fg: 'var(--on-lime)', bg: 'var(--squid-lime)', bd: 'transparent' },
  lime:    { fg: 'var(--squid-lime)', bg: 'rgba(230,250,54,0.10)', bd: 'rgba(230,250,54,0.30)' },
  lav:     { fg: 'var(--squid-lavender)', bg: 'rgba(188,142,228,0.12)', bd: 'rgba(188,142,228,0.30)' },
  good:    { fg: 'var(--good)', bg: 'rgba(123,224,166,0.10)', bd: 'rgba(123,224,166,0.28)' },
  warn:    { fg: 'var(--warn)', bg: 'rgba(245,196,81,0.10)', bd: 'rgba(245,196,81,0.28)' },
  bad:     { fg: 'var(--bad)', bg: 'rgba(255,107,129,0.10)', bd: 'rgba(255,107,129,0.28)' },
};

export function Pill({ children, tone = 'default', solid = false, style = {} }: { children: ReactNode; tone?: PillTone; solid?: boolean; style?: CSSProperties }) {
  const t = PILL_TONES[tone] ?? PILL_TONES.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 10, letterSpacing: '0.03em',
      textTransform: 'uppercase', padding: '3px 8px', borderRadius: 'var(--r-pill)',
      color: t.fg, background: solid ? t.fg : t.bg, border: `1px solid ${t.bd}`,
      whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

/* ─── Card shell ─── */
export function Card({ children, pad = 18, hover = false, style = {}, ...rest }: { children: ReactNode; pad?: number; hover?: boolean; style?: CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={hover ? 'sq-card sq-card-hover' : 'sq-card'} style={{ padding: pad, ...style }} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ accent = 'var(--squid-lime)', children, sub, right }: { accent?: string; children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 4, height: 18, borderRadius: 2, background: accent, boxShadow: `0 0 10px ${accent}88` }} />
        <span className="t-h3">{children}</span>
        {sub && <span className="t-caption" style={{ marginLeft: 2 }}>{sub}</span>}
      </div>
      {right}
    </div>
  );
}

/* ─── Tiny sparkline ─── */
export function Spark({ data, color = 'var(--squid-lime)', w = 64, h = 20 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * w},${h - ((v - min) / span) * h}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
