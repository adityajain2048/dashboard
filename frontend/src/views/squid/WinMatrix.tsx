/* ════════════════════════════════════════════════════════════════════════
   WIN MATRIX — chain×chain heatmap of best-route fees, wired to /api/matrix.
   Hovering a cell lazily fetches /api/quotes for that corridor and renders a
   floating "corridor intelligence" card: best bridge, best aggregator,
   runner-up + spread, fee, output, settle time, competition bars.
   ════════════════════════════════════════════════════════════════════════ */
import { useState, useRef, useMemo, useCallback, useEffect, Fragment } from 'react';
import { fetchQuotes } from '../../api/client';
import { HEATMAP_ORDER } from '../../config/chains';
import { ChainChip, BridgeTag, Pill } from '../../squid/brand';
import { chainMeta, aggMeta, bridgeMeta, contrast, fmtUsd, fmtPct, fmtTime, heatColor, heatHex } from '../../squid/meta';

export interface MatrixCell {
  src: string;
  dst: string;
  state: string;            // active | single-bridge | stale | dead
  bestFeeBps: number | null;
  bestBridge: string | null;
  quoteCount: number;
}

interface QuoteRow {
  bridge: string;
  source: string;
  outputUsd: string;
  totalFeeBps: number;
  estimatedSeconds: number;
  spreadBps?: number;
  priceImpactBps?: number | null;
}

/** Per-bridge best row, used for the competition bars + runner-up spread. */
interface BridgeLine { bridge: string; feeBps: number; spreadBps: number }

interface CorridorDetail {
  src: string;
  dst: string;
  bestBridge: string;
  bestAgg: string;
  outputUsd: number;
  priceImpactBps: number | null;
  seconds: number;
  bridgeCount: number;
  runnerSpread: number | null;
  lines: BridgeLine[];        // best per bridge, ranked
}

function buildDetail(src: string, dst: string, quotes: QuoteRow[]): CorridorDetail | null {
  if (!quotes.length) return null;
  // Quotes arrive globally ranked (row 0 = best output). Collapse to best-per-bridge.
  const seen = new Map<string, BridgeLine>();
  for (const q of quotes) {
    if (seen.has(q.bridge)) continue;
    seen.set(q.bridge, { bridge: q.bridge, feeBps: q.totalFeeBps, spreadBps: q.spreadBps ?? 0 });
  }
  const lines = Array.from(seen.values());
  const best = quotes[0];
  const runner = lines[1] ?? null;
  return {
    src, dst,
    bestBridge: best.bridge,
    bestAgg: best.source,
    outputUsd: parseFloat(best.outputUsd),
    priceImpactBps: best.priceImpactBps ?? null,
    seconds: best.estimatedSeconds,
    bridgeCount: lines.length,
    runnerSpread: runner ? runner.spreadBps : null,
    lines,
  };
}

interface WinMatrixProps {
  asset: string;
  tier: number;
  cells: MatrixCell[];
  stats: { active: number; dead: number; stale: number; singleBridge: number };
  onOpenRoute?: (src: string, dst: string) => void;
}

