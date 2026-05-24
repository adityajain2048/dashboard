import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { SectionHeader } from '../components/SectionHeader';
import type { EnsoAction, EnsoStandardEntry } from '../api/enso';

interface ActionCoverageProps {
  actions: EnsoAction[];
  standards: EnsoStandardEntry[];
}

const ACTION_COLORS: Record<string, string> = {
  deposit: '#10B981',
  depositclmm: '#059669',
  depositwithestimate: '#6EE7B7',
  redeem: '#34D399',
  redeemclmm: '#047857',
  redeemwithestimate: '#A7F3D0',
  withdraw: '#10B981',
  borrow: '#3B82F6',
  repay: '#60A5FA',
  swap: '#F59E0B',
  route: '#FCD34D',
  bridge: '#EF4444',
  harvest: '#EC4899',
  flashloan: '#8B5CF6',
  approve: '#6b7280',
  transfer: '#9ca3af',
  transferfrom: '#6b7280',
  permittransferfrom: '#4b5563',
  balance: '#6b7280',
  call: '#6b7280',
  fee: '#6b7280',
  merge: '#6b7280',
  split: '#6b7280',
};

const ACTION_LABELS: Record<string, string> = {
  depositclmm: 'Deposit (CLMM)',
  redeemclmm: 'Redeem (CLMM)',
  depositwithestimate: 'Deposit w/ Estimate',
  redeemwithestimate: 'Redeem w/ Estimate',
  transferfrom: 'TransferFrom',
  permittransferfrom: 'Permit TransferFrom',
  flashloan: 'Flashloan',
};

export function ActionCoverage({ actions, standards }: ActionCoverageProps) {
  // Count how many protocol standards support each action type
  const actionCounts = new Map<string, number>();
  const protocolsPerAction = new Map<string, Set<string>>();

  for (const entry of standards) {
    for (const a of entry.actions) {
      const key = a.action.toLowerCase();
      actionCounts.set(key, (actionCounts.get(key) ?? 0) + 1);
      if (!protocolsPerAction.has(key)) protocolsPerAction.set(key, new Set());
      protocolsPerAction.get(key)!.add(entry.protocol.slug);
    }
  }

  // Merge with known actions from /actions endpoint
  const allActionKeys = new Set([
    ...actions.map((a) => a.action.toLowerCase()),
    ...actionCounts.keys(),
  ]);

  const data = [...allActionKeys]
    .map((key) => {
      const label = ACTION_LABELS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
      return {
        name: label,
        key,
        implementations: actionCounts.get(key) ?? 0,
        protocols: protocolsPerAction.get(key)?.size ?? 0,
      };
    })
    .filter((d) => d.implementations > 0)
    .sort((a, b) => b.implementations - a.implementations);

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Action Type Coverage"
        subtitle="Number of protocol implementations per DeFi action type"
      />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 50, top: 0, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={96}
            tick={{ fill: '#d1d5db', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string, props: { payload?: { protocols?: number } }) =>
              name === 'implementations'
                ? [`${value} implementations · ${props.payload?.protocols ?? 0} protocols`, 'Coverage']
                : [value, name]
            }
            contentStyle={{ background: '#1a1a2e', border: '1px solid #2e2e4e', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb', fontWeight: 600 }}
          />
          <Bar dataKey="implementations" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={ACTION_COLORS[entry.key] ?? '#6b7280'} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
