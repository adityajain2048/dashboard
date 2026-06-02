/* ════════════════════════════════════════════════════════════════════════
   BRIDGE LEADERBOARD — every tracked bridge ranked by corridors won, plus
   coverage, win rate and avg fee. Win-rate-by-tier breakdown beneath. Wired
   entirely to the backend:
     · /api/bridges/coverage        → leaderboard rows + KPIs
     · /api/bridges/health          → aggregator count + bridge freshness
     · /api/bridges/win-rate-by-tier→ per-amount-tier win share
     · /api/matrix                  → live-corridor KPI
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useMemo } from 'react';
import { fetchBridgeCoverage, fetchBridgeHealth, fetchBridgeWinRateByTier, fetchMatrix } from '../../api/client';
import type { BridgeCoverageItem } from '../../api/client';
import { Card, SectionTitle, BridgeTag } from '../../squid/brand';
import { bridgeMeta, fmtPct } from '../../squid/meta';

interface TierWinRow { bridge: string; wins: number; pct: number }

interface LeaderboardProps {
  asset: string;
  tier: number;
}

const ROW_GRID = '28px 1.5fr 0.8fr 1.4fr 1.3fr 0.8fr';

export function Leaderboard({ asset, tier }: LeaderboardProps) {
  const [bridges, setBridges] = useState<BridgeCoverageItem[]>([]);
  const [totalActiveRoutes, setTotalActiveRoutes] = useState(0);
  const [aggCount, setAggCount] = useState(0);
  const [tiers, setTiers] = useState<Array<{ amountTier: number; bridges: TierWinRow[] }>>([]);
  const [liveCorridors, setLiveCorridors] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBridgeCoverage()
      .then((r) => { if (!cancelled) { setBridges(r.bridges); setTotalActiveRoutes(r.totalActiveRoutes); } })
      .catch(() => { if (!cancelled) setBridges([]); });
    fetchBridgeHealth()
      .then((r) => { if (!cancelled) setAggCount(r.aggregators.length); })
      .catch(() => { if (!cancelled) setAggCount(0); });
    fetchBridgeWinRateByTier()
      .then((r) => { if (!cancelled) setTiers(r.tiers); })
      .catch(() => { if (!cancelled) setTiers([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMatrix(asset, tier)
      .then((r) => { if (!cancelled) setLiveCorridors(r.stats.active + r.stats.singleBridge); })
      .catch(() => { if (!cancelled) setLiveCorridors(null); });
    return () => { cancelled = true; };
  }, [asset, tier]);

  const board = useMemo(() => [...bridges].sort((a, b) => b.wins - a.wins), [bridges]);
  const top = board[0] ?? null;
  const maxWin = Math.max(...board.map((b) => b.winRate), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── KPI band ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <KpiCard label="Bridges tracked" value={String(board.length || '—')} accent="var(--squid-lime)" />
        <KpiCard label="Aggregators" value={aggCount ? String(aggCount) : '—'} accent="var(--squid-lavender)" />
        <KpiCard label="Live corridors" value={liveCorridors != null ? String(liveCorridors) : '—'} accent="var(--good)"
          sub={totalActiveRoutes ? `${totalActiveRoutes} active routes tracked` : undefined} />
        <KpiCard label="Top bridge" value={top ? top.name : '—'} accent="var(--fg-1)"
          dot={top ? bridgeMeta(top.id).color : undefined} sub={top ? `${top.wins.toLocaleString()} route wins` : undefined} />
      </div>

      {/* ─── leaderboard table ─── */}
      <Card pad={18}>
        <SectionTitle accent="var(--squid-lime)" sub="every tracked bridge, ranked by corridors won">Bridge leaderboard</SectionTitle>
        {board.length === 0 ? (
          <div className="t-caption" style={{ padding: '24px 2px', textAlign: 'center' }}>Loading bridge coverage…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: ROW_GRID, gap: 0, padding: '0 4px 10px' }}>
              {['#', 'Bridge', 'Wins', 'Win rate', 'Coverage', 'Avg fee'].map((h, i) => (
                <span key={i} className="t-mono-xs" style={{ color: 'var(--fg-3)', textAlign: i === 5 ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {board.map((b, i) => (
              <div key={b.id} className="sq-row" style={{ display: 'grid', gridTemplateColumns: ROW_GRID, alignItems: 'center', padding: '11px 4px', borderTop: '1px solid var(--bg-2)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: i === 0 ? 'var(--squid-lime)' : 'var(--fg-3)' }}>{i + 1}</span>
                <BridgeTag id={b.id} />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--fg-1)' }}>{b.wins.toLocaleString()}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 14 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                    <div style={{ width: `${(b.winRate / maxWin) * 100}%`, height: '100%', background: i === 0 ? 'var(--squid-lime)' : bridgeMeta(b.id).color, opacity: i === 0 ? 1 : 0.6 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)', width: 36, textAlign: 'right' }}>{b.winRate}%</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{b.routesCovered.toLocaleString()} routes <span style={{ color: 'var(--fg-4)' }}>· {b.routesCoveredPct}%</span></span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--fg-2)', textAlign: 'right' }}>{b.avgFeeBps != null && b.avgFeeBps >= 0 ? fmtPct(b.avgFeeBps) : '—'}</span>
              </div>
            ))}
          </>
        )}
      </Card>

      {/* ─── win rate by amount tier ─── */}
      {tiers.length > 0 && (
        <Card pad={18}>
          <SectionTitle accent="var(--squid-lavender)" sub="who wins as trade size grows — small, mid, large">Win share by trade size</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            {tiers.map((t) => (
              <div key={t.amountTier}>
                <div className="t-mono-xs" style={{ color: 'var(--squid-lavender)', marginBottom: 10 }}>${t.amountTier.toLocaleString()} trades</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {t.bridges.slice(0, 6).map((r, i) => (
                    <div key={r.bridge} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: bridgeMeta(r.bridge).color, flexShrink: 0 }} />
                      <span style={{ width: 72, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bridgeMeta(r.bridge).name}</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                        <div style={{ width: `${r.pct}%`, height: '100%', background: i === 0 ? 'var(--squid-lavender)' : bridgeMeta(r.bridge).color, opacity: i === 0 ? 1 : 0.6 }} />
                      </div>
                      <span style={{ width: 34, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{r.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ label, value, accent, dot, sub }: { label: string; value: string; accent: string; dot?: string; sub?: string }) {
  return (
    <Card pad={16} style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accent }} />
      <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {dot && <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, boxShadow: `0 0 8px ${dot}88` }} />}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: accent, letterSpacing: '-0.02em' }}>{value}</span>
      </div>
      {sub && <div className="t-caption" style={{ marginTop: 5 }}>{sub}</div>}
    </Card>
  );
}
