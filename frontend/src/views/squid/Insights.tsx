/* ════════════════════════════════════════════════════════════════════════
   INSIGHTS — the flagship page. Wins across every chain, route, bridge and
   aggregator, wired entirely to the live backend:
     · /api/matrix              → win matrix grid + corridor / fee KPIs
     · /api/bridges/coverage    → bridge leaderboard + top-bridge KPI
     · /api/bridges/health      → aggregator performance rail + top-agg KPI
     · /api/opportunities       → highest-spread corridors
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useMemo } from 'react';
import { fetchMatrix, fetchBridgeCoverage, fetchBridgeHealth, fetchOpportunities } from '../../api/client';
import type { BridgeCoverageItem, AggregatorHealth, Opportunity } from '../../api/client';
import { Card, SectionTitle, Pill, ChainChip, BridgeTag } from '../../squid/brand';
import { bridgeMeta, aggMeta, fmtPct, fmtUsd } from '../../squid/meta';
import { WinMatrix, type MatrixCell } from './WinMatrix';

interface MatrixData {
  cells: MatrixCell[];
  stats: { active: number; dead: number; stale: number; singleBridge: number };
}

interface InsightsProps {
  asset: string;
  tier: number;
  onOpenRoute?: (src: string, dst: string) => void;
}

export function Insights({ asset, tier, onOpenRoute }: InsightsProps) {
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [bridges, setBridges] = useState<BridgeCoverageItem[]>([]);
  const [aggregators, setAggregators] = useState<AggregatorHealth[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMatrix(asset, tier)
      .then((r) => { if (!cancelled) setMatrix({ cells: r.cells as MatrixCell[], stats: r.stats }); })
      .catch(() => { if (!cancelled) setMatrix(null); });
    fetchOpportunities(asset, tier, 6, 1)
      .then((r) => { if (!cancelled) setOpps(r.opportunities); })
      .catch(() => { if (!cancelled) setOpps([]); });
    return () => { cancelled = true; };
  }, [asset, tier]);

  useEffect(() => {
    let cancelled = false;
    fetchBridgeCoverage()
      .then((r) => { if (!cancelled) setBridges(r.bridges); })
      .catch(() => { if (!cancelled) setBridges([]); });
    fetchBridgeHealth()
      .then((r) => { if (!cancelled) setAggregators(r.aggregators); })
      .catch(() => { if (!cancelled) setAggregators([]); });
    return () => { cancelled = true; };
  }, []);

  // ── derive headline KPIs ──
  const kpis = useMemo(() => {
    const cells = matrix?.cells.filter((c) => c.state !== 'dead' && c.bestFeeBps != null) ?? [];
    const corridors = (matrix?.stats.active ?? 0) + (matrix?.stats.singleBridge ?? 0) + (matrix?.stats.stale ?? 0);
    const avgFee = cells.length ? cells.reduce((s, c) => s + (c.bestFeeBps ?? 0), 0) / cells.length : 0;
    const bridgeBoard = [...bridges].sort((a, b) => b.wins - a.wins);
    const topBridge = bridgeBoard[0] ?? null;
    // Sort by route wins (the meaningful metric); fall back to successRate
    const aggBoard = [...aggregators].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || b.successRate - a.successRate);
    const topAgg = aggBoard[0] ?? null;
    return { corridors, avgFee, topBridge, topAgg, bridgeBoard, aggBoard };
  }, [matrix, bridges, aggregators]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── HERO KPI BAND ─── */}
      <div style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--bg-1)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/squid/background-16_9-1.png)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.16, filter: 'saturate(1.1)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, var(--bg-1) 30%, rgba(18,18,24,0.7) 70%, rgba(18,18,24,0.4))' }} />
        <div style={{ position: 'relative', padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Pill tone="lime">● live</Pill>
              <span className="t-label">Cross-chain win report · {asset} · ${tier.toLocaleString()}</span>
            </div>
            <h1 className="t-h1" style={{ marginBottom: 6 }}>Who wins every route,<br />across every bridge.</h1>
            <p className="t-body" style={{ maxWidth: 380 }}>
              Real-time best-execution intelligence over {kpis.corridors} live corridors,
              {' '}17 bridges and 4 aggregators.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: 12, flex: '1 1 360px' }}>
            <HeroStat label="Priced corridors" value={String(kpis.corridors)} accent="var(--good)"
              sub={`${matrix?.stats.dead ?? 0} with no live route`} />
            <HeroStat label="Avg best fee" value={fmtPct(kpis.avgFee)} accent="var(--squid-lime)"
              sub="across all live corridors" />
            <HeroStat label="Top aggregator" value={kpis.topAgg ? aggMeta(kpis.topAgg.id).name : '—'} accent="var(--squid-lavender)"
              sub={kpis.topAgg ? ((kpis.topAgg.wins != null) ? `${kpis.topAgg.wins.toLocaleString()} routes won · ${kpis.topAgg.winPct ?? 0}% share` : `${kpis.topAgg.successRate}% success · ${kpis.topAgg.successCount.toLocaleString()} quotes`) : 'loading…'}
              dot={kpis.topAgg ? aggMeta(kpis.topAgg.id).color : undefined} />
            <HeroStat label="Top bridge" value={kpis.topBridge ? kpis.topBridge.name : '—'} accent="var(--fg-1)"
              sub={kpis.topBridge ? `${kpis.topBridge.wins.toLocaleString()} route wins` : 'loading…'}
              dot={kpis.topBridge ? bridgeMeta(kpis.topBridge.id).color : undefined} />
          </div>
        </div>
      </div>

      {/* ─── MATRIX + RAIL ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(300px, 1fr)', gap: 20, alignItems: 'start' }}>
        <Card pad={18}>
          <SectionTitle accent="var(--squid-lime)" sub="hover a cell for full corridor intel · click to explore">Win Matrix</SectionTitle>
          {matrix
            ? <WinMatrix asset={asset} tier={tier} cells={matrix.cells} stats={matrix.stats} onOpenRoute={onOpenRoute} />
            : <Loading label="Loading win matrix…" />}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card pad={18}>
            <SectionTitle accent="var(--squid-lavender)" sub="routes where this aggregator found the best price">Aggregator performance</SectionTitle>
            {kpis.aggBoard.length
              ? <AggregatorBoard rows={kpis.aggBoard} />
              : <Loading label="Loading aggregators…" />}
          </Card>
          <Card pad={18}>
            <SectionTitle accent="var(--squid-lime)" sub="ranked by corridors won">Bridge leaderboard</SectionTitle>
            {kpis.bridgeBoard.length
              ? <BridgeBoard rows={kpis.bridgeBoard.slice(0, 8)} />
              : <Loading label="Loading bridges…" />}
          </Card>
        </div>
      </div>

      {/* ─── ROUTING INTELLIGENCE ─── */}
      <Card pad={18}>
        <SectionTitle accent="var(--warn)" sub="routes where bridge choice has the biggest dollar impact — click any to explore">
          Routing intelligence
        </SectionTitle>
        {opps.length === 0 ? (
          <div className="t-caption" style={{ padding: '8px 2px' }}>No high-spread corridors at this asset / size right now.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {opps.map((c) => {
              const bestOut = c.bestOutputUsd ? parseFloat(c.bestOutputUsd) : null;
              const worstOut = c.worstOutputUsd ? parseFloat(c.worstOutputUsd) : null;
              const savingsUsd = bestOut != null && worstOut != null ? bestOut - worstOut : null;
              return (
                <div key={`${c.src}:${c.dst}`} onClick={() => onOpenRoute?.(c.src, c.dst)}
                  className="sq-card-hover"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: 14, cursor: 'pointer' }}>
                  {/* corridor header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <ChainChip id={c.src} size={22} />
                    <span style={{ color: 'var(--fg-4)', fontSize: 12 }}>→</span>
                    <ChainChip id={c.dst} size={22} />
                    <Pill tone="warn" style={{ marginLeft: 'auto' }}>{fmtPct(c.spreadBps)} spread</Pill>
                  </div>
                  {/* savings banner */}
                  {savingsUsd != null && (
                    <div style={{ background: 'rgba(245,196,81,0.08)', border: '1px solid rgba(245,196,81,0.18)', borderRadius: 'var(--r-xs)', padding: '7px 10px', marginBottom: 10 }}>
                      <span className="t-mono-xs" style={{ color: 'var(--fg-3)' }}>ROUTING RIGHT SAVES </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--warn)' }}>{fmtUsd(savingsUsd)}</span>
                      <span className="t-mono-xs" style={{ color: 'var(--fg-3)' }}> ON THIS ROUTE</span>
                    </div>
                  )}
                  {/* best vs worst side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'rgba(123,224,166,0.07)', borderRadius: 'var(--r-xs)', padding: '8px 10px' }}>
                      <div className="t-mono-xs" style={{ color: 'var(--good)', marginBottom: 5 }}>BEST BRIDGE</div>
                      {c.bestBridge ? <BridgeTag id={c.bestBridge} /> : <span className="t-caption">—</span>}
                      {bestOut != null && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)', marginTop: 5 }}>{fmtUsd(bestOut)}</div>
                      )}
                    </div>
                    <div style={{ background: 'rgba(255,107,129,0.07)', borderRadius: 'var(--r-xs)', padding: '8px 10px' }}>
                      <div className="t-mono-xs" style={{ color: 'var(--bad)', marginBottom: 5 }}>WORST BRIDGE</div>
                      {c.worstBridge ? <BridgeTag id={c.worstBridge} /> : <span className="t-caption">—</span>}
                      {worstOut != null && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--fg-3)', marginTop: 5 }}>{fmtUsd(worstOut)}</div>
                      )}
                    </div>
                  </div>
                  <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginTop: 8 }}>{c.quoteCount} bridges compared · click to explore</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── hero stat tile ─── */
function HeroStat({ label, value, sub, accent, dot }: { label: string; value: string; sub?: string; accent: string; dot?: string }) {
  return (
    <div style={{ background: 'rgba(11,11,15,0.55)', backdropFilter: 'blur(8px)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
      <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {dot && <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, boxShadow: `0 0 8px ${dot}88`, flexShrink: 0 }} />}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color: accent, letterSpacing: '-0.02em' }}>{value}</span>
      </div>
      {sub && <div className="t-caption" style={{ marginTop: 5, fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

/* ─── bridge leaderboard (wins) ─── */
function BridgeBoard({ rows }: { rows: BridgeCoverageItem[] }) {
  const max = Math.max(...rows.map((r) => r.wins), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r, i) => {
        const color = bridgeMeta(r.id).color;
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, color: i === 0 ? 'var(--squid-lime)' : 'var(--fg-3)', textAlign: 'right' }}>{i + 1}</span>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}66` }} />
            <span style={{ width: 84, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.wins / max) * 100}%`, height: '100%', borderRadius: 4, background: i === 0 ? 'var(--squid-lime)' : color, opacity: i === 0 ? 1 : 0.65 }} />
            </div>
            <span style={{ width: 38, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--fg-1)' }}>{r.wins.toLocaleString()}</span>
            <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{r.winRate}%</span>
          </div>
        );
      })}
      <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>bridge</span><span>wins · share of live corridors</span>
      </div>
    </div>
  );
}

