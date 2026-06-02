/* ════════════════════════════════════════════════════════════════════════
   APP SHELL — Squid Bridge Intelligence. Sidebar nav + top control bar +
   view router. Asset / tier / live-status state is shared across views and
   driven entirely by the backend (/api/health for liveness).
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import { fetchHealth } from './api/client';
import { HEATMAP_ORDER } from './config/chains';
import { SquidMark, SquidWordmark } from './squid/brand';
import { Insights } from './views/squid/Insights';
import { RouteExplorer } from './views/squid/RouteExplorer';
import { Leaderboard } from './views/squid/Leaderboard';

const ASSETS = ['USDC', 'USDT', 'ETH'] as const;
const TIERS: Array<{ k: number; l: string }> = [
  { k: 50, l: '$50' },
  { k: 1000, l: '$1K' },
  { k: 50000, l: '$50K' },
];

type View = 'insights' | 'explorer' | 'bridges';
const NAV: Array<{ k: View; l: string; icon: string }> = [
  { k: 'insights', l: 'Insights', icon: '◇' },
  { k: 'explorer', l: 'Route Explorer', icon: '◈' },
  { k: 'bridges', l: 'Bridge Leaderboard', icon: '▤' },
];

interface HealthData {
  status: string;
  uptime: number;
  db: { connected: boolean; quoteCount: number; oldestQuote: string | null };
}

function App() {
  const [view, setView] = useState<View>('insights');
  const [asset, setAsset] = useState<string>('USDC');
  const [tier, setTier] = useState<number>(1000);
  const [route, setRoute] = useState<{ src: string; dst: string } | null>(null);

  const [health, setHealth] = useState<HealthData | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [elapsed, setElapsed] = useState(0);

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

  useEffect(() => {
    if (!lastUpdate) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - lastUpdate) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  const openRoute = useCallback((src: string, dst: string) => {
    setRoute({ src, dst });
    setView('explorer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const live = health?.status === 'ok';
  const statusColor = live ? 'var(--good)' : health?.status === 'degraded' ? 'var(--warn)' : 'var(--bad)';
  const routeCount = HEATMAP_ORDER.length * (HEATMAP_ORDER.length - 1);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-0)' }}>
      {/* ─── SIDEBAR ─── */}
      <aside style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--line)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '20px 18px 16px', display: 'flex', alignItems: 'center', gap: 11, borderBottom: '1px solid var(--line)' }}>
          <SquidMark size={34} variant="lime" />
          <div>
            <SquidWordmark height={22} />
            <div className="t-mono-xs" style={{ color: 'var(--squid-lavender)', marginTop: 4, fontSize: 9 }}>BRIDGE INTELLIGENCE</div>
          </div>
        </div>

        <nav style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map((n) => {
            const on = view === n.k;
            return (
              <button key={n.k} onClick={() => setView(n.k)} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 'var(--r-sm)',
                border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
                background: on ? 'rgba(230,250,54,0.10)' : 'transparent',
                color: on ? 'var(--squid-lime)' : 'var(--fg-2)',
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
                boxShadow: on ? 'inset 0 0 0 1px rgba(230,250,54,0.25)' : 'none', transition: 'all .12s',
              }}>
                <span style={{ fontSize: 14, opacity: on ? 1 : 0.6 }}>{n.icon}</span>{n.l}
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: 16, borderTop: '1px solid var(--line)' }}>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
              <span className="t-mono-xs" style={{ color: statusColor }}>{live ? 'all systems live' : (health?.status ?? 'connecting…')}</span>
            </div>
            <div className="t-caption" style={{ fontSize: 11, lineHeight: 1.5 }}>
              4 aggregators · 17 bridges · {HEATMAP_ORDER.length} chains
              {health ? ` · ${health.db.quoteCount.toLocaleString()} live quotes` : ''}.
            </div>
          </div>
          <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginTop: 11, textAlign: 'center', fontSize: 9 }}>powered by Squid Router</div>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(11,11,15,0.82)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--line)', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div className="t-h3" style={{ fontSize: 15 }}>{NAV.find((n) => n.k === view)!.l}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Segmented options={ASSETS.map((a) => ({ k: a, l: a === 'ETH' ? 'Native' : a }))} value={asset} onChange={(v) => setAsset(String(v))} accent="var(--squid-lavender)" />
            <Segmented options={TIERS.map((t) => ({ k: t.k, l: t.l }))} value={tier} onChange={(v) => setTier(Number(v))} accent="var(--squid-lime)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} title={`${routeCount} routes`} />
              <span className="t-mono-xs" style={{ color: 'var(--fg-3)' }}>{lastUpdate ? `${elapsed}s ago` : '…'}</span>
            </div>
          </div>
        </header>

        <main style={{ padding: '22px 24px 60px', maxWidth: 1480, width: '100%', margin: '0 auto' }}>
          {view === 'insights' && <Insights asset={asset} tier={tier} onOpenRoute={openRoute} />}
          {view === 'explorer' && <RouteExplorer asset={asset} tier={tier} route={route} />}
          {view === 'bridges' && <Leaderboard asset={asset} tier={tier} />}
        </main>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onChange, accent }: {
  options: Array<{ k: T; l: string }>; value: T; onChange: (v: T) => void; accent: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 3, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', padding: 3, border: '1px solid var(--line)' }}>
      {options.map((o) => {
        const on = value === o.k;
        return (
          <button key={String(o.k)} onClick={() => onChange(o.k)} style={{
            padding: '5px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11,
            background: on ? accent : 'transparent', color: on ? 'var(--on-lime)' : 'var(--fg-3)', transition: 'all .12s',
          }}>{o.l}</button>
        );
      })}
    </div>
  );
}

export default App;
