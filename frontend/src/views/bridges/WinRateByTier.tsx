import { getBridgeColor, getBridgeName } from '../../config/bridges';

interface TierData {
  amountTier: number;
  bridges: Array<{ bridge: string; wins: number; pct: number }>;
}

interface Props {
  tiers: TierData[];
}

const TIER_LABELS: Record<number, string> = { 50: '$50', 1000: '$1K', 50000: '$50K' };
const TIER_COLORS: Record<number, string> = { 50: '#6CF9D8', 1000: '#4F7FFF', 50000: '#F59E0B' };

export function WinRateByTier({ tiers }: Props) {
  if (tiers.length === 0) return null;

  return (
    <div className="flex gap-3">
      {tiers.map(t => {
        const maxWins = t.bridges[0]?.wins ?? 1;
        const color = TIER_COLORS[t.amountTier] ?? '#4F7FFF';
        return (
          <div key={t.amountTier} style={{ flex: 1, background: '#12121f', border: '1px solid #1e1e3a', borderRadius: 10, overflow: 'hidden' }}>
            {/* Tier header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e1e3a', background: '#0f0f1c' }} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div style={{ width: 3, height: 14, borderRadius: 2, background: color }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0f0' }}>
                  {TIER_LABELS[t.amountTier] ?? `$${t.amountTier}`}
                </span>
              </div>
              <span style={{ fontSize: 10, color: '#555' }}>
                {t.bridges.length} bridges
              </span>
            </div>

            {/* Bridge bars */}
            <div style={{ padding: '8px 0' }}>
              {t.bridges.slice(0, 12).map((b, i) => {
                const isTop = i === 0;
                const isDominant = b.pct > 40;
                const barColor = isTop ? color : getBridgeColor(b.bridge);
                return (
                  <div
                    key={b.bridge}
                    className="flex items-center gap-3"
                    style={{ padding: '5px 16px', transition: 'background 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#ffffff06'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{
                      fontSize: 11, fontWeight: isTop ? 700 : 500, width: 90, flexShrink: 0,
                      color: isTop ? color : isDominant ? '#F59E0B' : '#ccc',
                      letterSpacing: '-0.2px',
                    }}>
                      {getBridgeName(b.bridge)}
                    </span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#1a1a2e', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max((b.wins / maxWins) * 100, 2)}%`,
                        height: '100%',
                        borderRadius: 4,
                        background: isTop
                          ? `linear-gradient(90deg, ${barColor}, ${barColor}80)`
                          : isDominant ? '#F59E0B' : `${barColor}80`,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: isTop ? color : '#888', fontWeight: isTop ? 700 : 500, width: 44, textAlign: 'right', flexShrink: 0 }}>
                      {b.pct.toFixed(0)}%
                    </span>
                    <span style={{ fontSize: 10, color: '#444', width: 32, textAlign: 'right', flexShrink: 0 }}>
                      {b.wins}
                    </span>
                  </div>
                );
              })}
              {t.bridges.length === 0 && (
                <div style={{ padding: '12px 16px', fontSize: 11, color: '#444' }}>No data for this tier</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
