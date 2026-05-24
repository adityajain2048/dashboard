import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import type { StandardSummary } from '../api/enso';

interface StandardsBreakdownProps {
  summaries: StandardSummary[];
}

const STD_COLORS = ['#6CF9D8', '#7B61FF', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#EF4444', '#8B5CF6', '#F97316', '#14B8A6'];

// Group fine-grained patterns into readable buckets
function bucketPattern(pattern: string): string {
  const p = pattern.toLowerCase();
  if (p.includes('erc4626')) return 'ERC4626 Vault';
  if (p.includes('aave') || p.includes('spark')) return 'Aave / Spark';
  if (p.includes('compound') || p.includes('ctoken')) return 'Compound';
  if (p.includes('curve') || p.includes('crv')) return 'Curve';
  if (p.includes('balancer')) return 'Balancer';
  if (p.includes('uniswap') || p.includes('univ')) return 'Uniswap';
  if (p.includes('morpho')) return 'Morpho';
  if (p.includes('pendle')) return 'Pendle';
  if (p.includes('convex')) return 'Convex';
  if (p.includes('gauge') || p.includes('staking')) return 'Gauge / Staking';
  if (p.includes('ccip') || p.includes('cctp') || p.includes('bridge')) return 'Bridge';
  return 'Other';
}

export function StandardsBreakdown({ summaries }: StandardsBreakdownProps) {
  // Bucket into readable groups
  const buckets = new Map<string, { count: number; patterns: string[]; actions: Set<string> }>();
  for (const s of summaries) {
    const bucket = bucketPattern(s.pattern);
    const existing = buckets.get(bucket) ?? { count: 0, patterns: [], actions: new Set() };
    existing.count += s.protocolCount;
    existing.patterns.push(s.pattern);
    for (const a of s.actionTypes) existing.actions.add(a);
    buckets.set(bucket, existing);
  }

  const data = [...buckets.entries()]
    .map(([name, v], i) => ({
      name,
      count: v.count,
      patterns: v.patterns.length,
      actions: [...v.actions].join(', '),
      color: STD_COLORS[i % STD_COLORS.length],
    }))
    .sort((a, b) => b.count - a.count);

  const top = data.slice(0, 8);
  const overflow = data.slice(8);
  const otherCount = overflow.reduce((s, d) => s + d.count, 0);
  if (otherCount > 0) {
    const lastName = top.at(-1)?.name;
    top.push({
      name: lastName === 'Other' ? 'Misc. Patterns' : 'Other',
      count: otherCount,
      patterns: overflow.length,
      actions: overflow.map((d) => d.name).slice(0, 3).join(', '),
      color: '#374151',
    });
  }

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Integration Standards"
        subtitle={`${summaries.length} unique patterns across all protocols — grouped by standard family`}
      />
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <ResponsiveContainer width={220} height={220}>
          <PieChart>
            <Pie
              data={top}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={95}
              paddingAngle={3}
            >
              {top.map((_entry, i) => (
                <Cell key={`std-cell-${i}`} fill={top[i].color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, _: string, props: { payload?: { patterns?: number; actions?: string } }) => [
                `${v} protocols`,
                `${props.payload?.patterns ?? 0} patterns · ${props.payload?.actions ?? ''}`,
              ]}
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div style={{ flex: 1, minWidth: 180 }}>
          {top.map((std, i) => (
            <div key={`std-row-${i}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 0',
              borderBottom: '1px solid #1a1a2e',
            }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: std.color }} />
              <span style={{ flex: 1, fontSize: 12, color: '#d1d5db' }}>{std.name}</span>
              <span style={{ fontSize: 11, color: '#6b7280', marginRight: 6 }}>{std.actions.split(',').slice(0, 3).join(', ')}</span>
              <span style={{
                fontSize: 12, fontWeight: 700, color: std.color,
                background: `${std.color}1a`, padding: '1px 7px', borderRadius: 5, minWidth: 28, textAlign: 'center',
              }}>
                {std.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
