/* ════════════════════════════════════════════════════════════════════════
   INSIGHTS — the flagship page. Wins across every chain, route, bridge and
   aggregator, wired entirely to the live backend:
     · /api/matrix              → win matrix grid + corridor / fee KPIs
     · /api/bridges/coverage    → bridge leaderboard + top-bridge KPI
     · /api/bridges/health      → aggregator performance rail + top-agg KPI
   ════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react';
import { fetchMatrix, fetchBridgeCoverage, fetchBridgeHealth, fetchHealth } from '../../api/client';
import type { BridgeCoverageItem, AggregatorHealth } from '../../api/client';
import { Card, SectionTitle, Pill } from '../../squid/brand';
import { bridgeMeta, aggMeta, fmtPct } from '../../squid/meta';
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
  const [health, setHealth] = useState<Awaited<ReturnType<typeof fetchHealth>> | null>(null);

  // Local asset/tier for the right-column boards (aggregator + bridge leaderboard).
  // null = "ALL" mode: fetches across all 9 combos with no filter.
  // Starts in sync with the global header controls but can be changed independently.
  const [localAsset, setLocalAsset] = useState<string | null>(asset);
  const [localTier,  setLocalTier]  = useState<number | null>(tier);

  // Keep local in sync when the user changes the global header selector.
  useEffect(() => { setLocalAsset(asset); }, [asset]);
  useEffect(() => { setLocalTier(tier);   }, [tier]);

  // Matrix: reload on global asset/tier change and refresh every 60s.
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetchMatrix(asset, tier)
        .then((r) => { if (!cancelled) setMatrix({ cells: r.cells as MatrixCell[], stats: r.stats }); })
        .catch(() => { /* keep last good data */ });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [asset, tier]);

  // Bridge coverage + aggregator health: driven by LOCAL asset/tier combo so the
  // 9-button selector controls them independently from the matrix.
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetchBridgeCoverage(localAsset ?? undefined, localTier ?? undefined)
        .then((r) => { if (!cancelled) setBridges(r.bridges); })
        .catch(() => { /* keep last good data */ });
      fetchBridgeHealth(localAsset ?? undefined, localTier ?? undefined)
        .then((r) => { if (!cancelled) setAggregators(r.aggregators); })
        .catch(() => { /* keep last good data */ });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [localAsset, localTier]);

  // Health: global corridor counts (across ALL 9 combos), refresh every 60s.
  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      fetchHealth()
        .then((r) => { if (!cancelled) setHealth(r); })
        .catch(() => { /* keep last good data */ });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── derive headline KPIs ──
  const kpis = useMemo(() => {
    const cells = matrix?.cells.filter((c) => c.state !== 'dead' && c.bestFeeBps != null) ?? [];
    // Use global total from health endpoint (unique src:dst pairs with ANY data, across all 9 combos).
    // Falls back to per-combo matrix count until health data arrives.
    const corridors = health?.db.totalPricedCorridors
      ?? ((matrix?.stats.active ?? 0) + (matrix?.stats.singleBridge ?? 0) + (matrix?.stats.stale ?? 0));
    const zeroCoverage = health?.db.zeroCoverageCorridors ?? (matrix?.stats.dead ?? 0);
    const avgFee = cells.length ? cells.reduce((s, c) => s + (c.bestFeeBps ?? 0), 0) / cells.length : 0;
    const bridgeBoard = [...bridges].sort((a, b) => b.wins - a.wins);
    const topBridge = bridgeBoard[0] ?? null;
    // Sort by route wins (the meaningful metric); fall back to successRate
    const aggBoard = [...aggregators].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || b.successRate - a.successRate);
    const topAgg = aggBoard[0] ?? null;
    return { corridors, zeroCoverage, avgFee, topBridge, topAgg, bridgeBoard, aggBoard };
  }, [matrix, health, bridges, aggregators]);

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
              Real-time best-execution intelligence over {kpis.corridors.toLocaleString()} priced corridors
              {' '}across {kpis.bridgeBoard.length > 0 ? kpis.bridgeBoard.length : '…'} bridges
              {' '}and {kpis.aggBoard.length > 0 ? kpis.aggBoard.length : '…'} aggregators.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: 12, flex: '1 1 360px' }}>
            <HeroStat label="Priced corridors" value={kpis.corridors.toLocaleString()} accent="var(--good)"
              sub={`${kpis.zeroCoverage.toLocaleString()} of 3,080 with no data`} />
            <HeroStat label="Avg best fee" value={fmtPct(kpis.avgFee)} accent="var(--squid-lime)"
              sub="across all live corridors" />
            <HeroStat label="Top aggregator" value={kpis.topAgg ? aggMeta(kpis.topAgg.id).name : '—'} accent="var(--squid-lavender)"
              sub={kpis.topAgg ? `${(kpis.topAgg.wins ?? 0).toLocaleString()} routes won · ${kpis.topAgg.winPct ?? 0}% share` : 'loading…'}
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
          {/* ─── 9-combo selector: 3 assets × 3 tiers ─── */}
          <Card pad={14}>
            <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginBottom: 10, letterSpacing: '0.06em' }}>
              FILTER · AGGREGATOR &amp; BRIDGE DATA
            </div>
            <ComboSelector9
              asset={localAsset}
              tier={localTier}
              onChange={(a, t) => { setLocalAsset(a); setLocalTier(t); }}
            />
          </Card>
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

