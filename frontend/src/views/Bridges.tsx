import { useState, useEffect } from 'react';
import { fetchBridgeCoverage, fetchBridgeWinRateByTier, fetchBridgeHealth } from '../api/client';
import type { BridgeCoverageItem, BridgeHealth, AggregatorHealth } from '../api/client';
import { BridgeCoverageTable } from './bridges/BridgeCoverageTable';
import { WinRateByTier } from './bridges/WinRateByTier';
import { BridgeScorecard } from './bridges/BridgeScorecard';

interface TierData {
  amountTier: number;
  bridges: Array<{ bridge: string; wins: number; pct: number }>;
}

export function Bridges() {
  const [bridges, setBridges] = useState<BridgeCoverageItem[]>([]);
  const [totalActiveRoutes, setTotalActiveRoutes] = useState(0);
  const [health, setHealth] = useState<BridgeHealth[]>([]);
  const [aggregators, setAggregators] = useState<AggregatorHealth[]>([]);
  const [tiers, setTiers] = useState<TierData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [cov, tier, h] = await Promise.all([
          fetchBridgeCoverage(),
          fetchBridgeWinRateByTier(),
          fetchBridgeHealth(),
        ]);
        setBridges(cov.bridges);
        setTotalActiveRoutes(cov.totalActiveRoutes);
        setTiers(tier.tiers);
        setHealth(h.bridges);
        setAggregators(h.aggregators);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>Loading bridge analytics...</div>
        <div style={{ width: 120, height: 3, borderRadius: 2, background: '#1e1e3a', margin: '0 auto', overflow: 'hidden' }}>
          <div style={{ width: '40%', height: '100%', background: '#6CF9D8', borderRadius: 2, animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      </div>
    );
  }

  // Summary stats
  const liveBridges = health.filter(h => !h.isStale).length;
  const totalBridges = bridges.length;
  const topBridge = bridges[0];

  return (
    <div>
      {/* ═══ Summary Bar ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
        <SummaryCard label="Total Bridges" value={String(totalBridges)} color="#4F7FFF" />
        <SummaryCard label="Live Bridges" value={String(liveBridges)} sub={`of ${totalBridges}`} color="#6CF9D8" />
        <SummaryCard label="Active Routes" value={String(totalActiveRoutes)} color="#F59E0B" />
        <SummaryCard label="Top Bridge" value={topBridge?.name ?? '\u2014'} sub={topBridge ? `${topBridge.wins} wins` : ''} color="#836EF9" />
      </div>

      {/* ═══ Aggregator Health ═══ */}
      {aggregators.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader title="Data Sources" color="#4F7FFF" />
          <div className="flex gap-3">
            {aggregators.map(a => (
              <div key={a.id} style={{ flex: 1, background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: '12px 16px' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0f0', textTransform: 'capitalize' }}>{a.id}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    color: a.successRate > 80 ? '#6CF9D8' : a.successRate > 50 ? '#F59E0B' : '#FF6B6B',
                    background: a.successRate > 80 ? '#6CF9D812' : a.successRate > 50 ? '#F59E0B12' : '#FF6B6B12',
                  }}>
                    {a.successRate}%
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <MiniStat label="Success" value={String(a.successCount)} color="#6CF9D8" />
                  <MiniStat label="Errors" value={String(a.errorCount)} color="#FF6B6B" />
                  <MiniStat label="Timeout" value={String(a.timeoutCount)} color="#F59E0B" />
                  {a.avgResponseMs && <MiniStat label="Latency" value={`${a.avgResponseMs}ms`} color="#888" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Coverage Table ═══ */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Bridge Leaderboard" color="#6CF9D8" sub="Ranked by route wins" />
        <BridgeCoverageTable bridges={bridges} health={health} totalActiveRoutes={totalActiveRoutes} />
      </div>

      {/* ═══ Win Rate by Tier ═══ */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader title="Win Rate by Amount" color="#F59E0B" sub="Which bridge wins at each transfer size" />
        <WinRateByTier tiers={tiers} />
      </div>

      {/* ═══ Scorecard ═══ */}
      <div>
        <SectionHeader title="Bridge Profiles" color="#836EF9" sub="Individual bridge performance cards" />
        <BridgeScorecard bridges={bridges} health={health} totalActiveRoutes={totalActiveRoutes} />
      </div>
    </div>
  );
}

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

function SectionHeader({ title, color, sub }: { title: string; color: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
      <div style={{ width: 3, height: 18, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.3px' }}>{title}</span>
      {sub && <span style={{ fontSize: 11, color: '#555' }}>{sub}</span>}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
