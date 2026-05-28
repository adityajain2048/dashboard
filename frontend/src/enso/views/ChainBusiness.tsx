import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import { formatChain, formatUSD } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { EnsoStandardEntry } from '../api/enso';

interface ChainBusinessProps {
  protocols: EnrichedProtocol[];
  standards: EnsoStandardEntry[];
}

type Mode = 'depth' | 'volume';

export function ChainBusiness({ protocols, standards }: ChainBusinessProps) {
  const [mode, setMode] = useState<Mode>('depth');

  // Chain → total action implementation count
  const chainImplMap = new Map<string, number>();
  for (const entry of standards) {
    for (const a of entry.actions) {
      for (const c of a.supportedChains) {
        chainImplMap.set(c.name, (chainImplMap.get(c.name) ?? 0) + 1);
      }
    }
  }

  // Chain → { protocolCount, vol24h, tvl, implementations }
  const chainMap = new Map<string, { protocolCount: number; vol24h: number; tvl: number; implementations: number }>();
  for (const p of protocols) {
    for (const c of p.chains) {
      const key = c.name || c.displayName;
      const ex = chainMap.get(key) ?? { protocolCount: 0, vol24h: 0, tvl: 0, implementations: 0 };
      chainMap.set(key, {
        protocolCount: ex.protocolCount + 1,
        vol24h: ex.vol24h + (p.volume24h ?? 0) / Math.max(p.chains.length, 1),
        tvl: ex.tvl + (p.tvl ?? 0) / Math.max(p.chains.length, 1),
        implementations: chainImplMap.get(key) ?? 0,
      });
    }
  }

  const allData = [...chainMap.entries()].map(([name, d]) => ({
    name: formatChain(name),
    rawName: name,
    ...d,
  }));

  const data = [...allData]
    .filter((d) => mode === 'volume' ? d.vol24h > 0 : d.implementations > 0)
    .sort((a, b) => mode === 'depth' ? b.implementations - a.implementations : b.vol24h - a.vol24h)
    .slice(0, 15);

  const accent = mode === 'depth' ? '#6CF9D8' : '#10B981';

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <SectionHeader
          title={mode === 'depth' ? 'Integration Depth by Chain' : 'Ecosystem Volume by Chain'}
          subtitle={mode === 'depth'
            ? 'Total protocol-action implementation pairs per chain — where Enso has built the deepest coverage'
            : '24h volume flowing through protocols Enso covers, distributed across chains'}
        />
        <div style={{ display: 'flex', background: '#0a0a14', border: '1px solid #2e2e4e', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          {(['depth', 'volume'] as Mode[]).map((m) => (
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
              {m === 'depth' ? 'By Depth' : 'By Volume'}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 55 }}>
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
            tick={{ fill: '#6b7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={mode === 'volume' ? (v) => formatUSD(v) : undefined}
            label={{
              value: mode === 'depth' ? 'Implementations' : '24h Volume',
              angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10,
            }}
          />
          <Tooltip
            formatter={(value: unknown, _: unknown, props: { payload?: { protocolCount?: number; vol24h?: number; implementations?: number } }) => {
              if (mode === 'depth') {
                return [
                  `${value} action implementations`,
                  `${props.payload?.protocolCount ?? 0} protocols · ${formatUSD(props.payload?.vol24h ?? 0)} 24h vol`,
                ];
              }
              return [
                formatUSD(Number(value)),
                `${props.payload?.protocolCount ?? 0} protocols · ${props.payload?.implementations ?? 0} implementations`,
              ];
            }}
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
          />
          <Bar
            dataKey={mode === 'depth' ? 'implementations' : 'vol24h'}
            radius={[4, 4, 0, 0]}
            opacity={0.85}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
