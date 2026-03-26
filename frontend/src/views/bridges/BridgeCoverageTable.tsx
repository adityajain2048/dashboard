import { useState } from 'react';
import type { BridgeCoverageItem, BridgeHealth } from '../../api/client';
import { getBridgeColor, getBridgeName } from '../../config/bridges';

type SortKey = 'name' | 'routesCovered' | 'wins' | 'winRate' | 'avgFeeBps' | 'chains' | 'chainCoverage';

interface Props {
  bridges: BridgeCoverageItem[];
  health: BridgeHealth[];
  totalActiveRoutes: number;
}

export function BridgeCoverageTable({ bridges, health, totalActiveRoutes }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('wins');
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const DEFAULT_ROWS = 20;

  const healthMap = new Map(health.map(h => [h.id, h]));

  const sorted = [...bridges].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'routesCovered': cmp = a.routesCovered - b.routesCovered; break;
      case 'wins': cmp = a.wins - b.wins; break;
      case 'winRate': cmp = a.winRate - b.winRate; break;
      case 'avgFeeBps': cmp = (a.avgFeeBps ?? 9999) - (b.avgFeeBps ?? 9999); break;
      case 'chains': cmp = (a.supportedChains?.length ?? 0) - (b.supportedChains?.length ?? 0); break;
      case 'chainCoverage': cmp = (a.chainCoveragePct ?? 0) - (b.chainCoveragePct ?? 0); break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const visibleRows = showAll ? sorted : sorted.slice(0, DEFAULT_ROWS);
  const maxRoutes = Math.max(...bridges.map(b => b.routesCovered), 1);

  return (
    <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f0f1c', borderBottom: '1px solid #1e1e3a' }}>
            <Th width={32}>#</Th>
            <ThSort label="Bridge" sortKey="name" current={sortKey} asc={sortAsc} onSort={handleSort} align="left" width={130} />
            <ThSort label="Chains" sortKey="chains" current={sortKey} asc={sortAsc} onSort={handleSort} width={60} />
            <ThSort label="Coverage" sortKey="chainCoverage" current={sortKey} asc={sortAsc} onSort={handleSort} width={170} />
            <ThSort label="Wins" sortKey="wins" current={sortKey} asc={sortAsc} onSort={handleSort} width={60} />
            <ThSort label="Win Rate" sortKey="winRate" current={sortKey} asc={sortAsc} onSort={handleSort} width={70} />
            <ThSort label="Avg Fee" sortKey="avgFeeBps" current={sortKey} asc={sortAsc} onSort={handleSort} width={70} />
            <Th width={60}>Status</Th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((b, i) => {
            const h = healthMap.get(b.id);
            const live = h?.isStale === false;
            const stale = h?.isStale === true;
            const chainCount = b.supportedChains?.length ?? 0;
            const bMaxRoutes = b.maxRoutes ?? 0;
            const covPct = bMaxRoutes > 0 ? Math.min((b.routesCovered / bMaxRoutes) * 100, 100) : 0;

            return (
              <tr
                key={b.id}
                style={{ borderBottom: '1px solid #151525', transition: 'background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#ffffff06'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Rank */}
                <td style={{ padding: '10px 12px', fontSize: 11, color: '#444', fontWeight: 600, textAlign: 'center' }}>
                  {i + 1}
                </td>

                {/* Bridge name */}
                <td style={{ padding: '10px 12px' }}>
                  <div className="flex items-center gap-2">
                    <div style={{
                      width: 10, height: 10, borderRadius: 3,
                      background: getBridgeColor(b.id),
                      boxShadow: `0 0 6px ${getBridgeColor(b.id)}30`,
                    }} />
                    <span style={{ fontSize: 13, color: '#e0e0f0', fontWeight: 600, letterSpacing: '-0.2px' }}>
                      {getBridgeName(b.id)}
                    </span>
                  </div>
                </td>

                {/* Chains supported */}
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: chainCount > 10 ? '#6CF9D8' : '#ccc', fontWeight: 600 }}>
                  {chainCount || '\u2014'}
                </td>

                {/* Coverage — routes found / max routes for this bridge */}
                <td style={{ padding: '10px 12px' }}>
                  <div className="flex items-center gap-3">
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#1a1a2e', overflow: 'hidden' }}>
                      <div style={{
                        width: `${covPct}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: `linear-gradient(90deg, ${getBridgeColor(b.id)}90, ${getBridgeColor(b.id)}50)`,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#ccc', fontWeight: 500, minWidth: 60, textAlign: 'right' }}>
                      {b.routesCovered}<span style={{ color: '#555', fontSize: 10 }}>/{bMaxRoutes}</span>
                      <span style={{ color: '#555', fontSize: 10, marginLeft: 3 }}>({covPct.toFixed(0)}%)</span>
                    </span>
                  </div>
                </td>

                {/* Wins */}
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#6CF9D8', fontWeight: 600 }}>
                  {b.wins}
                </td>

                {/* Win Rate */}
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: b.winRate > 15 ? '#6CF9D8' : b.winRate > 5 ? '#e0e0f0' : '#666', fontWeight: 500 }}>
                  {b.winRate.toFixed(1)}%
                </td>

                {/* Avg Fee */}
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: (b.avgFeeBps ?? 999) < 30 ? '#6CF9D8' : '#ccc' }}>
                  {b.avgFeeBps != null ? Math.round(b.avgFeeBps) : '\u2014'}
                </td>

                {/* Status */}
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {live && <StatusBadge label="LIVE" color="#6CF9D8" />}
                  {stale && <StatusBadge label="STALE" color="#FF6B6B" />}
                  {!live && !stale && <span style={{ color: '#333' }}>\u2014</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ padding: '10px 16px', background: '#0f0f1c', borderTop: '1px solid #1e1e3a' }} className="flex items-center justify-between">
        <span style={{ fontSize: 10, color: '#555' }}>
          {bridges.length} bridges &middot; {totalActiveRoutes} active routes
        </span>
        {sorted.length > DEFAULT_ROWS && (
          <button
            type="button"
            onClick={() => setShowAll(s => !s)}
            style={{ fontSize: 10, color: '#6CF9D8', background: '#6CF9D810', border: '1px solid #6CF9D830', padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
          >
            {showAll ? `Top ${DEFAULT_ROWS}` : `All ${sorted.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function Th({ children, width }: { children: React.ReactNode; width?: number }) {
  return (
    <th style={{ padding: '10px 12px', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, textAlign: 'center', width }}>
      {children}
    </th>
  );
}

function ThSort({ label, sortKey, current, asc, onSort, align, width }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean;
  onSort: (k: SortKey) => void; align?: 'left' | 'right'; width?: number;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
        cursor: 'pointer', userSelect: 'none', textAlign: align ?? 'right', width,
        color: active ? '#6CF9D8' : '#555',
      }}
    >
      {label} {active ? (asc ? '\u25B4' : '\u25BE') : ''}
    </th>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color, letterSpacing: '0.5px',
      background: `${color}12`, padding: '3px 8px', borderRadius: 4,
      border: `1px solid ${color}25`,
    }}>
      {label}
    </span>
  );
}
