import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import { CATEGORY_COLORS, CATEGORIES } from '../utils/categorize';
import { formatUSD } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { Category } from '../utils/categorize';

interface CategoryBreakdownProps {
  protocols: EnrichedProtocol[];
}

export function CategoryBreakdown({ protocols }: CategoryBreakdownProps) {
  const totals = new Map<Category, { count: number; vol24h: number }>();
  for (const cat of CATEGORIES) totals.set(cat, { count: 0, vol24h: 0 });

  for (const p of protocols) {
    const cat = p.category as Category;
    const ex = totals.get(cat) ?? { count: 0, vol24h: 0 };
    totals.set(cat, { count: ex.count + 1, vol24h: ex.vol24h + (p.volume24h ?? 0) });
  }

  const data = [...totals.entries()]
    .filter(([, v]) => v.count > 0)
    .map(([cat, v]) => ({ name: cat, count: v.count, vol24h: v.vol24h }))
    .sort((a, b) => b.count - a.count);

  const totalProtos = data.reduce((s, d) => s + d.count, 0);

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Protocol Coverage by Category"
        subtitle="What kinds of DeFi protocols Enso has integrated — by protocol count and ecosystem volume they route"
      />
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <ResponsiveContainer width={260} height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
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
              formatter={(v: number, _: string, props: { payload?: { vol24h?: number } }) => [
                `${v} protocols (${Math.round((v / totalProtos) * 100)}%)`,
                props.payload?.vol24h ? `Ecosystem vol: ${formatUSD(props.payload.vol24h)}` : 'No volume data',
              ]}
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, minWidth: 180 }}>
          {data.map((entry, i) => {
            const color = CATEGORY_COLORS[entry.name as Category] ?? '#6b7280';
            return (
              <div key={`cat-row-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: color }} />
                <span style={{ flex: 1, fontSize: 13, color: '#d1d5db' }}>{entry.name}</span>
                {entry.vol24h > 0 && (
                  <span style={{ fontSize: 11, color: '#4b5563', marginRight: 4 }}>
                    {formatUSD(entry.vol24h)} vol
                  </span>
                )}
                <span style={{
                  fontSize: 12, fontWeight: 700, color,
                  background: `${color}1a`, padding: '1px 7px', borderRadius: 5, minWidth: 28, textAlign: 'center',
                }}>
                  {entry.count}
                </span>
              </div>
            );
          })}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e1e2e', fontSize: 11, color: '#4b5563' }}>
            Protocol count by category — not TVL (Enso holds no assets)
          </div>
        </div>
      </div>
    </div>
  );
}
