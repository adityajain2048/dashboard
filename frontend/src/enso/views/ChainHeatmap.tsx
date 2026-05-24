import { SectionHeader } from '../components/SectionHeader';
import { CATEGORIES, CATEGORY_COLORS } from '../utils/categorize';
import { formatChain } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { Category } from '../utils/categorize';

interface ChainHeatmapProps {
  protocols: EnrichedProtocol[];
}

export function ChainHeatmap({ protocols }: ChainHeatmapProps) {
  // Build chain → category → count
  const matrix = new Map<string, Map<Category, number>>();
  const chainTotals = new Map<string, number>();

  for (const p of protocols) {
    for (const c of p.chains) {
      const chainKey = c.name || c.displayName;
      if (!matrix.has(chainKey)) matrix.set(chainKey, new Map());
      const catMap = matrix.get(chainKey)!;
      const cat = p.category as Category;
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
      chainTotals.set(chainKey, (chainTotals.get(chainKey) ?? 0) + 1);
    }
  }

  const topChains = [...chainTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name]) => name);

  const maxCount = Math.max(
    ...topChains.flatMap((chain) =>
      CATEGORIES.map((cat) => matrix.get(chain)?.get(cat) ?? 0),
    ),
  );

  const usedCats = CATEGORIES.filter((cat) =>
    topChains.some((chain) => (matrix.get(chain)?.get(cat) ?? 0) > 0),
  );

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Chain × Category Integration Depth"
        subtitle="Number of protocols Enso has integrated per chain per category — darker = deeper"
      />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 11, color: '#6b7280', fontWeight: 500 }}>Chain</th>
              {usedCats.map((cat) => (
                <th key={cat} style={{
                  padding: '6px 8px', fontSize: 10, color: CATEGORY_COLORS[cat],
                  fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'center',
                }}>
                  {cat.replace(' / ', '/')}
                </th>
              ))}
              <th style={{ padding: '6px 8px', fontSize: 11, color: '#6b7280', textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {topChains.map((chain) => {
              const catMap = matrix.get(chain)!;
              const total = chainTotals.get(chain) ?? 0;
              return (
                <tr key={chain} style={{ borderTop: '1px solid #1e1e2e' }}>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: '#d1d5db', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {formatChain(chain)}
                  </td>
                  {usedCats.map((cat) => {
                    const count = catMap.get(cat) ?? 0;
                    const intensity = maxCount > 0 ? count / maxCount : 0;
                    const color = CATEGORY_COLORS[cat];
                    return (
                      <td key={cat} style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {count > 0 ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 32,
                            height: 24,
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            color,
                            background: `${color}${Math.round(intensity * 40 + 10).toString(16).padStart(2, '0')}`,
                          }}>
                            {count}
                          </span>
                        ) : (
                          <span style={{ color: '#2d2d3e', fontSize: 11 }}>·</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px 8px', textAlign: 'center', fontSize: 12, color: '#6CF9D8', fontWeight: 600 }}>
                    {total}
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
