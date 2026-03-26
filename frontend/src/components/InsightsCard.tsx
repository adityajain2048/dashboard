import { useState, useEffect } from 'react';
import { fetchInsights } from '../api/client';
import type { InsightsData } from '../api/client';

export function InsightsCard() {
  const [data, setData] = useState<InsightsData | null>(null);

  useEffect(() => {
    const poll = (): void => {
      fetchInsights().then(setData).catch(() => { /* ignore */ });
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return (
      <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: '#555' }}>Loading insights...</span>
      </div>
    );
  }

  const { routeHealth } = data;
  const totalRoutes = routeHealth.active + routeHealth.dead + routeHealth.stale + routeHealth.singleBridge;

  return (
    <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
      <div className="flex items-center gap-6" style={{ flexWrap: 'wrap' }}>

        {/* Best Route */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Best Route</div>
          {data.bestRoute ? (
            <div style={{ fontSize: 11, color: '#6CF9D8', fontWeight: 600 }}>
              {data.bestRoute.src} &rarr; {data.bestRoute.dst}{' '}
              <span style={{ color: '#e0e0f0' }}>{data.bestRoute.feeBps}bps</span>{' '}
              <span style={{ color: '#888', fontWeight: 400 }}>via {data.bestRoute.bridge}</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#444' }}>&mdash;</div>
          )}
        </div>

        {/* Worst Route */}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Worst Route</div>
          {data.worstRoute ? (
            <div style={{ fontSize: 11, color: '#FF6B6B', fontWeight: 600 }}>
              {data.worstRoute.src} &rarr; {data.worstRoute.dst}{' '}
              <span style={{ color: '#e0e0f0' }}>{data.worstRoute.feeBps}bps</span>{' '}
              <span style={{ color: '#888', fontWeight: 400 }}>via {data.worstRoute.bridge}</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#444' }}>&mdash;</div>
          )}
        </div>

        {/* Top Spread */}
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Top Spread</div>
          {data.biggestSpreads[0] ? (
            <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>
              {data.biggestSpreads[0].src} &rarr; {data.biggestSpreads[0].dst}{' '}
              <span style={{ color: '#e0e0f0' }}>{data.biggestSpreads[0].spreadBps}bps</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#444' }}>&mdash;</div>
          )}
        </div>

        {/* Route Health */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Route Health</div>
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 11, color: '#6CF9D8', fontWeight: 600 }}>{routeHealth.active} active</span>
            <span style={{ fontSize: 11, color: '#555' }}>/</span>
            <span style={{ fontSize: 11, color: '#F59E0B' }}>{routeHealth.stale} stale</span>
            <span style={{ fontSize: 11, color: '#555' }}>/</span>
            <span style={{ fontSize: 11, color: '#FF6B6B' }}>{routeHealth.dead} dead</span>
            {totalRoutes > 0 && (
              <div style={{ marginLeft: 8, width: 60, height: 6, borderRadius: 3, background: '#1a1a2e', overflow: 'hidden' }} className="flex">
                <div style={{ width: `${(routeHealth.active / totalRoutes) * 100}%`, background: '#6CF9D8', height: '100%' }} />
                <div style={{ width: `${(routeHealth.singleBridge / totalRoutes) * 100}%`, background: '#4F7FFF', height: '100%' }} />
                <div style={{ width: `${(routeHealth.stale / totalRoutes) * 100}%`, background: '#F59E0B', height: '100%' }} />
              </div>
            )}
          </div>
        </div>

        {/* Monopoly Alert */}
        <div style={{ flex: 0, minWidth: 140 }}>
          <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Monopoly</div>
          <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>
            {data.monopolyRouteCount} <span style={{ color: '#888', fontWeight: 400 }}>single-bridge</span>
          </div>
        </div>

      </div>
    </div>
  );
}
