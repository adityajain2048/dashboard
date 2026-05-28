import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import { CATEGORY_COLORS, CATEGORIES } from '../utils/categorize';
import { formatUSD } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { Category } from '../utils/categorize';

interface CategoryBreakdownProps {
  protocols: EnrichedProtocol[];
}

type Mode = 'count' | 'volume';

export function CategoryBreakdown({ protocols }: CategoryBreakdownProps) {
  const [mode, setMode] = useState<Mode>('count');

  const totals = new Map<Category, { count: number; vol24h: number; tvl: number }>();
  for (const cat of CATEGORIES) totals.set(cat, { count: 0, vol24h: 0, tvl: 0 });

  for (const p of protocols) {
    const cat = p.category as Category;
    const ex = totals.get(cat) ?? { count: 0, vol24h: 0, tvl: 0 };
    totals.set(cat, {
      count: ex.count + 1,
      vol24h: ex.vol24h + (p.volume24h ?? 0),
      tvl: ex.tvl + (p.tvl ?? 0),
    });
  }

  const data = [...totals.entries()]
    .filter(([, v]) => mode === 'count' ? v.count > 0 : v.vol24h > 0)
    .map(([cat, v]) => ({ name: cat, count: v.count, vol24h: v.vol24h, tvl: v.tvl }))
    .sort((a, b) => mode === 'count' ? b.count - a.count : b.vol24h - a.vol24h);

  const totalProtos = data.reduce((s, d) => s + d.count, 0);
  const totalVol = data.reduce((s, d) => s + d.vol24h, 0);

  const dataKey = mode === 'count' ? 'count' : 'vol24h';
  const totalValue = mode === 'count' ? totalProtos : totalVol;

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <SectionHeader
          title="Protocol Coverage by Category"
          subtitle={mode === 'count'
            ? 'Number of integrated protocols per DeFi category'
            : '24h ecosystem volume flowing through integrated protocols, by category'}
        />
        <div style={{ display: 'flex', background: '#0a0a14', border: '1px solid #2e2e4e', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          {(['count', 'volume'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: mode === m ? '#1e1e2e' : 'transparent',
                color: mode === m ? '#e5e7eb' : '#6b7280',
                transition: 'all 0.15s',
              }}
            >
              {m === 'count' ? 'By Count' : 'By Volume'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <ResponsiveContainer width={260} height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey={dataKey}
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={108}
              paddingAngle={2}
            >
              {data.map((_entry, i) => (
                <Cell key={`cat-cell-${i}`} fill={CATEGORY_COLORS[data[i].name as Category] ?? '#6b7280'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: unknown, _: unknown, props: { payload?: { count?: number; vol24h?: number } }) => {
                const pct = totalValue > 0 ? Math.round((Number(v)) / totalValue * 100) : 0;
                if (mode === 'count') {
                  return [
                    `${v} protocols (${pct}%)`,
                    props.payload?.vol24h ? `24h vol: ${formatUSD(props.payload.vol24h)}` : 'No volume data',
                  ];
                }
                return [
                  `${formatUSD(Number(v))} (${pct}%)`,
                  `${props.payload?.count ?? 0} protocols`,
                ];
              }}
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div style={{ flex: 1, minWidth: 180 }}>
          {data.map((entry, i) => {
            const color = CATEGORY_COLORS[entry.name as Category] ?? '#6b7280';
            const value = mode === 'count' ? entry.count : entry.vol24h;
            const pct = totalValue > 0 ? Math.round((value / totalValue) * 100) : 0;
            return (
              <div key={`cat-row-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: color }} />
                <span style={{ flex: 1, fontSize: 13, color: '#d1d5db' }}>{entry.name}</span>
                {mode === 'volume' && entry.vol24h > 0 && (
                  <span style={{ fontSize: 11, color: '#4b5563', marginRight: 4 }}>{entry.count} protos</span>
                )}
                {mode === 'count' && entry.vol24h > 0 && (
                  <span style={{ fontSize: 11, color: '#4b5563', marginRight: 4 }}>{formatUSD(entry.vol24h)}</span>
                )}
                <span style={{
                  fontSize: 12, fontWeight: 700, color,
                  background: `${color}1a`, padding: '1px 7px', borderRadius: 5, minWidth: 48, textAlign: 'center',
                }}>
                  {mode === 'count' ? String(entry.count) : formatUSD(entry.vol24h)}
                </span>
                <span style={{ fontSize: 10, color: '#4b5563', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
              </div>
            );
          })}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e1e2e', fontSize: 11, color: '#4b5563' }}>
            {mode === 'count'
              ? 'Protocol count by category — not TVL (Enso holds no assets)'
              : 'Ecosystem 24h volume by category — flows through underlying protocols'}
          </div>
        </div>
      </div>
    </div>
  );
}