/* ─── aggregator performance (route wins) ─── */
function AggregatorBoard({ rows }: { rows: AggregatorHealth[] }) {
  const maxWins = Math.max(...rows.map((r) => r.wins ?? 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r, i) => {
        const color = aggMeta(r.id).color;
        const wins = r.wins ?? 0;
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, color: i === 0 ? 'var(--squid-lavender)' : 'var(--fg-3)', textAlign: 'right' }}>{i + 1}</span>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}66` }} />
            <span style={{ width: 84, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{aggMeta(r.id).name}</span>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
              <div style={{ width: `${(wins / maxWins) * 100}%`, height: '100%', borderRadius: 4, background: i === 0 ? 'var(--squid-lavender)' : color, opacity: i === 0 ? 1 : 0.65 }} />
            </div>
            {/* primary: route wins */}
            <span style={{ width: 36, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--fg-1)' }}>{wins.toLocaleString()}</span>
            {/* secondary: win share */}
            <span style={{ width: 38, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{r.winPct ?? 0}%</span>
          </div>
        );
      })}
      <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 'var(--r-xs)', border: '1px solid var(--line)' }}>
        <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 6 }}>WHAT THIS MEASURES</div>
        <div className="t-caption" style={{ color: 'var(--fg-2)', lineHeight: 1.5 }}>
          For each live route, the aggregator that returned the single highest output quote gets credited with a win — regardless of which bridge it used.
        </div>
      </div>
      <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
        <span>aggregator</span><span>routes won · share</span>
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <div className="t-caption" style={{ padding: '24px 2px', textAlign: 'center' }}>{label}</div>;
}
