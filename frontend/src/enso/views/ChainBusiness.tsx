import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import { formatChain, formatUSD } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { EnsoStandardEntry } from '../api/enso';

interface ChainBusinessProps {
  protocols: EnrichedProtocol[];
  standards: EnsoStandardEntry[];
}

export function ChainBusiness({ protocols, standards }: ChainBusinessProps) {
  // Build chain → total implementation count (protocol-action pairs) from standards
  const chainImplMap = new Map<string, number>();
  for (const entry of standards) {
    for (const a of entry.actions) {
      for (const c of a.supportedChains) {
        const key = c.name;
        chainImplMap.set(key, (chainImplMap.get(key) ?? 0) + 1);
      }
    }
  }

  // Chain → protocol count + routable volume (vol of protocols on that chain, for context only)
  const chainMap = new Map<string, { protocolCount: number; vol24h: number; implementations: number }>();
  for (const p of protocols) {
    for (const c of p.chains) {
      const key = c.name || c.displayName;
      const ex = chainMap.get(key) ?? { protocolCount: 0, vol24h: 0, implementations: 0 };
      chainMap.set(key, {
        protocolCount: ex.protocolCount + 1,
        vol24h: ex.vol24h + (p.volume24h ?? 0) / Math.max(p.chains.length, 1),
        implementations: chainImplMap.get(key) ?? 0,
      });
    }
  }

  const data = [...chainMap.entries()]
    .map(([name, d]) => ({ name: formatChain(name), rawName: name, ...d }))
    .sort((a, b) => b.implementations - a.implementations)
    .slice(0, 15);

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Integration Depth by Chain"
        subtitle="Total protocol-action implementation pairs per chain — shows where Enso has built the deepest coverage"
      />
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ left: 0, right: 16, top: 0, bottom: 50 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            yAxisId="impl"
            orientation="left"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Implementations', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string, props: { payload?: { vol24h?: number } }) => {
              if (name === 'implementations') return [`${value} action implementations`, 'Integration depth'];
              if (name === 'protocolCount') return [`${value} protocols`, 'Protocol count'];
              return [formatUSD(props.payload?.vol24h ?? 0), 'Ecosystem 24h vol (context)'];
            }}
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
          />
          <Legend
            formatter={(value: string) =>
              value === 'implementations' ? 'Action implementations' : 'Protocol count'
            }
            wrapperStyle={{ fontSize: 11, color: '#9ca3af', paddingTop: 8 }}
          />
          <Bar yAxisId="impl" dataKey="implementations" fill="#6CF9D8" radius={[4, 4, 0, 0]} opacity={0.85} name="implementations" />
          <Bar yAxisId="count" dataKey="protocolCount" fill="#7B61FF" radius={[4, 4, 0, 0]} opacity={0.7} name="protocolCount" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
