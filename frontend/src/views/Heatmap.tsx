import { useState, useEffect, useMemo, Fragment } from 'react';
import { fetchMatrix } from '../api/client';
import { HEATMAP_ORDER, getChainMeta } from '../config/chains';
import { ChainIcon } from '../components/ChainIcon';

interface HeatmapProps {
  asset: string;
  tier: number;
  onCellClick?: (src: string, dst: string) => void;
}

interface Cell {
  src: string;
  dst: string;
  state: string;
  bestFeeBps: number | null;
  bestBridge: string | null;
  quoteCount: number;
  lastSeen: string | null;
}

/** Best route fee: <20 bps = green (best), 20–80 bps = yellow, >80 bps = red. */
function getColor(cell: Cell | undefined): string {
  if (!cell || cell.state === 'dead') return '#1a1a2e';
  if (cell.state === 'stale') return '#422006';
  const fee = cell.bestFeeBps ?? 0;
  if (fee < 20) return '#059669';
  if (fee < 80) return '#ca8a04';
  return '#dc2626';
}

const LEGEND = [
  { color: '#059669', label: '<0.2% fee' },
  { color: '#ca8a04', label: '0.2–0.8% fee' },
  { color: '#dc2626', label: '>0.8% fee' },
  { color: '#1a1a2e', label: 'No route' },
];

