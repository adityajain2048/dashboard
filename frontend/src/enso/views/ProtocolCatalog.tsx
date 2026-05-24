import { useState, useMemo } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { ChainBadge } from '../components/ChainBadge';
import { CATEGORY_COLORS, CATEGORIES } from '../utils/categorize';
import { formatUSD } from '../utils/format';
import type { EnrichedProtocol } from '../api/merge';
import type { Category } from '../utils/categorize';

interface ProtocolCatalogProps {
  protocols: EnrichedProtocol[];
}

type SortKey = 'tvl' | 'name' | 'chains' | 'volume24h';

export function ProtocolCatalog({ protocols }: ProtocolCatalogProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('tvl');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    let list = protocols;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'All') {
      list = list.filter((p) => p.category === categoryFilter);
    }
    return [...list].sort((a, b) => {
      const av = sortKey === 'name' ? a.name : sortKey === 'chains' ? a.chains.length : a[sortKey];
      const bv = sortKey === 'name' ? b.name : sortKey === 'chains' ? b.chains.length : b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sortDir;
      return ((bv as number) - (av as number)) * sortDir;
    });
  }, [protocols, search, categoryFilter, sortKey, sortDir]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === -1 ? 1 : -1));
    else { setSortKey(key); setSortDir(-1); }
    setPage(0);
  }

  const SortArrow = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === -1 ? '↓' : '↑'}</span> : null;

  return (
    <div style={{ background: '#12121e', border: '1px solid #1e1e2e', borderRadius: 12, padding: '24px', marginBottom: 20 }}>
      <SectionHeader
        title="Protocol Catalog"
        subtitle={`All ${protocols.length} integrated protocols — searchable and filterable`}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search protocols…"
          style={{
            background: '#0a0a14', border: '1px solid #2e2e4e', borderRadius: 8,
            color: '#e5e7eb', padding: '7px 12px', fontSize: 13, outline: 'none', width: 220,
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['All', ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategoryFilter(cat); setPage(0); }}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 500,
                border: categoryFilter === cat ? `1px solid ${cat === 'All' ? '#6CF9D8' : CATEGORY_COLORS[cat as Category]}` : '1px solid #2e2e4e',
                background: categoryFilter === cat ? (cat === 'All' ? '#6CF9D81a' : `${CATEGORY_COLORS[cat as Category]}1a`) : 'transparent',
                color: categoryFilter === cat ? (cat === 'All' ? '#6CF9D8' : CATEGORY_COLORS[cat as Category]) : '#6b7280',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4b5563' }}>
          {filtered.length} results
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
              {[
                { key: 'name' as SortKey, label: 'Protocol', width: '22%' },
                { key: null, label: 'Category', width: '14%' },
                { key: 'chains' as SortKey, label: 'Chains', width: '22%' },
                { key: null, label: 'Standards', width: '16%' },
                { key: 'tvl' as SortKey, label: 'TVL', width: '13%' },
                { key: 'volume24h' as SortKey, label: '24h Vol', width: '13%' },
              ].map(({ key, label, width }) => (
                <th
                  key={label}
                  onClick={key ? () => toggleSort(key) : undefined}
                  style={{
                    padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#6b7280',
                    fontWeight: 600, cursor: key ? 'pointer' : 'default', width,
                    userSelect: 'none', letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}
                >
                  {label}{key && <SortArrow col={key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((p) => {
              const catColor = CATEGORY_COLORS[p.category as Category] ?? '#6b7280';
              const visibleChains = p.chains.slice(0, 3);
              const extraChains = p.chains.length - visibleChains.length;
              return (
                <tr key={p.slug} style={{ borderBottom: '1px solid #13131f' }}>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.logosUri?.[0] ? (
                        <img src={p.logosUri[0]} alt="" width={18} height={18} style={{ borderRadius: 4 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <span style={{ width: 18, height: 18, borderRadius: 4, background: `${catColor}33`, display: 'inline-block', flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '9px 10px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: catColor,
                      background: `${catColor}1a`, padding: '2px 7px', borderRadius: 5,
                    }}>
                      {p.category}
                    </span>
                  </td>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {visibleChains.map((c) => (
                        <ChainBadge key={c.id} name={c.name || c.displayName} small />
                      ))}
                      {extraChains > 0 && (
                        <span style={{ fontSize: 10, color: '#6b7280', padding: '1px 5px', border: '1px solid #2e2e4e', borderRadius: 4 }}>
                          +{extraChains}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {p.standards.length > 0
                        ? p.standards.map((s) => (
                            <span key={s} style={{ fontSize: 10, color: '#9ca3af', background: '#1e1e2e', padding: '1px 5px', borderRadius: 4 }}>
                              {s}
                            </span>
                          ))
                        : <span style={{ fontSize: 11, color: '#374151' }}>—</span>
                      }
                    </div>
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: 12, color: p.tvl > 0 ? '#6CF9D8' : '#374151', fontVariantNumeric: 'tabular-nums' }}>
                    {formatUSD(p.tvl)}
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: 12, color: p.volume24h > 0 ? '#10B981' : '#374151', fontVariantNumeric: 'tabular-nums' }}>
                    {formatUSD(p.volume24h)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '4px 12px', background: '#1e1e2e', border: '1px solid #2e2e4e', borderRadius: 6, color: '#9ca3af', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page === 0 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '4px 12px', background: '#1e1e2e', border: '1px solid #2e2e4e', borderRadius: 6, color: '#9ca3af', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
