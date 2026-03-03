// Opportunities view — kept for future use but currently integrated into the bottom stats bar.
// The top opportunity is shown in App.tsx's footer. This full view can be re-added as a tab/panel later.

import { useState, useEffect } from 'react';
import { fetchOpportunities } from '../api/client';

interface Opp {
  src: string;
  dst: string;
  asset: string;
  amountTier: number;
  spreadBps: number;
  bestBridge: string | null;
  bestOutputUsd: string | null;
  worstBridge: string | null;
  worstOutputUsd: string | null;
  quoteCount: number;
  lastSeen: string | null;
}

export function Opportunities() {
  const [opportunities, setOpportunities] = useState<Opp[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [minSpreadBps, setMinSpreadBps] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchOpportunities(limit, minSpreadBps)
      .then((res) => {
        setOpportunities(res.opportunities as Opp[]);
        setTotal(res.total);
      })
      .catch(() => setOpportunities([]))
      .finally(() => setLoading(false));
  }, [limit, minSpreadBps]);

  return (
    <div style={{ padding: 20 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: '#F59E0B' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0f0' }}>Opportunities (by spread)</span>
      </div>

      <div className="flex gap-4" style={{ marginBottom: 16 }}>
        <label className="flex items-center gap-2" style={{ fontSize: 10, color: '#888' }}>
          Min spread (bps):
          <input type="range" min="0" max="500" value={minSpreadBps} onChange={(e) => setMinSpreadBps(Number(e.target.value))} style={{ width: 96 }} />
          <span style={{ color: '#F59E0B', fontWeight: 600 }}>{minSpreadBps}</span>
        </label>
        <label className="flex items-center gap-2" style={{ fontSize: 10, color: '#888' }}>
          Limit:
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 4, color: '#e0e0f0', padding: '2px 8px', fontSize: 10, fontFamily: 'inherit' }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div style={{ color: '#555', fontSize: 12 }}>Loading...</div>
      ) : (
        <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#0f0f1c' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e3a' }}>#</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e3a' }}>Route</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e3a' }}>Asset</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e3a' }}>Spread</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e3a' }}>Best Bridge</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e3a' }}>Best Output</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e3a' }}># Bridges</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#555' }}>No opportunities</td></tr>
              ) : (
                opportunities.map((o, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                    <td style={{ padding: '8px 12px', color: '#555' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', color: '#e0e0f0', fontWeight: 600 }}>{o.src} &rarr; {o.dst}</td>
                    <td style={{ padding: '8px 12px', color: '#888' }}>{o.asset}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#F59E0B', fontWeight: 600 }}>{o.spreadBps} bps</td>
                    <td style={{ padding: '8px 12px', color: '#6CF9D8' }}>{o.bestBridge ?? '\u2014'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#e0e0f0' }}>${o.bestOutputUsd ?? '\u2014'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#888' }}>{o.quoteCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ marginTop: 8, fontSize: 9, color: '#444' }}>Total: {total}</p>
    </div>
  );
}