export function WinMatrix({ asset, tier, cells, stats, onOpenRoute }: WinMatrixProps) {
  const chains = HEATMAP_ORDER;
  const [hover, setHover] = useState<{ src: string; dst: string } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [full, setFull] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Esc exits fullscreen; lock body scroll while the overlay is open.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [full]);

  // ── lazy corridor detail (fetched per hovered cell, cached) ──
  const cacheRef = useRef<Map<string, CorridorDetail | null>>(new Map());
  const [detail, setDetail] = useState<CorridorDetail | null>(null);

  // Reset the cache whenever asset/tier changes (quotes differ per context).
  useEffect(() => { cacheRef.current.clear(); setDetail(null); }, [asset, tier]);

  const cellMap = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    cells.forEach((c) => m.set(`${c.src}:${c.dst}`, c));
    return m;
  }, [cells]);

  // Debounced fetch of the hovered corridor's quote stack.
  useEffect(() => {
    if (!hover) return;
    const key = `${hover.src}:${hover.dst}`;
    if (cacheRef.current.has(key)) { setDetail(cacheRef.current.get(key) ?? null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetchQuotes(hover.src, hover.dst, asset, tier);
        const built = buildDetail(hover.src, hover.dst, (res.quotes as QuoteRow[]) ?? []);
        cacheRef.current.set(key, built);
        if (!cancelled) setDetail(built);
      } catch {
        cacheRef.current.set(key, null);
        if (!cancelled) setDetail(null);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [hover, asset, tier]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }, []);

  const SIZE = 38, HEAD = 80;
  const cell = hover ? cellMap.get(`${hover.src}:${hover.dst}`) ?? null : null;
  // Only show detail when it matches the currently-hovered corridor.
  const detailMatches = !!(detail && hover && detail.src === hover.src && detail.dst === hover.dst);

  return (
    <div ref={wrapRef} onMouseMove={onMove} style={
      full
        ? { position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-0)', padding: '16px 18px 18px', display: 'flex', flexDirection: 'column' }
        : { position: 'relative' }
    }>
      {/* legend bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="t-label">Best fee by corridor</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="t-mono-xs" style={{ color: 'var(--fg-3)' }}>cheap</span>
            {['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5'].map((v) =>
              <span key={v} style={{ width: 16, height: 9, borderRadius: 2, background: `var(${v})` }} />)}
            <span className="t-mono-xs" style={{ color: 'var(--fg-3)' }}>costly</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <LegendStat label="Priced routes" value={stats.active + stats.singleBridge + stats.stale} tone="var(--good)" />
          <LegendStat label="No route" value={stats.dead} tone="var(--fg-4)" />
          <button
            onClick={() => setFull((f) => !f)}
            title={full ? 'Exit fullscreen (Esc)' : 'Expand matrix to fullscreen'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px',
              borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)',
              background: full ? 'rgba(230,250,54,0.12)' : 'var(--bg-3)',
              color: full ? 'var(--squid-lime)' : 'var(--fg-2)', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{full ? '✕' : '⤢'}</span>
            {full ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* grid */}
      <div style={{ overflow: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--bg-1)', maxHeight: full ? 'none' : 'calc(100vh - 220px)', flex: full ? 1 : undefined, minHeight: 0 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `${HEAD}px repeat(${chains.length}, ${SIZE}px)`,
          gridAutoRows: `${SIZE}px`, gap: 2, padding: 8, width: 'max-content',
        }}>
          {/* corner */}
          <div style={{ gridRow: 1, gridColumn: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingRight: 6, paddingBottom: 4, position: 'sticky', top: 0, left: 0, zIndex: 6, background: 'var(--bg-1)' }}>
            <span className="t-mono-xs" style={{ color: 'var(--squid-lavender)' }}>TO ▸</span>
          </div>
          {/* column headers */}
          {chains.map((id, i) => {
            const c = chainMeta(id);
            const on = hover?.dst === id;
            return (
              <div key={`ch-${id}`} style={{ gridRow: 1, gridColumn: i + 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingBottom: 3, position: 'sticky', top: 0, zIndex: 4, background: 'var(--bg-1)', transition: 'transform .1s', transform: on ? 'translateY(-2px)' : 'none' }}>
                <ChainChip id={id} size={22} ring={on} />
                <span className="t-mono-xs" style={{ fontSize: 7, color: on ? 'var(--squid-lime)' : 'var(--fg-3)' }}>{c.abbr.slice(0, 4)}</span>
              </div>
            );
          })}
          {/* rows */}
          {chains.map((rid, ri) => {
            const rc = chainMeta(rid);
            return (
              <Fragment key={`row-${rid}`}>
                <div style={{ gridRow: ri + 2, gridColumn: 1, display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end', paddingRight: 8, position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg-1)' }}>
                  <span className="t-mono-xs" style={{ fontSize: 8, color: hover?.src === rid ? 'var(--squid-lime)' : 'var(--fg-2)' }}>{rc.abbr.slice(0, 4)}</span>
                  <ChainChip id={rid} size={22} ring={hover?.src === rid} />
                </div>
                {chains.map((cid, ci) => {
                  if (rid === cid)
                    return <div key={`d-${ci}`} style={{ gridRow: ri + 2, gridColumn: ci + 2, background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)', borderRadius: 4 }} />;
                  const cl = cellMap.get(`${rid}:${cid}`);
                  const feeBps = cl?.bestFeeBps ?? null;
                  const priced = feeBps != null;   // any route with a fee → colour it
                  const isHover = hover?.src === rid && hover?.dst === cid;
                  const dim = !!hover && !isHover && (hover.src === rid || hover.dst === cid);
                  return (
                    <div key={`c-${ci}`}
                      onMouseEnter={() => { if (priced) setHover({ src: rid, dst: cid }); }}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => { if (priced) onOpenRoute?.(rid, cid); }}
                      style={{
                        gridRow: ri + 2, gridColumn: ci + 2,
                        background: priced ? heatColor(feeBps) : 'rgba(255,255,255,0.02)',
                        opacity: dim ? 0.28 : 1,
                        borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: priced ? 'pointer' : 'default',
                        outline: isHover ? '2px solid var(--fg-1)' : 'none', outlineOffset: -1,
                        boxShadow: isHover ? '0 0 0 4px rgba(244,244,240,0.12)' : 'none',
                        transition: 'opacity .1s, box-shadow .1s', position: 'relative', zIndex: isHover ? 5 : 1,
                      }}>
                      {priced && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 9, color: contrast(heatHex(feeBps)) }}>
                          {(feeBps / 100).toFixed(feeBps < 100 ? 1 : 0)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* floating intelligence card */}
      {cell && cell.bestFeeBps != null && (
        <CorridorCard
          cell={cell}
          detail={detailMatches ? detail : null}
          tier={tier}
          pos={pos}
          wrapW={wrapRef.current ? wrapRef.current.clientWidth : 800}
        />
      )}
    </div>
  );
}

function LegendStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: tone }}>{value}</span>
      <span className="t-mono-xs" style={{ color: 'var(--fg-3)' }}>{label}</span>
    </span>
  );
}

/* ─── The hover detail card ─── */
function CorridorCard({ cell, detail, tier, pos, wrapW }: { cell: MatrixCell; detail: CorridorDetail | null; tier: number; pos: { x: number; y: number }; wrapW: number }) {
  const W = 300;
  const flip = pos.x + W + 28 > wrapW;
  const left = flip ? pos.x - W - 16 : pos.x + 16;
  const top = Math.max(0, pos.y - 30);
  const lines = detail?.lines.slice(0, 3) ?? [];
  const maxFee = lines.length ? (lines[lines.length - 1].feeBps || 1) : 1;
  const srcName = chainMeta(cell.src).name;
  const dstName = chainMeta(cell.dst).name;

  return (
    <div style={{
      position: 'absolute', left, top, width: W, zIndex: 60, pointerEvents: 'none',
      background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
      boxShadow: 'var(--sh-3)', overflow: 'hidden', animation: 'sqPop .12s ease-out',
    }}>
      {/* header */}
      <div style={{ padding: '12px 14px', background: 'linear-gradient(100deg, rgba(230,250,54,0.10), rgba(188,142,228,0.08))', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChainChip id={cell.src} size={24} />
          <span style={{ color: 'var(--squid-lime)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>▸</span>
          <ChainChip id={cell.dst} size={24} />
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="t-mono-xs" style={{ color: 'var(--fg-3)' }}>BEST FEE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--squid-lime)', lineHeight: 1 }}>{fmtPct(cell.bestFeeBps)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)' }}>{srcName}</span>
          <span style={{ color: 'var(--fg-4)' }}>→</span>
          <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)' }}>{dstName}</span>
          {cell.state === 'single-bridge' && <Pill tone="lav" style={{ marginLeft: 'auto' }}>monopoly</Pill>}
        </div>
      </div>

      {/* winner block */}
      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Best bridge">
          {detail ? <BridgeTag id={detail.bestBridge} /> : cell.bestBridge ? <BridgeTag id={cell.bestBridge} /> : <Dash />}
        </Field>
        <Field label="Via aggregator">
          {detail ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: aggMeta(detail.bestAgg).color }} />
              <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--fg-1)' }}>{aggMeta(detail.bestAgg).name}</span>
            </span>
          ) : <Dash />}
        </Field>
        <Field label="You receive">
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--fg-1)' }}>{detail ? fmtUsd(detail.outputUsd) : '—'}</span>
        </Field>
        <Field label="Settles in">
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: 'var(--fg-1)' }}>{detail ? `~${fmtTime(detail.seconds)}` : '—'}</span>
        </Field>
      </div>

      {/* in → out → slippage breakdown */}
      {detail && (
        <div style={{ padding: '0 14px 11px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>
            in <span style={{ color: 'var(--squid-lavender)' }}>{fmtUsd(tier)}</span>
            <span style={{ color: 'var(--fg-4)' }}>{' → '}</span>
            out <span style={{ color: 'var(--squid-lime)' }}>{fmtUsd(detail.outputUsd)}</span>
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>
            · impact {detail.priceImpactBps != null ? fmtPct(detail.priceImpactBps) : '—'}
          </span>
          {detail.bestAgg === 'lifi' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 'var(--r-pill)', background: 'rgba(245,196,81,0.12)', border: '1px solid rgba(245,196,81,0.32)' }}>
              <span style={{ fontSize: 8 }}>⚠</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--warn)' }}>25 bps fee</span>
            </span>
          )}
        </div>
      )}

      {/* competition bars */}
      <div style={{ padding: '4px 14px 12px' }}>
        <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 7, display: 'flex', justifyContent: 'space-between' }}>
          <span>{(detail?.bridgeCount ?? cell.quoteCount)} bridges competing</span>
          {detail?.runnerSpread != null && detail.runnerSpread > 0 && <span>runner-up +{fmtPct(detail.runnerSpread)}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {lines.length === 0 && <div className="t-caption" style={{ fontSize: 11 }}>Loading corridor detail…</div>}
          {lines.map((q, i) => (
            <div key={q.bridge} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 56, fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10, color: i === 0 ? 'var(--squid-lime)' : 'var(--fg-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bridgeMeta(q.bridge).name}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(8, (q.feeBps / maxFee) * 100)}%`, height: '100%', borderRadius: 3, background: i === 0 ? 'var(--squid-lime)' : bridgeMeta(q.bridge).color, opacity: i === 0 ? 1 : 0.6 }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 10, color: i === 0 ? 'var(--squid-lime)' : 'var(--fg-3)' }}>{fmtPct(q.feeBps)}</span>
            </div>
          ))}
        </div>
        <div className="t-mono-xs" style={{ color: 'var(--fg-4)', marginTop: 9, textAlign: 'center' }}>click to open in Route Explorer</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="t-mono-xs" style={{ color: 'var(--fg-3)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Dash() {
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-4)' }}>—</span>;
}
