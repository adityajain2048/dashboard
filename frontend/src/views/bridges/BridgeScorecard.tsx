import type { BridgeCoverageItem, BridgeHealth } from '../../api/client';
import { BRIDGE_META, getBridgeColor, getBridgeName } from '../../config/bridges';

interface Props {
  bridges: BridgeCoverageItem[];
  health: BridgeHealth[];
  totalActiveRoutes: number;
}

export function BridgeScorecard({ bridges, health, totalActiveRoutes }: Props) {
  const healthMap = new Map(health.map(h => [h.id, h]));

  // Only show bridges with some activity
  const activeBridges = bridges.filter(b => b.routesCovered > 0).slice(0, 18);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {activeBridges.map(b => {
        const h = healthMap.get(b.id);
        const meta = BRIDGE_META[b.id];
        const color = getBridgeColor(b.id);
        const chainCount = b.supportedChains?.length ?? 0;
        const bMaxRoutes = b.maxRoutes ?? 0;
        const coveragePct = bMaxRoutes > 0 ? Math.min((b.routesCovered / bMaxRoutes) * 100, 100) : 0;
        const live = h?.isStale === false;

        return (
          <div key={b.id} style={{
            background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10,
            padding: '14px 16px', position: 'relative', overflow: 'hidden',
          }}>
            {/* Top accent line */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />

            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div className="flex items-center gap-2">
                <div style={{ width: 10, height: 10, borderRadius: 3, background: color, boxShadow: `0 0 8px ${color}40` }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0f0', letterSpacing: '-0.3px' }}>
                  {getBridgeName(b.id)}
                </span>
              </div>
              {live && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6CF9D8', boxShadow: '0 0 6px #6CF9D860' }} />
              )}
            </div>

            {/* Coverage bar — routes found vs max possible for this bridge */}
            <div style={{ marginBottom: 14 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>Coverage ({chainCount} chains)</span>
                <span style={{ fontSize: 11, color: '#e0e0f0', fontWeight: 600 }}>
                  {b.routesCovered} <span style={{ color: '#555', fontWeight: 400 }}>/ {bMaxRoutes}</span>
                </span>
              </div>
              <div style={{ width: '100%', height: 5, borderRadius: 3, background: '#1a1a2e', overflow: 'hidden' }}>
                <div style={{
                  width: `${coveragePct}%`, height: '100%', borderRadius: 3,
                  background: `linear-gradient(90deg, ${color}, ${color}60)`,
                }} />
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-5">
              <Metric label="Win Rate" value={`${b.winRate.toFixed(1)}%`} color={b.winRate > 15 ? '#6CF9D8' : b.winRate > 5 ? '#e0e0f0' : '#666'} />
              <Metric label="Avg Fee" value={b.avgFeeBps != null ? `${Math.round(b.avgFeeBps)} bps` : '\u2014'} color={b.avgFeeBps != null && b.avgFeeBps < 30 ? '#6CF9D8' : '#ccc'} />
              <Metric label="Wins" value={String(b.wins)} color="#e0e0f0" />
            </div>

            {/* Source tags */}
            {meta && (
              <div className="flex items-center gap-1" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                {meta.hasDirect && (
                  <Tag label="Direct API" color="#6CF9D8" />
                )}
                {meta.inAggregators.map(agg => (
                  <Tag key={agg} label={agg} color="#555" />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, color, fontWeight: 500,
      background: `${color}10`, padding: '2px 7px', borderRadius: 3,
      border: `1px solid ${color}20`,
    }}>
      {label}
    </span>
  );
}
