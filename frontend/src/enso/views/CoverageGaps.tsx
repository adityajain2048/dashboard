import { SectionHeader } from '../components/SectionHeader';
import { CATEGORY_COLORS } from '../utils/categorize';
import { formatUSD } from '../utils/format';
import { inferCategory } from '../utils/categorize';
import type { LlamaProtocol } from '../api/defiLlama';
import type { Category } from '../utils/categorize';

interface CoverageGapsProps {
  gaps: LlamaProtocol[];
}

export function CoverageGaps({ gaps }: CoverageGapsProps) {
  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Coverage Gaps — Top Unintegrated Protocols"
        subtitle="High-TVL protocols not yet in Enso's integration list — biggest expansion opportunities"
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>#</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Protocol</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TVL</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chains</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((p, i) => {
              const cat = inferCategory(p.slug || p.name, [], p.category);
              const catColor = CATEGORY_COLORS[cat as Category] ?? '#6b7280';
              return (
                <tr key={p.id || p.slug} style={{ borderBottom: '1px solid #13131f' }}>
                  <td style={{ padding: '9px 10px', fontSize: 12, color: '#4b5563' }}>{i + 1}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.logo && (
                        <img src={p.logo} alt="" width={16} height={16} style={{ borderRadius: 4 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <span style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '9px 10px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: catColor,
                      background: `${catColor}1a`, padding: '2px 7px', borderRadius: 5,
                    }}>
                      {cat}
                    </span>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 12, color: '#F59E0B', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {formatUSD(p.tvl ?? 0)}
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: 11, color: '#6b7280' }}>
                    {(p.chains ?? []).slice(0, 4).join(', ')}
                    {(p.chains?.length ?? 0) > 4 && ` +${(p.chains?.length ?? 0) - 4}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
