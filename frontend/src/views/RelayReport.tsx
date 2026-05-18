import { useState, useEffect } from 'react';
import { fetchRelayReport } from '../api/client';
import type { RelayReportData, RelayLoss, RelayCompetitor, RelayChainPair } from '../api/client';
import { getBridgeName, getBridgeColor } from '../config/bridges';

const ACCENT = '#7B61FF';
const CHAIN_ORDER = [
  'ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'bsc',
  'avalanche', 'linea', 'zksync', 'scroll', 'mantle', 'sonic',
  'berachain', 'abstract', 'unichain', 'hyperliquid', 'monad', 'megaeth',
];

type LossSortKey = 'gapBps' | 'asset' | 'amountTier' | 'relayFeeBps' | 'winner';

export function RelayReport() {
  const [data, setData] = useState<RelayReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lossSortKey, setLossSortKey] = useState<LossSortKey>('gapBps');
  const [lossSortAsc, setLossSortAsc] = useState(false);
  const [showAllLosses, setShowAllLosses] = useState(false);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try { setData(await fetchRelayReport()); }
      catch { /* ignore */ }
      finally { setLoading(false); }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Loading Relay intelligence...</div>
        <div style={{ width: 120, height: 3, borderRadius: 2, background: '#1e1e3a', margin: '0 auto', overflow: 'hidden' }}>
          <div style={{ width: '40%', height: '100%', background: ACCENT, borderRadius: 2, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      </div>
    );
  }

  const { summary: s, losses, competitors, chainPairMatrix, coverageGaps } = data;

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${ACCENT}20`, border: `2px solid ${ACCENT}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>R</span>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.3px' }}>Relay Competitive Intelligence</div>
          <div style={{ fontSize: 10, color: '#555' }}>Updated {new Date(data.generatedAt).toLocaleTimeString()}</div>
        </div>
      </div>

      {/* ═══ Summary Bar ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <SummaryCard
          label="Win Rate"
          value={`${s.winRate}%`}
          sub={`${s.wins}W / ${s.losses}L`}
          color={s.winRate > 40 ? '#6CF9D8' : s.winRate > 20 ? '#F59E0B' : '#FF6B6B'}
        />
        <SummaryCard
          label="Relay Avg Fee"
          value={`${s.relayAvgFeeBps} bps`}
          sub={`market ${s.marketAvgFeeBps} bps`}
          color={s.feeAdvantage > 0 ? '#6CF9D8' : '#FF6B6B'}
        />
        <SummaryCard
          label="Coverage"
          value={`${s.relayCorridors}`}
          sub={`/ ${s.maxPossibleRoutes} routes (${s.coveragePct}%)`}
          color={ACCENT}
        />
        <SummaryCard
          label="Fee Edge"
          value={`${s.feeAdvantage > 0 ? '+' : ''}${s.feeAdvantage} bps`}
          sub={s.feeAdvantage > 0 ? 'cheaper than market' : 'more expensive'}
          color={s.feeAdvantage > 0 ? '#6CF9D8' : '#FF6B6B'}
        />
      </div>

      {/* ═══ Competitor Breakdown ═══ */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Top Competitors" sub="Bridges that beat Relay most often" />
        <CompetitorTable competitors={competitors} totalLosses={s.losses} />
      </div>

      {/* ═══ Losses Table ═══ */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Where Relay Loses" sub={`${losses.length} routes where another bridge wins`} />
        <LossesTable
          losses={losses}
          sortKey={lossSortKey} sortAsc={lossSortAsc}
          onSort={(k) => { if (lossSortKey === k) setLossSortAsc(!lossSortAsc); else { setLossSortKey(k); setLossSortAsc(false); } }}
          showAll={showAllLosses} onToggleAll={() => setShowAllLosses(p => !p)}
        />
      </div>

      {/* ═══ Chain Pair Matrix ═══ */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Chain Pair Performance" sub="Relay fee (bps) per corridor" />
        <ChainMatrix pairs={chainPairMatrix} />
      </div>

      {/* ═══ Coverage Gaps ═══ */}
      {coverageGaps.length > 0 && (
        <div>
          <SectionHeader title="Coverage Gaps" sub={`${coverageGaps.length} supported routes with no quotes`} />
          <CoverageGaps gaps={coverageGaps} />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: '14px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: color }} />
      <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
      <div className="flex items-baseline gap-2">
        <span style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.5px' }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: '#555' }}>{sub}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
      <div style={{ width: 3, height: 18, borderRadius: 2, background: ACCENT }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.3px' }}>{title}</span>
      {sub && <span style={{ fontSize: 11, color: '#555' }}>{sub}</span>}
    </div>
  );
}

function CompetitorTable({ competitors, totalLosses }: { competitors: RelayCompetitor[]; totalLosses: number }) {
  const maxBeats = Math.max(...competitors.map(c => c.beatCount), 1);

  return (
    <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f0f1c', borderBottom: '1px solid #1e1e3a' }}>
            <Th width={40}>#</Th>
            <Th align="left" width={160}>Competitor</Th>
            <Th width={100}>Beats Relay</Th>
            <Th width={260}>Share</Th>
            <Th width={100}>Avg Gap (bps)</Th>
          </tr>
        </thead>
        <tbody>
          {competitors.slice(0, 15).map((c, i) => {
            const pct = totalLosses > 0 ? Math.round(c.beatCount / totalLosses * 100) : 0;
            const barPct = (c.beatCount / maxBeats) * 100;
            const bridgeColor = getBridgeColor(c.bridge);
            return (
              <tr key={c.bridge} style={{ borderBottom: '1px solid #151525' }}>
                <td style={{ padding: '10px 12px', fontSize: 11, color: '#444', fontWeight: 600, textAlign: 'center' }}>{i + 1}</td>
                <td style={{ padding: '10px 12px' }}>
                  <div className="flex items-center gap-2">
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: bridgeColor }} />
                    <span style={{ fontSize: 13, color: '#e0e0f0', fontWeight: 600 }}>{getBridgeName(c.bridge)}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 13, color: '#FF6B6B', fontWeight: 600 }}>
                  {c.beatCount}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div className="flex items-center gap-3">
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#1a1a2e', overflow: 'hidden' }}>
                      <div style={{
                        width: `${barPct}%`, height: '100%', borderRadius: 3,
                        background: `linear-gradient(90deg, ${bridgeColor}90, ${bridgeColor}40)`,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#888', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: c.avgGapBps > 50 ? '#FF6B6B' : '#F59E0B', fontWeight: 500 }}>
                  {c.avgGapBps}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LossesTable({ losses, sortKey, sortAsc, onSort, showAll, onToggleAll }: {
  losses: RelayLoss[]; sortKey: LossSortKey; sortAsc: boolean;
  onSort: (k: LossSortKey) => void; showAll: boolean; onToggleAll: () => void;
}) {
  const sorted = [...losses].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'gapBps': cmp = a.gapBps - b.gapBps; break;
      case 'asset': cmp = a.asset.localeCompare(b.asset); break;
      case 'amountTier': cmp = a.amountTier - b.amountTier; break;
      case 'relayFeeBps': cmp = a.relayFeeBps - b.relayFeeBps; break;
      case 'winner': cmp = a.winner.localeCompare(b.winner); break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const visible = showAll ? sorted : sorted.slice(0, 50);

  return (
    <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0f0f1c', borderBottom: '1px solid #1e1e3a' }}>
            <Th align="left" width={180}>Route</Th>
            <ThSort label="Asset" sortKey="asset" current={sortKey} asc={sortAsc} onSort={onSort} width={70} />
            <ThSort label="Tier" sortKey="amountTier" current={sortKey} asc={sortAsc} onSort={onSort} width={70} />
            <ThSort label="Relay Fee" sortKey="relayFeeBps" current={sortKey} asc={sortAsc} onSort={onSort} width={90} />
            <Th width={90}>Best Fee</Th>
            <ThSort label="Winner" sortKey="winner" current={sortKey} asc={sortAsc} onSort={onSort} align="left" width={130} />
            <ThSort label="Gap (bps)" sortKey="gapBps" current={sortKey} asc={sortAsc} onSort={onSort} width={100} />
          </tr>
        </thead>
        <tbody>
          {visible.map((l, i) => {
            const gapColor = l.gapBps > 100 ? '#FF6B6B' : l.gapBps > 30 ? '#F59E0B' : '#6CF9D8';
            return (
              <tr key={`${l.srcChain}-${l.dstChain}-${l.asset}-${l.amountTier}-${i}`} style={{ borderBottom: '1px solid #151525' }}>
                <td style={{ padding: '8px 12px', fontSize: 12, color: '#ccc' }}>
                  {l.srcChain} <span style={{ color: '#444' }}>&rarr;</span> {l.dstChain}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#888' }}>{l.asset}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#888' }}>${l.amountTier >= 1000 ? `${l.amountTier / 1000}K` : l.amountTier}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#FF6B6B', fontWeight: 500 }}>{l.relayFeeBps}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: 12, color: '#6CF9D8', fontWeight: 500 }}>{l.bestFeeBps}</td>
                <td style={{ padding: '8px 12px', fontSize: 12 }}>
                  <div className="flex items-center gap-2">
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: getBridgeColor(l.winner) }} />
                    <span style={{ color: '#ccc' }}>{getBridgeName(l.winner)}</span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: gapColor, background: `${gapColor}12`, padding: '2px 8px', borderRadius: 4 }}>
                    {l.gapBps}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: '10px 16px', background: '#0f0f1c', borderTop: '1px solid #1e1e3a' }} className="flex items-center justify-between">
        <span style={{ fontSize: 10, color: '#555' }}>{losses.length} total losses</span>
        {losses.length > 50 && (
          <button type="button" onClick={onToggleAll} style={{
            fontSize: 10, color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`,
            padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}>
            {showAll ? 'Top 50' : `All ${losses.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function ChainMatrix({ pairs }: { pairs: RelayChainPair[] }) {
  const pairMap = new Map(pairs.map(p => [`${p.srcChain}:${p.dstChain}`, p]));
  const activeChains = new Set<string>();
  for (const p of pairs) { activeChains.add(p.srcChain); activeChains.add(p.dstChain); }
  const chains = CHAIN_ORDER.filter(c => activeChains.has(c));

  const cellSize = 38;

  return (
    <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: 16, overflowX: 'auto' }}>
      <div style={{ display: 'inline-block' }}>
        {/* Header row */}
        <div className="flex">
          <div style={{ width: 80, minWidth: 80 }} />
          {chains.map(dst => (
            <div key={dst} style={{ width: cellSize, textAlign: 'center', fontSize: 9, color: '#555', fontWeight: 600, transform: 'rotate(-45deg)', transformOrigin: 'center', height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {dst.slice(0, 5)}
            </div>
          ))}
        </div>
        {/* Rows */}
        {chains.map(src => (
          <div key={src} className="flex items-center">
            <div style={{ width: 80, minWidth: 80, fontSize: 10, color: '#888', fontWeight: 600, paddingRight: 8, textAlign: 'right' }}>{src}</div>
            {chains.map(dst => {
              if (src === dst) {
                return <div key={dst} style={{ width: cellSize, height: cellSize, background: '#0a0a16' }} />;
              }
              const p = pairMap.get(`${src}:${dst}`);
              if (!p) {
                return <div key={dst} style={{ width: cellSize, height: cellSize, background: '#0f0f1c', border: '1px solid #151525', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 8, color: '#222' }}>&mdash;</span>
                </div>;
              }
              const bg = p.hasWin ? '#6CF9D820' : p.relayAvgFeeBps < 50 ? '#F59E0B18' : '#FF6B6B18';
              const fg = p.hasWin ? '#6CF9D8' : p.relayAvgFeeBps < 50 ? '#F59E0B' : '#FF6B6B';
              return (
                <div key={dst} style={{
                  width: cellSize, height: cellSize, background: bg, border: '1px solid #151525',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} title={`${src} → ${dst}: ${p.relayAvgFeeBps} bps (${p.quoteCount} quotes)${p.hasWin ? ' ★ WIN' : ''}`}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: fg }}>{p.relayAvgFeeBps}</span>
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-4" style={{ marginTop: 12, paddingLeft: 80 }}>
          <div className="flex items-center gap-1"><div style={{ width: 10, height: 10, borderRadius: 2, background: '#6CF9D820', border: '1px solid #6CF9D830' }} /><span style={{ fontSize: 9, color: '#555' }}>Relay wins</span></div>
          <div className="flex items-center gap-1"><div style={{ width: 10, height: 10, borderRadius: 2, background: '#F59E0B18', border: '1px solid #F59E0B30' }} /><span style={{ fontSize: 9, color: '#555' }}>Competitive (&lt;50 bps)</span></div>
          <div className="flex items-center gap-1"><div style={{ width: 10, height: 10, borderRadius: 2, background: '#FF6B6B18', border: '1px solid #FF6B6B30' }} /><span style={{ fontSize: 9, color: '#555' }}>Losing (&ge;50 bps)</span></div>
          <div className="flex items-center gap-1"><div style={{ width: 10, height: 10, borderRadius: 2, background: '#0f0f1c', border: '1px solid #151525' }} /><span style={{ fontSize: 9, color: '#555' }}>No data</span></div>
        </div>
      </div>
    </div>
  );
}

function CoverageGaps({ gaps }: { gaps: string[] }) {
  // Group by source chain
  const grouped = new Map<string, string[]>();
  for (const g of gaps) {
    const [src, dst] = g.split(':');
    if (!grouped.has(src)) grouped.set(src, []);
    grouped.get(src)!.push(dst);
  }

  return (
    <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {[...grouped.entries()].sort((a, b) => b[1].length - a[1].length).map(([src, dsts]) => (
          <div key={src} style={{ background: '#0f0f1c', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6 }}>{src} &rarr;</div>
            <div className="flex flex-wrap gap-1">
              {dsts.map(dst => (
                <span key={dst} style={{ fontSize: 10, color: '#555', background: '#12121f', padding: '2px 8px', borderRadius: 4, border: '1px solid #1e1e3a' }}>
                  {dst}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Utility components ───

function Th({ children, width, align }: { children: React.ReactNode; width?: number; align?: 'left' | 'right' }) {
  return (
    <th style={{ padding: '10px 12px', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, textAlign: align ?? 'center', width }}>
      {children}
    </th>
  );
}

function ThSort({ label, sortKey, current, asc, onSort, align, width }: {
  label: string; sortKey: LossSortKey; current: LossSortKey; asc: boolean;
  onSort: (k: LossSortKey) => void; align?: 'left' | 'right'; width?: number;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '10px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
        cursor: 'pointer', userSelect: 'none', textAlign: align ?? 'right', width,
        color: active ? ACCENT : '#555',
      }}
    >
      {label} {active ? (asc ? '\u25B4' : '\u25BE') : ''}
    </th>
  );
}
