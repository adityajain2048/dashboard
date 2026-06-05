/* ════════════════════════════════════════════════════════════════════════
   ROUTE EXPLORER — pick a corridor, compare every bridge quote live.
   Squid-branded port of the design's RouteExplorer, wired entirely to the
   backend:
     · /api/quotes   → ranked bridge/aggregator quote stack
     · /api/history  → per-bridge fee history (recharts line chart)
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchQuotes, fetchHistory } from '../../api/client';
import type { HistoryDataPoint } from '../../api/client';
import { HEATMAP_ORDER, getChainMeta, getReceiveSymbol, getAssetSymbol } from '../../config/chains';
import { getDecimals } from '../../config/decimals';
import { Card, SectionTitle, Pill, ChainChip, BridgeTag } from '../../squid/brand';
import { chainMeta, aggMeta, bridgeMeta, fmtUsd, fmtPct, fmtTime } from '../../squid/meta';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface QuoteRow {
  source: string;
  bridge: string;
  ts?: string;
  outputAmount: string;
  outputUsd: string;
  totalFeeBps: number;
  totalFeeUsd: string;
  gasCostUsd: string;
  estimatedSeconds: number;
  rank?: number;
  spreadBps?: number;
}

interface RouteExplorerProps {
  asset: string;
  tier: number;
  route: { src: string; dst: string } | null;
}

/** Format token amount. Aggregators return base units; divide by 10^decimals. */
function formatTokenAmount(rawAmount: string, asset: string, chain: string): string {
  const dec = getDecimals(chain, asset);
  const num = Number(rawAmount);
  const n = dec > 0 ? num / 10 ** dec : num;
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  if (n >= 0.0001) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toExponential(2);
}

const GRID = '40px 1.7fr 1fr 1.3fr 1.3fr 0.9fr 0.9fr';

