import { useState, useEffect, useCallback } from 'react';
import { fetchHealth, fetchOpportunities } from './api/client';
import { AssetIcon } from './components/AssetIcon';
import { RouteExplorer } from './views/RouteExplorer';
import { Heatmap } from './views/Heatmap';
import { HEATMAP_ORDER } from './config/chains';

const ASSETS = ['ETH', 'USDC', 'USDT'] as const;
const TIERS: Array<{ key: number; label: string }> = [
  { key: 50, label: '$50' },
  { key: 1000, label: '$1K' },
  { key: 50000, label: '$50K' },
];

interface HealthData {
  status: string;
  uptime: number;
  db: { connected: boolean; quoteCount: number; oldestQuote: string | null };
}

interface TopOpp {
  src: string;
  dst: string;
  spreadBps: number;
  bestBridge: string | null;
  worstBridge: string | null;
}

function App() {
  const [asset, setAsset] = useState<string>('USDC');
  const [tier, setTier] = useState<number>(1000);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [topOpp, setTopOpp] = useState<TopOpp | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<{ src: string; dst: string } | null>(null);

  // Poll health
  useEffect(() => {
    const poll = () => {
      fetchHealth()
        .then((r) => { setHealth(r); setLastUpdate(Date.now()); })
        .catch(() => setHealth(null));
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, []);

  // Poll top opportunity
  useEffect(() => {
    const poll = () => {
      fetchOpportunities(1, 0)
        .then((r) => {
          const opp = r.opportunities[0] as TopOpp | undefined;
          if (opp) setTopOpp(opp);
        })
        .catch(() => {/* ignore */});
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!lastUpdate) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - lastUpdate) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  const handleCellClick = useCallback((src: string, dst: string) => {
    setSelectedRoute({ src, dst });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const statusColor = health?.status === 'ok' ? '#6CF9D8' : health?.status === 'degraded' ? '#F59E0B' : '#FF6B6B';

  return (
    <div style={{ background: '#0a0a14', minHeight: '100vh' }}>

      {/* ═══ TOP NAV BAR ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #12121f 0%, #0d0d1a 100%)', borderBottom: '1px solid #1e1e3a', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="flex items-center justify-between" style={{ maxWidth: 1440, margin: '0 auto', height: 56 }}>

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #6CF9D8, #4F7FFF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#0a0a14' }}>B</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.5px' }}>Bridge Rate Explorer</span>
            <span style={{ fontSize: 9, color: '#6CF9D8', background: '#6CF9D812', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>BETA</span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}40` }} title={`Status: ${health?.status ?? 'unknown'}`} />
          </div>

          {/* Center: Asset + Tier pills */}
          <div className="flex items-center gap-6">
            {/* Asset — Native = chain native (ETH/BNB/SOL/…), USDC, USDT */}
            <div className="flex items-center gap-1" style={{ background: '#1a1a2e', borderRadius: 8, padding: 3 }}>
              {ASSETS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAsset(a)}
                  className="flex items-center gap-1.5"
                  style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                    background: asset === a ? '#6CF9D820' : 'transparent',
                    color: asset === a ? '#6CF9D8' : '#666',
                    boxShadow: asset === a ? 'inset 0 0 0 1px #6CF9D840' : 'none',
                    fontFamily: 'inherit',
                  }}
                  title={a === 'ETH' ? 'Chain native (ETH, BNB, SOL, etc.)' : undefined}
                >
                  <AssetIcon asset={a} size={14} />
                  {a === 'ETH' ? 'Native' : a}
                </button>
              ))}
            </div>

            {/* Tier */}
            <div className="flex items-center gap-1" style={{ background: '#1a1a2e', borderRadius: 8, padding: 3 }}>
              {TIERS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTier(t.key)}
                  style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                    background: tier === t.key ? '#4F7FFF20' : 'transparent',
                    color: tier === t.key ? '#4F7FFF' : '#666',
                    boxShadow: tier === t.key ? 'inset 0 0 0 1px #4F7FFF40' : 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Stats */}
          <div className="flex items-center gap-5">
            <Stat label="Chains" value={String(HEATMAP_ORDER.length)} />
            <Stat label="Routes" value={String(HEATMAP_ORDER.length * (HEATMAP_ORDER.length - 1))} />
            <Stat label="Bridges" value="17" />
            <Stat label="Updated" value={elapsed > 0 ? `${elapsed}s ago` : '...'} valueColor="#6CF9D8" />
          </div>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px' }}>

        {/* Route Explorer */}
        <RouteExplorer asset={asset} tier={tier} selectedRoute={selectedRoute} />

        {/* Heatmap Matrix */}
        <Heatmap asset={asset} tier={tier} onCellClick={handleCellClick} />

        {/* ═══ BOTTOM STATS BAR ═══ */}
        <div className="flex items-center justify-between" style={{ marginTop: 20, padding: '12px 16px', background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10 }}>
          <div className="flex items-center gap-6">
            <div>
              <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Aggregators Active</div>
              <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                {['LI.FI', 'Rango', 'Bungee', 'Rubic'].map(a => (
                  <span key={a} style={{ fontSize: 9, color: '#888', background: '#1a1a2e', padding: '2px 8px', borderRadius: 4, border: '1px solid #2a2a4a' }}>{a}</span>
                ))}
              </div>
            </div>
            <div style={{ borderLeft: '1px solid #1e1e3a', paddingLeft: 20 }}>
              <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Top Opportunity</div>
              <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600, marginTop: 4 }}>
                {topOpp ? (
                  <>
                    {topOpp.src} &rarr; {topOpp.dst} &middot; {topOpp.spreadBps} bps spread
                    {topOpp.bestBridge && topOpp.worstBridge && <> &middot; {topOpp.bestBridge} vs {topOpp.worstBridge}</>}
                  </>
                ) : (
                  <span style={{ color: '#444' }}>Loading...</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Corridor Tiers</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                <span style={{ color: '#6CF9D8' }}>T1</span> 74 @ 60s &middot;{' '}
                <span style={{ color: '#4F7FFF' }}>T2</span> 52 @ 2m &middot;{' '}
                <span style={{ color: '#555' }}>T3</span> 744 @ 5m
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Quotes</div>
              <div style={{ fontSize: 13, color: '#e0e0f0', fontWeight: 600, marginTop: 4 }}>
                {health?.db.quoteCount != null ? health.db.quoteCount.toLocaleString() : '\u2014'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 13, color: valueColor ?? '#e0e0f0', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default App;
