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
}

interface CellStyle {
  background: string;
  textColor: string | null;
}

/**
 * Fresh cells: high-opacity colored backgrounds so they read as green/amber/red, not brown.
 * Stale cells: neutral dark background + dim fee-colored text only (no warm tint → no brown).
 * Dead/missing: near-transparent, no text.
 */
function getCellStyle(cell: Cell | undefined): CellStyle {
  if (!cell || cell.state === 'dead') {
    return { background: 'rgba(255,255,255,0.018)', textColor: null };
  }

  const isStale = cell.state === 'stale';
  const fee = cell.bestFeeBps ?? 0;

  if (isStale) {
    // Neutral background, fee-colored dim text: keeps meaning without any warm tint on dark.
    if (fee < 20) return { background: 'rgba(255,255,255,0.03)', textColor: 'rgba(108,249,216,0.50)' };
    if (fee < 80) return { background: 'rgba(255,255,255,0.03)', textColor: 'rgba(253,224,71,0.45)' };
    return { background: 'rgba(255,255,255,0.03)', textColor: 'rgba(248,113,113,0.50)' };
  }

  // Fresh: high-opacity so the color reads clearly (amber at 70% on dark = gold, not brown).
  if (fee < 20) return { background: 'rgba(16,185,129,0.65)', textColor: '#e0f5ef' };
  if (fee < 80) return { background: 'rgba(251,183,5,0.72)', textColor: '#0a0a14' };
  return { background: 'rgba(239,68,68,0.65)', textColor: '#ffe0e0' };
}

function formatCellValue(bps: number | null): string {
  if (bps == null || bps < 0) return '0.0%';
  if (bps > 9999) return `${Math.round(bps / 100)}%`;
  return `${(bps / 100).toFixed(1)}%`;
}

export function Heatmap({ asset, tier, onCellClick }: HeatmapProps) {
  const [data, setData] = useState<{
    cells: Cell[];
    stats: { active: number; dead: number; stale: number; singleBridge: number };
  } | null>(null);
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
  const gridWidth = rowHeaderWidth + chains.length * (cellSize + 2);

  return (
    <div style={{ marginBottom: 28 }}>
      <SectionHeader asset={asset} tier={tier} stats={data.stats} />

      <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 196px)' }}>
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
            {/* Top-left corner */}
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

            {/* Column headers */}
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
                  {/* Row header */}
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
                    const style = isDiag ? null : getCellStyle(cell);
                    const hasData = !isDiag && style?.textColor != null;
                    const isHovered = hoveredCell?.src === fromChain && hoveredCell?.dst === toChain;
                    const isNewRoute = (fromMeta.isNew || getChainMeta(toChain).isNew) && !isDiag;
                    const isClickable = !isDiag && hasData;

                    return (
                      <div
                        key={`cell-${fromChain}-${toChain}`}
                        onMouseEnter={() => { if (!isDiag) setHoveredCell({ src: fromChain, dst: toChain }); }}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => { if (isClickable && onCellClick) onCellClick(fromChain, toChain); }}
                        style={{
                          background: isDiag ? '#0a0a14' : (style?.background ?? 'rgba(255,255,255,0.018)'),
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: cellSize,
                          minWidth: cellSize,
                          cursor: isClickable ? 'pointer' : 'default',
                          border: isHovered && !isDiag
                            ? '2px solid #6CF9D8'
                            : isNewRoute && hasData
                              ? '1px solid #836EF930'
                              : '1px solid rgba(255,255,255,0.04)',
                          transition: 'border 0.1s',
                        }}
                      >
                        {hasData && style?.textColor && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: style.textColor }}>
                            {formatCellValue(cell?.bestFeeBps ?? null)}
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
              {hoveredData.state === 'stale' && (
                <span style={{ fontSize: 8, color: '#888', background: '#1a1a2e', padding: '1px 6px', borderRadius: 3, border: '1px solid #2a2a4a' }}>stale · latest known</span>
              )}
              {hoveredData.bestBridge && (
                <span style={{ fontSize: 9, color: '#555' }}>Best: <span style={{ color: '#6CF9D8' }}>{hoveredData.bestBridge}</span></span>
              )}
              <span style={{ fontSize: 9, color: '#555' }}>
                Fee: <span style={{ color: '#F59E0B' }}>{((hoveredData.bestFeeBps ?? 0) / 100).toFixed(2)}%</span>
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

function SectionHeader({ asset, tier, stats }: {
  asset: string;
  tier: number;
  stats?: { active: number; dead: number; stale: number; singleBridge: number };
}) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2">
        <div style={{ width: 3, height: 16, borderRadius: 2, background: '#4F7FFF' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.3px' }}>Route Matrix</span>
        <span style={{ fontSize: 9, color: '#555', marginLeft: 8 }}>
          {asset} &middot; ${tier.toLocaleString()} tier
          {stats && (
            <>
              {' · '}
              <span style={{ color: '#6CF9D8' }}>{stats.active}</span> fresh
              {' / '}
              <span style={{ color: '#888' }}>{stats.stale}</span> stale
              {' / '}
              <span style={{ color: '#444' }}>{stats.dead}</span> no route
            </>
          )}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4">
        {/* Fresh */}
        <div className="flex items-center gap-1.5">
          <div style={{ display: 'flex', gap: 2 }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(16,185,129,0.65)', border: '1px solid rgba(16,185,129,0.8)' }} />
            <div style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(251,183,5,0.72)', border: '1px solid rgba(251,183,5,0.8)' }} />
            <div style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(239,68,68,0.65)', border: '1px solid rgba(239,68,68,0.8)' }} />
          </div>
          <span style={{ fontSize: 8, color: '#666' }}>Fresh quote</span>
        </div>

        {/* Stale */}
        <div className="flex items-center gap-1.5">
          <div style={{
            width: 9, height: 9, borderRadius: 2,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 5, height: 1.5, borderRadius: 1, background: 'rgba(108,249,216,0.45)' }} />
          </div>
          <span style={{ fontSize: 8, color: '#555' }}>Stale &middot; latest known data</span>
        </div>

        {/* No route */}
        <div className="flex items-center gap-1.5">
          <div style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(255,255,255,0.018)', border: '1px solid rgba(255,255,255,0.06)' }} />
          <span style={{ fontSize: 8, color: '#444' }}>No route found</span>
        </div>
      </div>
    </div>
  );
}