export function Heatmap({ asset, tier, onCellClick }: HeatmapProps) {
  const [data, setData] = useState<{ cells: Cell[]; stats: { active: number; dead: number; stale: number; singleBridge: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<{ src: string; dst: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMatrix(asset, tier)
      .then((res) => { if (!cancelled) setData({ cells: res.cells, stats: res.stats }); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [asset, tier]);

  const cellMap = useMemo(() => {
    if (!data?.cells) return new Map<string, Cell>();
    const m = new Map<string, Cell>();
    data.cells.forEach((c) => m.set(`${c.src}:${c.dst}`, c));
    return m;
  }, [data?.cells]);

  const hoveredData = useMemo(() => {
    if (!hoveredCell) return null;
    return cellMap.get(`${hoveredCell.src}:${hoveredCell.dst}`) ?? null;
  }, [hoveredCell, cellMap]);

  if (loading) {
    return (
      <div style={{ marginBottom: 28 }}>
        <SectionHeader asset={asset} tier={tier} />
        <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 12, padding: '40px 16px', textAlign: 'center', color: '#555', fontSize: 12 }}>
          Loading matrix data...
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ marginBottom: 28 }}>
        <SectionHeader asset={asset} tier={tier} />
        <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 12, padding: '40px 16px', textAlign: 'center', color: '#555', fontSize: 12 }}>
          Failed to load matrix data.
        </div>
      </div>
    );
  }

  const chains = HEATMAP_ORDER;
  const cellSize = 36;
  const rowHeaderWidth = 72;

  /** Clamp display value — hide anomalous outliers (e.g. -2467986) */
  function formatCellValue(bps: number | null): string {
    if (bps == null) return '—';
    if (bps < 0 || bps > 9999) return '—';
    return (bps / 100).toFixed(1);
  }

  const gridWidth = rowHeaderWidth + chains.length * (cellSize + 2);

  return (
    <div style={{ marginBottom: 28 }}>
      <SectionHeader asset={asset} tier={tier} stats={data.stats} />

      <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${rowHeaderWidth}px repeat(${chains.length}, ${cellSize}px)`,
              gridTemplateRows: `auto repeat(${chains.length}, ${cellSize}px)`,
              gap: 2,
              width: gridWidth,
              minWidth: gridWidth,
            }}
          >
            {/* Top-left corner — sticky */}
            <div style={{
              background: '#0f0f1c',
              padding: 6,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              position: 'sticky',
              top: 0,
              left: 0,
              zIndex: 20,
              borderRight: '1px solid #1e1e3a',
              borderBottom: '1px solid #1e1e3a',
            }}>
              <span style={{ fontSize: 9, color: '#666', fontWeight: 600 }}>TO →</span>
            </div>

            {/* Column headers — sticky */}
            {chains.map(c => {
              const meta = getChainMeta(c);
              return (
                <div
                  key={`col-${c}`}
                  style={{
                    background: '#0f0f1c',
                    padding: '6px 4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    minWidth: cellSize,
                    borderBottom: '1px solid #1e1e3a',
                  }}
                >
                  <ChainIcon chain={c} size="xs" />
                  <span style={{ fontSize: 8, color: meta.isNew ? '#F59E0B' : '#888', textAlign: 'center', lineHeight: 1, fontWeight: meta.isNew ? 700 : 500 }}>
                    {meta.abbr}
                  </span>
                </div>
              );
            })}

            {/* Rows */}
            {chains.map(fromChain => {
              const fromMeta = getChainMeta(fromChain);
              return (
                <Fragment key={fromChain}>
                  {/* Row header — sticky */}
                  <div
                    style={{
                      background: '#0f0f1c',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                      borderRight: '1px solid #1e1e3a',
                      minHeight: cellSize,
                    }}
                  >
                    <ChainIcon chain={fromChain} size="xs" />
                    <span style={{ fontSize: 9, color: fromMeta.isNew ? '#F59E0B' : '#aaa', whiteSpace: 'nowrap', fontWeight: fromMeta.isNew ? 700 : 500 }}>
                      {fromMeta.abbr}
                    </span>
                  </div>

                  {/* Data cells */}
                  {chains.map(toChain => {
                    const isDiag = fromChain === toChain;
                    const cell = isDiag ? undefined : cellMap.get(`${fromChain}:${toChain}`);
                    const isHovered = hoveredCell?.src === fromChain && hoveredCell?.dst === toChain;
                    const isNewRoute = (fromMeta.isNew || getChainMeta(toChain).isNew) && !isDiag;

                    return (
                      <div
                        key={`cell-${fromChain}-${toChain}`}
                        onMouseEnter={() => { if (!isDiag) setHoveredCell({ src: fromChain, dst: toChain }); }}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => { if (!isDiag && cell && onCellClick) onCellClick(fromChain, toChain); }}
                        style={{
                          background: isDiag ? '#0a0a14' : getColor(cell),
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: cellSize,
                          minWidth: cellSize,
                          cursor: !isDiag && cell ? 'pointer' : 'default',
                          border: isHovered && !isDiag ? '2px solid #6CF9D8' : isNewRoute && cell ? '1px solid #836EF930' : '1px solid #1a1a2e',
                          transition: 'border 0.1s, background 0.1s',
                        }}
                      >
                        {isDiag ? (
                          <span style={{ fontSize: 10, color: '#333' }}>—</span>
                        ) : !cell || cell.state === 'dead' ? (
                          <span style={{ fontSize: 8, color: '#2a2a4a', opacity: 0.5 }}>·</span>
                        ) : (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: (cell.bestFeeBps ?? 0) < 20 ? '#6CF9D8' : (cell.bestFeeBps ?? 0) < 80 ? '#facc15' : '#f87171',
                          }}>
                            {formatCellValue(cell.bestFeeBps)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* Hover tooltip bar */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid #1e1e3a', background: '#0f0f1c' }} className="flex items-center justify-between">
          {hoveredData ? (
            <div className="flex items-center gap-4">
              <span style={{ fontSize: 10, color: '#888' }}>
                <span style={{ color: '#e0e0f0', fontWeight: 600 }}>{getChainMeta(hoveredData.src).name}</span>
                <span style={{ color: '#6CF9D8', margin: '0 6px' }}>&rarr;</span>
                <span style={{ color: '#e0e0f0', fontWeight: 600 }}>{getChainMeta(hoveredData.dst).name}</span>
              </span>
              {hoveredData.bestBridge && (
                <span style={{ fontSize: 9, color: '#555' }}>Best: <span style={{ color: '#6CF9D8' }}>{hoveredData.bestBridge}</span></span>
              )}
              <span style={{ fontSize: 9, color: '#555' }}>
                Best fee: <span style={{ color: '#F59E0B' }}>{((hoveredData.bestFeeBps ?? 0) / 100).toFixed(2)}%</span>
              </span>
              <span style={{ fontSize: 9, color: '#555' }}>Bridges: <span style={{ color: '#888' }}>{hoveredData.quoteCount}</span></span>
              {(getChainMeta(hoveredData.src).isNew || getChainMeta(hoveredData.dst).isNew) && (
                <span style={{ fontSize: 8, color: '#836EF9', background: '#836EF915', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>NEW CHAIN</span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 9, color: '#444' }}>Hover a cell to see corridor details &middot; Click to open in Route Explorer</span>
          )}
          <span style={{ fontSize: 8, color: '#333' }}>FROM &darr; &middot; {chains.length} chains &middot; {asset}</span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ asset, tier, stats }: { asset: string; tier: number; stats?: { active: number; dead: number; stale: number; singleBridge: number } }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2">
        <div style={{ width: 3, height: 16, borderRadius: 2, background: '#4F7FFF' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.3px' }}>Route Matrix</span>
        <span style={{ fontSize: 9, color: '#555', marginLeft: 8 }}>
          Best routes (green) = low fee &middot; {asset} &middot; ${tier.toLocaleString()} tier
          {stats && (
            <> &middot; <span style={{ color: '#6CF9D8' }}>{stats.active}</span> active
              <span style={{ color: '#555' }}> / </span>
              <span style={{ color: '#F59E0B' }}>{stats.stale}</span> stale
              <span style={{ color: '#555' }}> / </span>
              <span style={{ color: '#FF6B6B' }}>{stats.dead}</span> dead
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, border: '1px solid #2a2a4a' }} />
            <span style={{ fontSize: 8, color: '#555' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
