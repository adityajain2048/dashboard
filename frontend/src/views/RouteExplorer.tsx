import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchQuotes, fetchHistory } from '../api/client';
import type { HistoryDataPoint } from '../api/client';
import { HEATMAP_ORDER, getChainMeta, getReceiveSymbol, getAssetSymbol } from '../config/chains';
import { getDecimals } from '../config/decimals';
import { ChainIcon } from '../components/ChainIcon';
import { AssetIcon } from '../components/AssetIcon';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

/** Format token amount. Aggregators return base units (wei/smallest unit).
 * Always divide by 10^decimals — single source of truth from decimals config. */
function formatTokenAmount(rawAmount: string, asset: string, chain: string): string {
  const dec = getDecimals(chain, asset);
  const num = Number(rawAmount);
  const n = dec > 0 ? num / 10 ** dec : num;
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  if (n >= 0.0001) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toExponential(2);
}

interface RouteExplorerProps {
  asset: string;
  tier: number;
  selectedRoute: { src: string; dst: string } | null;
}

interface QuoteRow {
  source: string;
  bridge: string;
  outputAmount: string;
  outputUsd: string;
  totalFeeBps: number;
  totalFeeUsd: string;
  gasCostUsd: string;
  estimatedSeconds: number;
  rank?: number;
  spreadBps?: number;
}

const BRIDGE_COLORS: Record<string, string> = {
  across: '#6CF9D8', stargate: '#FFD700', relay: '#FF6B6B', hop: '#A78BFA',
  debridge: '#9945FF', orbiter: '#60A5FA', symbiosis: '#34D399', cbridge: '#F472B6',
  mayan: '#F59E0B', meson: '#00E5FF', everclear: '#627EEA', wormhole: '#8247E5',
  cctp: '#2775CA', thorchain: '#0098EA', chainflip: '#1DB954', garden: '#804A26',
  allbridge: '#EC796B',
};

function getBridgeColor(bridge: string): string {
  return BRIDGE_COLORS[bridge.toLowerCase()] ?? '#555';
}

function formatSpread(bps: number | undefined): { text: string; color: string } {
  if (bps === undefined || bps === null) return { text: '\u2014', color: '#555' };
  if (bps === 0) return { text: 'BEST', color: '#6CF9D8' };
  const pct = (bps / 100).toFixed(2);
  if (bps < 30) return { text: `-${pct}%`, color: '#6CF9D8' };
  if (bps < 100) return { text: `-${pct}%`, color: '#F59E0B' };
  return { text: `-${pct}%`, color: '#FF6B6B' };
}

