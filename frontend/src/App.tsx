import { useState, useEffect, useCallback } from 'react';
import { fetchHealth, fetchOpportunities } from './api/client';
import { AssetIcon } from './components/AssetIcon';
import { InsightsCard } from './components/InsightsCard';
import { RouteExplorer } from './views/RouteExplorer';
import { Heatmap } from './views/Heatmap';
import { Bridges } from './views/Bridges';
import { Opportunities } from './views/Opportunities';
import { HEATMAP_ORDER } from './config/chains';

const ASSETS = ['ETH', 'USDC', 'USDT'] as const;
const TIERS: Array<{ key: number; label: string }> = [
  { key: 50, label: '$50' },
  { key: 1000, label: '$1K' },
  { key: 50000, label: '$50K' },
];

type Tab = 'explorer' | 'matrix' | 'bridges' | 'insights';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'explorer', label: 'Explorer' },
  { key: 'matrix', label: 'Matrix' },
  { key: 'bridges', label: 'Bridges' },
  { key: 'insights', label: 'Insights' },
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
  const [activeTab, setActiveTab] = useState<Tab>('explorer');

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
    setActiveTab('explorer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleRouteClick = useCallback((src: string, dst: string) => {
    setSelectedRoute({ src, dst });
    setActiveTab('explorer');
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
            {/* Asset */}
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

      {/* ═══ TAB BAR ═══ */}
      <div style={{ background: '#0d0d1a', borderBottom: '1px solid #1e1e3a', padding: '0 24px' }}>
        <div className="flex items-center gap-2" style={{ maxWidth: 1440, margin: '0 auto', height: 40 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                background: activeTab === t.key ? '#6CF9D815' : 'transparent',
                color: activeTab === t.key ? '#6CF9D8' : '#666',
                boxShadow: activeTab === t.key ? 'inset 0 0 0 1px #6CF9D830' : 'none',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          ))}

          {/* Top opportunity hint in tab bar */}
          {topOpp && (
            <div style={{ marginLeft: 'auto', fontSize: 9, color: '#F59E0B' }}>
              Top opp: {topOpp.src} &rarr; {topOpp.dst} &middot; {topOpp.spreadBps} bps
            </div>
          )}
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px' }}>

        {activeTab === 'explorer' && (
          <>
            <InsightsCard />
            <RouteExplorer asset={asset} tier={tier} selectedRoute={selectedRoute} />
          </>
        )}

        {activeTab === 'matrix' && (
          <Heatmap asset={asset} tier={tier} onCellClick={handleCellClick} />
        )}

        {activeTab === 'bridges' && (
          <Bridges />
        )}

        {activeTab === 'insights' && (
          <Opportunities onRouteClick={handleRouteClick} />
        )}

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
