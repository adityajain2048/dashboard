import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import { CATEGORY_COLORS, CATEGORIES } from '../utils/categorize';
import { formatUSD } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { Category } from '../utils/categorize';

interface VolumeLeaderboardProps {
  protocols: EnrichedProtocol[];
}

export function VolumeLeaderboard({ protocols }: VolumeLeaderboardProps) {
  const data = [...protocols]
    .filter((p) => (p.volume24h ?? 0) > 0)
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, 25)
    .map((p) => ({
      name: p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name,
      fullName: p.name,
      vol24h: p.volume24h ?? 0,
      vol7d: p.volume7d ?? 0,
      tvl: p.tvl ?? 0,
      category: p.category,
      chains: p.chains.length,
    }));

  const total24h = data.reduce((s, d) => s + d.vol24h, 0);
  const total7d = data.reduce((s, d) => s + d.vol7d, 0);

  // Volume by category for the legend summary
  const volByCategory = new Map<string, number>();
  for (const p of protocols) {
    if ((p.volume24h ?? 0) > 0) {
      volByCategory.set(p.category, (volByCategory.get(p.category) ?? 0) + (p.volume24h ?? 0));
    }
  }
  const catSummary = [...volByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <SectionHeader
          title="Ecosystem Volume Leaders — Top 25"
          subtitle="24h volume flowing through protocols Enso has integrated. Volume belongs to underlying protocols — Enso provides the routing layer."
        />
        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 16, flexShrink: 0, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#10B981', fontVariantNumeric: 'tabular-nums' }}>{formatUSD(total24h)}</div>
            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 1 }}>24h addressable vol</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#6CF9D8', fontVariantNumeric: 'tabular-nums' }}>{formatUSD(total7d)}</div>
            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 1 }}>7d addressable vol</div>
          </div>
        </div>
      </div>

      {/* Category vol breakdown strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {catSummary.map(([cat, vol]) => {
          const color = CATEGORY_COLORS[cat as Category] ?? '#6b7280';
          const pct = total24h > 0 ? ((vol / total24h) * 100).toFixed(0) : '0';
          return (
            <div key={cat} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: `${color}12`, border: `1px solid ${color}30`,
              borderRadius: 6, padding: '4px 10px',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{cat}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{formatUSD(vol)}</span>
              <span style={{ fontSize: 10, color: '#4b5563' }}>{pct}%</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {(Object.entries(CATEGORY_COLORS) as [Category, string][]).map(([cat, color]) => (
          <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
            {cat}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={580}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 90, top: 0, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatUSD(v)}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={148}
            tick={{ fill: '#d1d5db', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number, _: string, props: { payload?: { fullName?: string; vol7d?: number; tvl?: number; chains?: number; category?: string } }) => [
              formatUSD(value),
              `7d: ${formatUSD(props.payload?.vol7d ?? 0)} · TVL: ${formatUSD(props.payload?.tvl ?? 0)} · ${props.payload?.chains ?? 0} chains`,
            ]}
            labelFormatter={(label: string, payload) => payload?.[0]?.payload?.fullName ?? label}
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
            itemStyle={{ color: '#9ca3af' }}
          />
          <Bar
            dataKey="vol24h"
            radius={[0, 4, 4, 0]}
            label={{ position: 'right', formatter: (v: number) => formatUSD(v), fill: '#6b7280', fontSize: 10 }}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={CATEGORY_COLORS[entry.category as Category] ?? '#6b7280'} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ marginTop: 12, fontSize: 11, color: '#374151', textAlign: 'center' }}>
        Source: DefiLlama DEX + lending volume APIs · Ecosystem-level (not Enso's own throughput) · Only protocols with DefiLlama volume data shown
      </div>
    </div>
  );
}