export function RouteExplorer({ asset, tier, route }: RouteExplorerProps) {
  const [src, setSrc] = useState('ethereum');
  const [dst, setDst] = useState('arbitrum');
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshIn, setRefreshIn] = useState(60);
  const [open, setOpen] = useState<'src' | 'dst' | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => { if (route) { setSrc(route.src); setDst(route.dst); } }, [route]);

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

  useEffect(() => {
    const t = setInterval(() => {
      setRefreshIn((n) => { if (n <= 1) { load(); return 60; } return n - 1; });
    }, 1000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!showHistory) return;
    setHistoryLoading(true);
    fetchHistory(src, dst, asset, tier, historyPeriod)
      .then((res) => setHistoryData(res.dataPoints))
      .catch(() => setHistoryData([]))
      .finally(() => setHistoryLoading(false));
  }, [showHistory, src, dst, asset, tier, historyPeriod]);

  const swap = () => { setSrc(dst); setDst(src); };

  // The backend returns ALL known quotes for the route; the frontend does the
  // windowing. The 3-hour view matches what the matrix reports (3h stale
  // threshold); the 24-hour view surfaces cheaper-but-older routes it ages out.
  const { quotes3h, quotes24h } = useMemo(() => {
    const now = Date.now();
    const cutoff3h = now - 3 * 60 * 60 * 1000;
    const cutoff24h = now - 24 * 60 * 60 * 1000;
    const fresh = (cutoff: number) =>
      quotes.filter((q) => !q.ts || new Date(q.ts).getTime() >= cutoff);
    return { quotes3h: fresh(cutoff3h), quotes24h: fresh(cutoff24h) };
  }, [quotes]);

  // Header metrics reflect the 3-hour view so the headline "Best fee" matches the matrix.
  const best = quotes3h[0];
  const worst = quotes3h[quotes3h.length - 1];
  const aggCount = new Set(quotes3h.map((q) => q.source)).size;
  const headerSpreadBps = quotes3h.length > 1 && best && worst
    ? Math.max(0, Math.round((10000 * (parseFloat(best.outputUsd) - parseFloat(worst.outputUsd))) / parseFloat(best.outputUsd)))
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ─── selector ─── */}
      <Card pad={16} style={{ position: 'relative', zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <ChainSelect label="From" value={src} exclude={dst} onChange={setSrc}
            open={open === 'src'} setOpen={(o) => setOpen(o ? 'src' : null)} />
          <button onClick={swap} title="Swap direction" style={{
            width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-3)',
            border: '1px solid var(--line-2)', color: 'var(--squid-lime)', cursor: 'pointer',
            fontSize: 16, marginBottom: 2, fontFamily: 'var(--font-mono)',
          }}>⇄</button>
          <ChainSelect label="To" value={dst} exclude={src} onChange={setDst}
            open={open === 'dst'} setOpen={(o) => setOpen(o ? 'dst' : null)} />

          <div style={{ width: 168, marginLeft: 8 }}>
            <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 6 }}>Quote size</div>
            <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--fg-1)' }}>${tier.toLocaleString()}</span>
              <span className="t-mono-xs" style={{ color: 'var(--squid-lime)', marginLeft: 'auto' }}>{getAssetSymbol(asset, src)}</span>
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'flex-end' }}>
            <Metric label="Best fee (3h)" value={best ? fmtPct(best.totalFeeBps) : '—'} tone="var(--squid-lime)" />
            <Metric label="Spread range" value={quotes3h.length > 1 ? fmtPct(headerSpreadBps) : '—'} tone="var(--fg-2)" />
            <Metric label="Bridges" value={String(quotes3h.length)} tone="var(--fg-2)" />
            <Metric label="Aggregators" value={String(aggCount)} tone="var(--squid-lavender)" />
          </div>
        </div>
      </Card>

      {/* ─── two windows: best in the last hour, and best over 24h ─── */}
      {loading && quotes.length === 0 ? (
        <Card pad={0} style={{ overflow: 'hidden' }}><Empty label="Fetching quotes from aggregators…" /></Card>
      ) : quotes.length === 0 ? (
        <Card pad={0} style={{ overflow: 'hidden' }}><Empty label="No quotes available for this corridor right now." /></Card>
      ) : (
        <>
          <QuoteSection
            title="Best — last 3 hours"
            sub="live quotes (matches the matrix)"
            quotes={quotes3h}
            asset={asset}
            dst={dst}
            tier={tier}
            refreshIn={refreshIn}
          />
          <QuoteSection
            title="Best — last 24 hours"
            sub="includes older quotes the 3h view ages out"
            quotes={quotes24h}
            asset={asset}
            dst={dst}
            tier={tier}
          />
        </>
      )}

      {/* ─── history ─── */}
      <Card pad={18}>
        <SectionTitle accent="var(--squid-lavender)" sub="per-bridge best fee over time"
          right={
            <button onClick={() => setShowHistory((h) => !h)} style={{
              padding: '6px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)',
              background: showHistory ? 'rgba(188,142,228,0.12)' : 'var(--bg-3)',
              color: showHistory ? 'var(--squid-lavender)' : 'var(--fg-3)', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11,
            }}>{showHistory ? 'Hide' : 'Show'} history</button>
          }>
          Fee history
        </SectionTitle>

        {showHistory && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              {(['24h', '7d', '30d'] as const).map((p) => (
                <button key={p} onClick={() => setHistoryPeriod(p)} style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11,
                  background: historyPeriod === p ? 'var(--squid-lavender)' : 'var(--bg-3)',
                  color: historyPeriod === p ? 'var(--on-lime)' : 'var(--fg-3)',
                }}>{p}</button>
              ))}
            </div>
            {historyLoading ? (
              <div className="t-caption" style={{ textAlign: 'center', padding: 28 }}>Loading history…</div>
            ) : historyData.length === 0 ? (
              <div className="t-caption" style={{ textAlign: 'center', padding: 28 }}>No historical data yet — charts appear after 1+ hours of collection.</div>
            ) : (
              <HistoryChart data={historyData} />
            )}
          </>
        )}
        {!showHistory && <div className="t-caption" style={{ padding: '2px 2px' }}>Open the chart to see how each bridge's fee on this corridor has moved.</div>}
      </Card>
    </div>
  );
}

/** One ranked quote table for a time window. Spread is recomputed relative to
 *  THIS window's best so each section is internally consistent. */