export function RouteExplorer({ asset, tier, selectedRoute }: RouteExplorerProps) {
  const [src, setSrc] = useState('ethereum');
  const [dst, setDst] = useState('arbitrum');
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshIn, setRefreshIn] = useState(60);
  const [srcOpen, setSrcOpen] = useState(false);
  const [dstOpen, setDstOpen] = useState(false);
  const srcRef = useRef<HTMLDivElement>(null);
  const dstRef = useRef<HTMLDivElement>(null);

  // History chart state
  const [showHistory, setShowHistory] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<string>('24h');
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Apply selectedRoute from heatmap click
  useEffect(() => {
    if (selectedRoute) {
      setSrc(selectedRoute.src);
      setDst(selectedRoute.dst);
    }
  }, [selectedRoute]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchQuotes(src, dst, asset, tier);
      setQuotes((data.quotes as QuoteRow[]) || []);
      setRefreshIn(60);
    } catch {
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [src, dst, asset, tier]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh countdown
  useEffect(() => {
    const t = setInterval(() => {
      setRefreshIn(n => {
        if (n <= 1) { load(); return 60; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [load]);

  // Load history data when expanded
  useEffect(() => {
    if (!showHistory) return;
    setHistoryLoading(true);
    fetchHistory(src, dst, asset, tier, historyPeriod)
      .then(res => setHistoryData(res.dataPoints))
      .catch(() => setHistoryData([]))
      .finally(() => setHistoryLoading(false));
  }, [showHistory, src, dst, asset, tier, historyPeriod]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (srcRef.current && !srcRef.current.contains(e.target as Node)) setSrcOpen(false);
      if (dstRef.current && !dstRef.current.contains(e.target as Node)) setDstOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const swap = () => { const tmp = src; setSrc(dst); setDst(tmp); };

  const srcMeta = getChainMeta(src);
  const dstMeta = getChainMeta(dst);

  const spreadRange = quotes.length > 1
    ? ((quotes[quotes.length - 1]?.spreadBps ?? 0) / 100).toFixed(2)
    : '0';
  const aggCount = new Set(quotes.map(q => q.source)).size;

  // Compute per-bridge source count for aggregator coverage indicator
  const bridgeSourceCount = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const q of quotes) {
      if (!map.has(q.bridge)) map.set(q.bridge, new Set());
      map.get(q.bridge)!.add(q.source);
    }
    return map;
  }, [quotes]);

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Section label */}
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 3, height: 16, borderRadius: 2, background: '#6CF9D8' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.3px' }}>Route Explorer</span>
        </div>
        <span style={{ fontSize: 9, color: '#555' }}>Select a corridor to compare bridge quotes in real-time</span>
      </div>

      {/* Route selector bar */}
      <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
        {/* FROM selector */}
        <div ref={srcRef} style={{ flex: 1, position: 'relative' }}>
          <div
            onClick={() => setSrcOpen(o => !o)}
            style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
          >
            <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>From</div>
            <div className="flex items-center gap-2">
              <ChainIcon chain={src} size="md" />
              <div>
                <div style={{ fontSize: 13, color: '#e0e0f0', fontWeight: 600 }}>{srcMeta.name}</div>
                <div style={{ fontSize: 9, color: '#555' }}>{srcMeta.type} &middot; Tier {srcMeta.tier}</div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>{'\u25BE'}</div>
            </div>
          </div>
          {srcOpen && (
            <ChainDropdown
              selected={src}
              onSelect={(c) => { setSrc(c); setSrcOpen(false); }}
              exclude={dst}
            />
          )}
        </div>

        {/* Swap / Arrow */}
        <button
          type="button"
          onClick={swap}
          style={{ width: 36, height: 36, borderRadius: '50%', background: '#1a1a2e', border: '1px solid #2a2a4a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', color: '#6CF9D8', fontSize: 14, fontFamily: 'inherit' }}
          title="Swap direction"
        >
          &harr;
        </button>

        {/* TO selector */}
        <div ref={dstRef} style={{ flex: 1, position: 'relative' }}>
          <div
            onClick={() => setDstOpen(o => !o)}
            style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
          >
            <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>To</div>
            <div className="flex items-center gap-2">
              <ChainIcon chain={dst} size="md" />
              <div>
                <div style={{ fontSize: 13, color: '#e0e0f0', fontWeight: 600 }}>{dstMeta.name}</div>
                <div style={{ fontSize: 9, color: '#555' }}>{dstMeta.type} &middot; Tier {dstMeta.tier}</div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>{'\u25BE'}</div>
            </div>
          </div>
          {dstOpen && (
            <ChainDropdown
              selected={dst}
              onSelect={(c) => { setDst(c); setDstOpen(false); }}
              exclude={src}
            />
          )}
        </div>

        {/* Amount display */}
        <div style={{ width: 200, background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Quote size</div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14, color: '#e0e0f0', fontWeight: 700 }}>${tier.toLocaleString()}</span>
            <span style={{ fontSize: 10, color: '#666' }}>in</span>
            <AssetIcon asset={getAssetSymbol(asset, src)} size={16} />
            <span style={{ fontSize: 11, color: '#6CF9D8', fontWeight: 600 }}>{getAssetSymbol(asset, src)}</span>
          </div>
        </div>

        {/* Compare button */}
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            background: loading ? '#1a1a2e' : 'linear-gradient(135deg, #6CF9D8, #4F7FFF)',
            borderRadius: 10, padding: '16px 24px', cursor: loading ? 'wait' : 'pointer',
            flexShrink: 0, border: 'none', fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: loading ? '#555' : '#0a0a14' }}>
            {loading ? 'Loading...' : 'Compare'}
          </span>
        </button>
      </div>

      {/* Quote results table */}
      <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 12, overflow: 'hidden' }}>
        {/* Table header */}
        <div className="flex items-center" style={{ padding: '10px 16px', borderBottom: '1px solid #1e1e3a', background: '#0f0f1c' }}>
          <div style={{ width: 28 }} />
          <div style={{ flex: 2, fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Bridge</div>
          <div style={{ flex: 1, fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Source</div>
          <div style={{ flex: 1.5, fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>You Receive</div>
          <div style={{ flex: 1.2, fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Fee Breakdown</div>
          <div style={{ flex: 1, fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Est. Time</div>
          <div style={{ flex: 1, fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Spread</div>
        </div>

        {/* Rows */}
        {loading && quotes.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#555', fontSize: 12 }}>
            Fetching quotes from aggregators...
          </div>
        ) : quotes.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#555', fontSize: 12 }}>
            No quotes available for this route
          </div>
        ) : (
          quotes.map((q, i) => {
            const spread = formatSpread(q.spreadBps);
            const totalFee = parseFloat(q.totalFeeUsd);
            const gasFee = parseFloat(q.gasCostUsd);
            const protocolFee = Math.max(totalFee - gasFee, 0);
            const feeBarTotal = totalFee > 0 ? totalFee : 1;
            const gasPct = (gasFee / feeBarTotal) * 100;
            const srcCount = bridgeSourceCount.get(q.bridge)?.size ?? 1;

            return (
              <div
                key={`${q.bridge}-${q.source}-${i}`}
                className="flex items-center"
                style={{
                  padding: '11px 16px',
                  borderBottom: i < quotes.length - 1 ? '1px solid #1a1a2e' : 'none',
                  background: i === 0 ? '#6CF9D808' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#6CF9D808'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = i === 0 ? '#6CF9D808' : 'transparent'; }}
              >
                {/* Rank */}
                <div style={{ width: 28, fontSize: 11, color: i === 0 ? '#6CF9D8' : '#555', fontWeight: 700 }}>
                  {i === 0 ? '\u2605' : `#${i + 1}`}
                </div>

                {/* Bridge + source count */}
                <div style={{ flex: 2 }}>
                  <div className="flex items-center gap-2">
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: getBridgeColor(q.bridge) }} />
                    <span style={{ fontSize: 12, color: '#e0e0f0', fontWeight: 600 }}>{q.bridge}</span>
                  </div>
                  {srcCount > 1 && (
                    <div style={{ fontSize: 8, color: '#666', marginTop: 2, marginLeft: 18 }}>
                      {srcCount} sources
                    </div>
                  )}
                </div>

                {/* Source (aggregator) */}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 9, color: '#888', background: '#1a1a2e', padding: '2px 6px', borderRadius: 3 }}>{q.source}</span>
                </div>

                {/* Output */}
                <div style={{ flex: 1.5, textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: i === 0 ? '#6CF9D8' : '#e0e0f0', fontWeight: 700 }}>
                    ${parseFloat(q.outputUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 10, color: '#666', marginTop: 1 }}>
                    {formatTokenAmount(q.outputAmount, asset, dst)} {getReceiveSymbol(asset, dst)}
                    {parseFloat(q.outputUsd) < tier * 0.05 && (
                      <span style={{ marginLeft: 6, fontSize: 9, color: '#F59E0B' }} title="Output much lower than expected — may need refresh">⚠</span>
                    )}
                  </div>
                </div>

                {/* Fee breakdown micro-bar */}
                <div style={{ flex: 1.2, textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
                    ${totalFee.toFixed(2)}
                    <span style={{ fontSize: 9, color: '#555', marginLeft: 4 }}>{q.totalFeeBps}bps</span>
                  </div>
                  <div className="flex items-center gap-1" style={{ justifyContent: 'flex-end' }}>
                    <div style={{ width: 60, height: 5, borderRadius: 3, background: '#1a1a2e', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${gasPct}%`, height: '100%', background: '#555' }} title={`Gas: $${gasFee.toFixed(2)}`} />
                      <div style={{ width: `${100 - gasPct}%`, height: '100%', background: '#F59E0B' }} title={`Protocol: $${protocolFee.toFixed(2)}`} />
                    </div>
                    <span style={{ fontSize: 7, color: '#555' }}>gas/proto</span>
                  </div>
                </div>

                {/* Time */}
                <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#888' }}>
                  {q.estimatedSeconds < 60 ? `~${q.estimatedSeconds}s` : `~${Math.round(q.estimatedSeconds / 60)}m`}
                </div>

                {/* Spread */}
                <div style={{ flex: 1, textAlign: 'right' }}>
                  {q.spreadBps === 0 || q.rank === 1 ? (
                    <span style={{ fontSize: 10, color: '#6CF9D8', background: '#6CF9D815', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>BEST</span>
                  ) : (
                    <span style={{ fontSize: 11, color: spread.color, fontWeight: 600 }}>{spread.text}</span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Footer */}
        <div style={{ padding: '8px 16px', background: '#0f0f1c', borderTop: '1px solid #1e1e3a' }} className="flex items-center justify-between">
          <span style={{ fontSize: 9, color: '#444' }}>
            {quotes.length} bridge{quotes.length !== 1 ? 's' : ''} found &middot; {aggCount} aggregator{aggCount !== 1 ? 's' : ''} queried
            {quotes.length > 1 && <> &middot; Spread range: {spreadRange}%</>}
          </span>
          <span style={{ fontSize: 9, color: '#444' }}>
            Next refresh: {refreshIn}s
          </span>
        </div>
      </div>

      {/* ═══ HISTORY CHART ═══ */}
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() => setShowHistory(h => !h)}
          style={{
            background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 6,
            padding: '6px 14px', fontSize: 10, color: showHistory ? '#6CF9D8' : '#888',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          {showHistory ? 'Hide History' : 'Show History'}
        </button>

        {showHistory && (
          <div style={{ background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 12, padding: 16, marginTop: 8 }}>
            {/* Period selector */}
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Period:</span>
              {(['24h', '7d', '30d'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setHistoryPeriod(p)}
                  style={{
                    padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                    cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: historyPeriod === p ? '#6CF9D820' : '#1a1a2e',
                    color: historyPeriod === p ? '#6CF9D8' : '#666',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', color: '#555', fontSize: 11, padding: 24 }}>Loading history...</div>
            ) : historyData.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#555', fontSize: 11, padding: 24 }}>
                No historical data yet — charts appear after 1+ hours of data collection
              </div>
            ) : (
              <HistoryChart data={historyData} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── History Chart ─── */

function HistoryChart({ data }: { data: HistoryDataPoint[] }) {
  // Pivot data: each timestamp gets { ts, bridge1_fee, bridge2_fee, ... }
  const bridges = [...new Set(data.map(d => d.bridge))];
  const byTime = new Map<string, Record<string, number>>();
  for (const d of data) {
    if (!byTime.has(d.ts)) byTime.set(d.ts, { ts: new Date(d.ts).getTime() } as unknown as Record<string, number>);
    byTime.get(d.ts)![d.bridge] = d.avgFeeBps;
  }
  const chartData = Array.from(byTime.values());

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData}>
        <XAxis
          dataKey="ts"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(v: number) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          stroke="#333"
          fontSize={9}
        />
        <YAxis stroke="#333" fontSize={9} label={{ value: 'Fee (bps)', angle: -90, position: 'insideLeft', style: { fill: '#555', fontSize: 9 } }} />
        <Tooltip
          contentStyle={{ background: '#12121f', border: '1px solid #2a2a4a', borderRadius: 8, fontSize: 10 }}
          labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
        />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        {bridges.map(b => (
          <Line
            key={b}
            type="monotone"
            dataKey={b}
            stroke={BRIDGE_COLORS[b.toLowerCase()] ?? '#555'}
            dot={false}
            strokeWidth={2}
            name={b}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── Chain Dropdown ─── */

function ChainDropdown({ selected, onSelect, exclude }: { selected: string; onSelect: (c: string) => void; exclude: string }) {
  const grouped = {
    'Tier 1 \u2014 High Volume': HEATMAP_ORDER.filter(c => getChainMeta(c).tier === 1),
    'Tier 2 \u2014 Medium Volume': HEATMAP_ORDER.filter(c => getChainMeta(c).tier === 2),
    'Tier 3 \u2014 Long Tail': HEATMAP_ORDER.filter(c => getChainMeta(c).tier === 3),
  };

  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
      background: '#12121f', border: '1px solid #2a2a4a', borderRadius: 10,
      marginTop: 4, maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {Object.entries(grouped).map(([label, chains]) => (
        <div key={label}>
          <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: 1, padding: '8px 12px 4px', borderTop: '1px solid #1a1a2e' }}>
            {label}
          </div>
          {chains.map(c => {
            const meta = getChainMeta(c);
            const isSelected = c === selected;
            const isExcluded = c === exclude;
            return (
              <div
                key={c}
                onClick={() => { if (!isExcluded) onSelect(c); }}
                className="flex items-center gap-2"
                style={{
                  padding: '6px 12px', cursor: isExcluded ? 'not-allowed' : 'pointer',
                  background: isSelected ? '#6CF9D810' : 'transparent',
                  opacity: isExcluded ? 0.3 : 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!isExcluded) (e.currentTarget as HTMLDivElement).style.background = '#1a1a2e'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? '#6CF9D810' : 'transparent'; }}
              >
                <ChainIcon chain={c} size="sm" />
                <span style={{ fontSize: 11, color: '#e0e0f0', fontWeight: 500 }}>{meta.name}</span>
                <span style={{ fontSize: 8, color: '#555', marginLeft: 'auto' }}>{meta.type}</span>
                {meta.isNew && <span style={{ fontSize: 7, color: '#836EF9', background: '#836EF915', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}>NEW</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