/* ─── aggregator performance (always route wins — never success rate) ─── */
function AggregatorBoard({ rows }: { rows: AggregatorHealth[] }) {
  const maxVal = Math.max(...rows.map((r) => r.wins ?? 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map((r, i) => {
        const color = aggMeta(r.id).color;
        const wins = r.wins ?? 0;
        const barPct = (wins / maxVal) * 100;
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11, color: i === 0 ? 'var(--squid-lavender)' : 'var(--fg-3)', textAlign: 'right' }}>{i + 1}</span>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}66` }} />
            <span style={{ width: 84, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{aggMeta(r.id).name}</span>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 4, background: i === 0 ? 'var(--squid-lavender)' : color, opacity: i === 0 ? 1 : 0.65 }} />
            </div>
            <span style={{ width: 36, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: 'var(--fg-1)' }}>{wins.toLocaleString()}</span>
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
        <span>aggregator</span>
        <span>routes won · share</span>
      </div>
    </div>
  );
}

/* ─── 9-button combo selector: 3 assets (rows) × 3 tiers (columns) ─── */
const COMBO_ASSETS = [
  { k: 'USDC',  l: 'USDC',   color: '#836EF9' },  // squid lavender
  { k: 'USDT',  l: 'USDT',   color: '#26A17B' },  // tether green
  { k: 'ETH',   l: 'Native', color: '#E6FA36' },  // squid lime
] as const;

const COMBO_TIERS = [
  { k: 50,    l: '$50'  },
  { k: 1000,  l: '$1K'  },
  { k: 50000, l: '$50K' },
] as const;

function ComboSelector9({
  asset, tier, onChange,
}: {
  asset: string | null;
  tier: number | null;
  onChange: (asset: string | null, tier: number | null) => void;
}) {
  const isAll = asset === null && tier === null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* ALL toggle */}
      <button
        onClick={() => onChange(null, null)}
        style={{
          padding: '6px 0',
          borderRadius: 6,
          border: `1px solid ${isAll ? 'var(--fg-2)' : 'var(--line)'}`,
          background: isAll ? 'rgba(255,255,255,0.07)' : 'var(--bg-3)',
          color: isAll ? 'var(--fg-1)' : 'var(--fg-4)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontWeight: isAll ? 700 : 500,
          fontSize: 11,
          letterSpacing: '0.06em',
          transition: 'all .1s',
          boxShadow: isAll ? '0 0 0 1px rgba(255,255,255,0.1)' : 'none',
        }}
      >
        ALL COMBOS
      </button>

      <div className="t-mono-xs" style={{ color: 'var(--fg-4)', textAlign: 'center', fontSize: 10, letterSpacing: '0.05em' }}>
        OR SELECT ONE
      </div>

      {/* 3×3 grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '46px repeat(3, 1fr)',
        gap: 4,
        alignItems: 'center',
        opacity: isAll ? 0.45 : 1,
        transition: 'opacity .15s',
      }}>
        {/* header row */}
        <div /> {/* top-left spacer */}
        {COMBO_TIERS.map((t) => (
          <div key={t.k} className="t-mono-xs" style={{
            textAlign: 'center', color: 'var(--fg-4)', paddingBottom: 2,
          }}>{t.l}</div>
        ))}

        {/* asset rows */}
        {COMBO_ASSETS.map((a) => (
          <React.Fragment key={a.k}>
            {/* row label */}
            <div className="t-mono-xs" style={{
              color: a.color, fontWeight: 600, paddingRight: 4,
              whiteSpace: 'nowrap', textAlign: 'right',
            }}>{a.l}</div>

            {/* tier buttons */}
            {COMBO_TIERS.map((t) => {
              const selected = asset === a.k && tier === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => onChange(a.k, t.k)}
                  style={{
                    padding: '5px 0',
                    borderRadius: 6,
                    border: `1px solid ${selected ? a.color : 'var(--line)'}`,
                    background: selected ? `${a.color}22` : 'var(--bg-3)',
                    color: selected ? a.color : 'var(--fg-4)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: selected ? 700 : 500,
                    fontSize: 11,
                    textAlign: 'center' as const,
                    transition: 'all .1s',
                    boxShadow: selected ? `0 0 0 1px ${a.color}44` : 'none',
                  }}
                >
                  {t.l}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return <div className="t-caption" style={{ padding: '24px 2px', textAlign: 'center' }}>{label}</div>;
}