function QuoteSection({ title, sub, quotes, asset, dst, tier, refreshIn }: {
  title: string;
  sub: string;
  quotes: QuoteRow[];
  asset: string;
  dst: string;
  /** Tier amount in USD (50/1000/50000) — used as canonical fee reference. */
  tier: number;
  refreshIn?: number;
}) {
  const bridgeSourceCount = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const q of quotes) {
      if (!m.has(q.bridge)) m.set(q.bridge, new Set());
      m.get(q.bridge)!.add(q.source);
    }
    return m;
  }, [quotes]);
  const aggCount = new Set(quotes.map((q) => q.source)).size;
  const bestOut = quotes.length > 0 ? parseFloat(quotes[0]!.outputUsd) : 0;

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--fg-1)' }}>{title}</span>
        <span className="t-mono-xs" style={{ color: 'var(--fg-4)' }}>{sub}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 0, padding: '11px 18px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        {['', 'Bridge', 'Best via', 'You receive', 'Fee', 'Time', 'Spread'].map((h, i) => (
          <span key={i} className="t-mono-xs" style={{ color: 'var(--fg-3)', textAlign: i >= 3 && i <= 4 ? 'right' : i >= 5 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>
      {quotes.length === 0 ? (
        <Empty label="No quotes in this window." />
      ) : (
        quotes.map((q, i) => {
          const out = parseFloat(q.outputUsd);
          // Canonical fee: what the user paid = tier_amount − what_they_received.
          // Using tier (not the stored totalFeeUsd) avoids aggregator price-discrepancy
          // inflation (e.g. LI.FI pricing input at $1,026 when our tier is $1,000).
          const effectiveFeeUsd = Math.max(0, tier - out);
          const effectiveFeeBps = tier > 0 ? Math.round((10000 * effectiveFeeUsd) / tier) : 0;
          // Gas split: keep aggregator gas; derive protocol = effective_fee − gas.
          const gas = parseFloat(q.gasCostUsd);
          const proto = Math.max(effectiveFeeUsd - gas, 0);
          const gasPct = effectiveFeeUsd > 0 ? (gas / effectiveFeeUsd) * 100 : 0;
          const srcCount = bridgeSourceCount.get(q.bridge)?.size ?? 1;
          const spreadBps = bestOut > 0 ? Math.max(0, Math.round((10000 * (bestOut - out)) / bestOut)) : 0;
          const spreadColor = spreadBps < 30 ? 'var(--good)' : spreadBps < 100 ? 'var(--warn)' : 'var(--bad)';
          return (
            <div key={`${q.bridge}-${q.source}-${i}`} className="sq-row" style={{
              display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '13px 18px',
              borderBottom: i < quotes.length - 1 ? '1px solid var(--bg-2)' : 'none',
              background: i === 0 ? 'rgba(230,250,54,0.05)' : 'transparent',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, color: i === 0 ? 'var(--squid-lime)' : 'var(--fg-3)' }}>{i === 0 ? '★' : i + 1}</span>
              <div>
                <BridgeTag id={q.bridge} />
                {srcCount > 1 && <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginTop: 3, marginLeft: 14 }}>on {srcCount} aggregators</div>}
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: aggMeta(q.source).color }} />
                <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 12, color: 'var(--fg-2)' }}>{aggMeta(q.source).name}</span>
              </span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: i === 0 ? 'var(--squid-lime)' : 'var(--fg-1)' }}>{fmtUsd(out)}</div>
                <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginTop: 2 }}>{formatTokenAmount(q.outputAmount, asset, dst)} {getReceiveSymbol(asset, dst)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: 'var(--fg-2)' }}>
                  {effectiveFeeUsd > 0 ? fmtUsd(effectiveFeeUsd) : <span style={{ color: 'var(--good)' }}>+{fmtUsd(out - tier)}</span>}
                  {' '}<span style={{ color: 'var(--fg-4)', fontSize: 10 }}>{effectiveFeeBps}bps</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <div style={{ width: 60, height: 5, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${gasPct}%`, background: 'var(--fg-4)' }} title={`gas ${fmtUsd(gas)}`} />
                    <div style={{ width: `${100 - gasPct}%`, background: 'var(--warn)' }} title={`protocol ${fmtUsd(proto)}`} />
                  </div>
                </div>
              </div>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)' }}>~{fmtTime(q.estimatedSeconds)}</span>
              <span style={{ textAlign: 'right' }}>
                {i === 0 ? <Pill tone="win">best</Pill> : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12, color: spreadColor }}>−{fmtPct(spreadBps)}</span>
                )}
              </span>
            </div>
          );
        })
      )}
      <div style={{ padding: '10px 18px', background: 'var(--bg-2)', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
        <span className="t-mono-xs" style={{ color: 'var(--fg-4)' }}>
          {quotes.length} bridge{quotes.length !== 1 ? 's' : ''} · {aggCount} aggregator{aggCount !== 1 ? 's' : ''}
        </span>
        {refreshIn != null && <span className="t-mono-xs" style={{ color: 'var(--fg-4)' }}>next refresh {refreshIn}s</span>}
      </div>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="t-caption" style={{ padding: '32px 18px', textAlign: 'center' }}>{label}</div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 3, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: tone }}>{value}</div>
    </div>
  );
}

/* ─── chain selector dropdown (squid styled, tier-grouped) ─── */
function ChainSelect({ label, value, exclude, onChange, open, setOpen }: {
  label: string; value: string; exclude: string; onChange: (c: string) => void; open: boolean; setOpen: (o: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [setOpen]);

  const c = chainMeta(value);
  const groups: Array<[string, string[]]> = [
    ['Tier 1 · high volume', HEATMAP_ORDER.filter((id) => getChainMeta(id).tier === 1)],
    ['Tier 2 · medium', HEATMAP_ORDER.filter((id) => getChainMeta(id).tier === 2)],
    ['Tier 3 · long tail', HEATMAP_ORDER.filter((id) => getChainMeta(id).tier === 3)],
  ];

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 190 }}>
      <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 6 }}>{label}</div>
      <div onClick={() => setOpen(!open)} style={{
        background: 'var(--bg-3)', border: `1px solid ${open ? 'var(--squid-lime)' : 'var(--line-2)'}`,
        borderRadius: 'var(--r-sm)', padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <ChainChip id={value} size={26} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--fg-1)' }}>{c.name}</div>
          <div className="t-mono-xs" style={{ color: 'var(--fg-3)' }}>{c.type} · tier {c.tier}</div>
        </div>
        <span style={{ marginLeft: 'auto', color: 'var(--fg-3)' }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 5, background: 'var(--bg-2)',
          border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--sh-3)',
          maxHeight: 320, overflowY: 'auto', zIndex: 50, padding: 5,
        }}>
          {groups.map(([gl, chains]) => (
            <div key={gl}>
              <div className="t-mono-xs" style={{ color: 'var(--fg-4)', padding: '8px 9px 4px' }}>{gl}</div>
              {chains.map((id) => {
                const ch = chainMeta(id);
                const disabled = id === exclude;
                return (
                  <div key={id}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { if (!disabled) { onChange(id); setOpen(false); } }}
                    className="sq-row" style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 6,
                      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.3 : 1,
                      background: id === value ? 'rgba(230,250,54,0.06)' : 'transparent',
                    }}>
                    <ChainChip id={id} size={22} />
                    <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 500, fontSize: 12, color: 'var(--fg-1)' }}>{ch.name}</span>
                    {ch.isNew && <Pill tone="lav" style={{ marginLeft: 'auto' }}>new</Pill>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── recharts history line chart (squid colours) ─── */
function HistoryChart({ data }: { data: HistoryDataPoint[] }) {
  const bridges = [...new Set(data.map((d) => d.bridge))];
  const byTime = new Map<string, Record<string, number>>();
  for (const d of data) {
    if (!byTime.has(d.ts)) byTime.set(d.ts, { ts: new Date(d.ts).getTime() } as unknown as Record<string, number>);
    byTime.get(d.ts)![d.bridge] = d.avgFeeBps;
  }
  const chartData = Array.from(byTime.values());

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData}>
        <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']}
          tickFormatter={(v: number) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          stroke="#45454F" fontSize={9} />
        <YAxis stroke="#45454F" fontSize={9} label={{ value: 'fee (bps)', angle: -90, position: 'insideLeft', style: { fill: '#6E6E7C', fontSize: 9 } }} />
        <Tooltip contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 8, fontSize: 10 }}
          labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        {bridges.map((b) => (
          <Line key={b} type="monotone" dataKey={b} stroke={bridgeMeta(b).color} dot={false} strokeWidth={2} name={bridgeMeta(b).name} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
