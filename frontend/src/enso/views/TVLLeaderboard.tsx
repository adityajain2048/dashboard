import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import { CATEGORY_COLORS } from '../utils/categorize';
import type { EnrichedProtocol } from '../api/merge';
import type { EnsoStandardEntry } from '../api/enso';
import type { Category } from '../utils/categorize';

interface ProtocolDepthProps {
  protocols: EnrichedProtocol[];
  standards: EnsoStandardEntry[];
}

export function TVLLeaderboard({ protocols, standards }: ProtocolDepthProps) {
  // Build: protocol slug → { actionCount, actionTypes, chains, patterns }
  const depthMap = new Map<string, { actions: Set<string>; patterns: Set<string> }>();

  for (const entry of standards) {
    const slug = entry.protocol.slug;
    if (!depthMap.has(slug)) depthMap.set(slug, { actions: new Set(), patterns: new Set() });
    const d = depthMap.get(slug)!;
    for (const a of entry.actions) {
      d.actions.add(a.action);
      d.patterns.add(a.name.split('_').slice(0, -1).join('_'));
    }
    // Include forks under same depth
    for (const fork of entry.forks) {
      if (!depthMap.has(fork.slug)) depthMap.set(fork.slug, { actions: new Set(), patterns: new Set() });
      const fd = depthMap.get(fork.slug)!;
      for (const a of entry.actions) { fd.actions.add(a.action); fd.patterns.add(a.name.split('_').slice(0, -1).join('_')); }
    }
  }

  // Join with enriched protocols for name + category
  const data = protocols
    .map((p) => {
      const depth = depthMap.get(p.slug);
      return {
        name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name,
        fullName: p.name,
        actionCount: depth?.actions.size ?? 0,
        patterns: depth ? [...depth.patterns].join(', ') : '',
        actions: depth ? [...depth.actions].join(', ') : '',
        chains: p.chains.length,
        category: p.category,
      };
    })
    .filter((p) => p.actionCount > 0)
    .sort((a, b) => b.actionCount - a.actionCount || b.chains - a.chains)
    .slice(0, 30);

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Protocol Integration Depth — Top 30"
        subtitle="How many distinct action types Enso supports per protocol (deposit, borrow, harvest, CLMM…) — this is Enso's moat"
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(Object.entries(CATEGORY_COLORS) as [Category, string][]).map(([cat, color]) => (
          <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
            {cat}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={520}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 48, top: 0, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            label={{ value: 'Supported action types', position: 'insideBottom', offset: -2, fill: '#4b5563', fontSize: 11 }}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={140}
            tick={{ fill: '#d1d5db', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: unknown, _: unknown, props: { payload?: { fullName?: string; actions?: string; patterns?: string; chains?: number; category?: string } }) => [
              `${value} action types`,
              `${props.payload?.actions ?? ''} · ${props.payload?.chains ?? 0} chains · ${props.payload?.category ?? ''}`,
            ]}
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
            itemStyle={{ color: '#9ca3af' }}
          />
          <Bar dataKey="actionCount" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={CATEGORY_COLORS[entry.category as Category] ?? '#6b7280'} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
