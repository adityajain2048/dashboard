/* ════════════════════════════════════════════════════════════════════════
   METHODOLOGY — how every price on the dashboard is derived.
   Static reference page ("show your work") so pricing can be validated.
   Content mirrors the real pipeline: fetcher → normalizer → recalcUsd →
   filters → quoteRanking.
   ════════════════════════════════════════════════════════════════════════ */

const LIME = 'var(--squid-lime)';
const LAV = 'var(--squid-lavender)';

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="sq-card" style={{ padding: '22px 24px', ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{
        width: 26, height: 26, borderRadius: 7, flexShrink: 0,
        background: 'rgba(230,250,54,0.10)', color: LIME,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12,
        boxShadow: 'inset 0 0 0 1px rgba(230,250,54,0.25)',
      }}>{n}</span>
      <h2 className="t-h2" style={{ margin: 0, fontSize: 19 }}>{children}</h2>
    </div>
  );
}

const PIPELINE: Array<{ k: string; t: string; d: string }> = [
  { k: 'Fetch', t: 'Fetch raw quotes', d: 'Query every aggregator (LI.FI, Squid, Bungee, Rubic) and direct bridge that supports the route. Each returns an output token amount and its own fee estimate.' },
  { k: 'Normalize', t: 'Normalize the shape', d: 'Map each source’s response into one common format: output amount, gas, and bridge name — regardless of how each API reports them.' },
  { k: 'Price (USD)', t: 'Re-price in USD with one feed', d: 'Recompute every value with CoinGecko prices so all sources are comparable: output USD = output tokens × price. Input = the dollar tier ($50 / $1,000 / $50,000). We do NOT trust each aggregator’s own USD numbers.' },
  { k: 'Filter', t: 'Drop implausible quotes', d: 'Reject anything physically impossible — output worth more than input (price-feed error) or a fee above 10%. Keeps the board clean and trustworthy.' },
  { k: 'Rank', t: 'Pick the best bridge', d: 'Sort surviving quotes by highest output USD. Ties break on lowest fee, then fastest time. The top one is the “best bridge” shown.' },
];

const AGG: Array<{ id: string; color: string; inUsd: string; outUsd: string; impact: string; highFee?: string }> = [
  { id: 'LI.FI',  color: LAV,  inUsd: 'fromAmountUSD', outUsd: 'toAmountUSD',          impact: '—',                   highFee: '25 bps fee' },
  { id: 'Squid',  color: LIME, inUsd: 'fromAmountUSD', outUsd: 'toAmountUSD',          impact: 'aggregatePriceImpact' },
  { id: 'Bungee', color: LAV,  inUsd: '$ amount tier', outUsd: 'outputValueInUsd †',   impact: '—' },
  { id: 'Rubic',  color: LIME, inUsd: '$ amount tier', outUsd: 'destinationUsdAmount', impact: '—' },
];

export function Methodology() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 920 }}>

      {/* ─── Hero ─── */}
      <div style={{ marginBottom: 2 }}>
        <div className="t-mono-xs" style={{ color: LAV, marginBottom: 8 }}>PRICING METHODOLOGY</div>
        <h1 className="t-h1" style={{ margin: 0, marginBottom: 10 }}>How every price is derived</h1>
        <p className="t-body" style={{ margin: 0, maxWidth: 680, fontSize: 15 }}>
          Every quote on this dashboard goes through the same five steps. We re-price all sources
          against a single feed so the numbers are comparable and verifiable — here&apos;s exactly how,
          so you can check any price for yourself.
        </p>
      </div>

      {/* ─── 1. Pipeline ─── */}
      <Card>
        <SectionLabel n="1">The pipeline</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {PIPELINE.map((s, i) => (
            <div key={s.k} style={{ display: 'flex', gap: 16 }}>
              {/* rail */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                <span style={{
                  width: 11, height: 11, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: LIME, boxShadow: '0 0 10px rgba(230,250,54,0.5)',
                }} />
                {i < PIPELINE.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--line-2)', margin: '4px 0' }} />}
              </div>
              <div style={{ paddingBottom: i < PIPELINE.length - 1 ? 20 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                  <span className="t-h3" style={{ fontSize: 15 }}>{s.t}</span>
                  <span className="t-mono-xs" style={{ color: 'var(--fg-4)' }}>{s.k}</span>
                </div>
                <p className="t-body" style={{ margin: 0, fontSize: 13.5 }}>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── 2. Fee formula ─── */}
      <Card>
        <SectionLabel n="2">The fee, plainly</SectionLabel>
        <p className="t-body" style={{ marginTop: 0, marginBottom: 16 }}>
          A bridge&apos;s fee is simply what you lose moving funds across — the gap between what you put
          in and what arrives:
        </p>
        <div style={{
          background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
          padding: '18px 20px', textAlign: 'center', marginBottom: 16,
        }}>
          <span className="t-data" style={{ fontSize: 17, color: 'var(--fg-1)' }}>
            fee&nbsp;=&nbsp;<span style={{ color: LAV }}>input USD</span>&nbsp;&minus;&nbsp;<span style={{ color: LIME }}>output USD</span>
          </span>
          <div className="t-caption" style={{ marginTop: 8 }}>
            expressed in basis points:&nbsp; bps = 10,000 × fee ÷ input&nbsp; (100 bps = 1%)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)', padding: '14px 16px', border: '1px solid var(--line)' }}>
            <div className="t-label" style={{ marginBottom: 8 }}>Worked example</div>
            <div className="t-data" style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div>input&nbsp;&nbsp;= <span style={{ color: LAV }}>$1,000.00</span></div>
              <div>output = 999.91 USDC × $1.00 = <span style={{ color: LIME }}>$999.91</span></div>
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 6 }}>
                fee&nbsp;&nbsp;&nbsp;&nbsp;= $1,000 − $999.91 = <span style={{ color: 'var(--good)' }}>$0.09</span>
              </div>
              <div>bps&nbsp;&nbsp;&nbsp;&nbsp;= 10,000 × 0.09 ÷ 1,000 = <span style={{ color: 'var(--good)' }}>0.9 bps</span></div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── 3. input / output / price impact by provider ─── */}
      <Card>
        <SectionLabel n="3">Input, output &amp; price impact, by provider</SectionLabel>
        <p className="t-body" style={{ marginTop: 0, marginBottom: 16, fontSize: 13.5 }}>
          The values that let you validate a price: what went in, what comes out, and the price impact.
          Below is the raw field we read from each provider; what we ultimately store is in the box beneath.
        </p>
        {/* table */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '104px 0.85fr 1.05fr 1.1fr', columnGap: 14, padding: '9px 14px', background: 'var(--bg-2)' }}>
            <span className="t-label" style={{ fontSize: 10 }}>Provider</span>
            <span className="t-label" style={{ fontSize: 10 }}>input USD</span>
            <span className="t-label" style={{ fontSize: 10 }}>output USD</span>
            <span className="t-label" style={{ fontSize: 10 }}>price impact</span>
          </div>
          {AGG.map((a) => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '104px 0.85fr 1.05fr 1.1fr', columnGap: 14, alignItems: 'baseline', padding: '12px 14px', borderTop: '1px solid var(--line)' }}>
              <span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: a.color }}>{a.id}</span>
                {a.highFee && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, padding: '2px 7px', borderRadius: 'var(--r-pill)', background: 'rgba(245,196,81,0.12)', border: '1px solid rgba(245,196,81,0.32)', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 9 }}>⚠</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--warn)', letterSpacing: '0.02em' }}>{a.highFee}</span>
                  </span>
                )}
              </span>
              <span className="t-data" style={{ fontSize: 11, color: a.inUsd.startsWith('$') ? 'var(--fg-2)' : LAV }}>{a.inUsd}</span>
              <span className="t-data" style={{ fontSize: 11, color: LIME }}>{a.outUsd}</span>
              <span className="t-data" style={{ fontSize: 11, color: a.impact === '—' ? 'var(--fg-4)' : 'var(--info)' }}>{a.impact}</span>
            </div>
          ))}
        </div>
        {/* override callout */}
        <div style={{ marginTop: 16, background: 'rgba(230,250,54,0.05)', border: '1px solid rgba(230,250,54,0.22)', borderRadius: 'var(--r-md)', padding: '14px 16px' }}>
          <div className="t-label" style={{ color: LIME, marginBottom: 9 }}>What we actually store</div>
          <div className="t-body" style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <b style={{ color: 'var(--fg-1)' }}>input&nbsp;USD</b> → always the dollar tier
              (<span className="t-data" style={{ fontSize: 12 }}>$50 / $1,000 / $50,000</span>) for every provider — the providers&apos; own input USD is not used.
            </div>
            <div>
              <b style={{ color: 'var(--fg-1)' }}>output&nbsp;USD</b> → re-computed as
              <span className="t-data" style={{ fontSize: 12 }}> output tokens × CoinGecko price</span> (stablecoins = $1). Only for
              <b style={{ color: 'var(--fg-1)' }}> cross-asset</b> routes (e.g. Cosmos → ETH) do we keep the provider&apos;s own USD.
            </div>
            <div>
              <b style={{ color: 'var(--fg-1)' }}>price&nbsp;impact</b> → the <b style={{ color: 'var(--fg-1)' }}>real, liquidity-driven slippage</b>
              (it grows with trade size). Shown only where the provider reports it — Squid&apos;s
              <span className="t-data" style={{ fontSize: 12 }}> aggregatePriceImpact</span>; others show <span className="t-data" style={{ fontSize: 12 }}>—</span>.
            </div>
            <div className="t-caption" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 2 }}>
              The <b style={{ color: 'var(--fg-2)' }}>slippage tolerance</b> we set (1% on Squid) is a separate safety limit — if the
              price moves more than that before execution the transaction reverts. It is not a cost, so we don&apos;t show it.
            </div>
          </div>
        </div>
        <div className="t-caption" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.6 }}>
          ⚠ We surface a provider&apos;s own platform fee only when it&apos;s unusually high (≥ 10 bps), since these vary by plan —
          LI.FI&apos;s <span className="t-data" style={{ fontSize: 11 }}>LIFI Fixed Fee</span> (25 bps) is the notable one. Bridge &amp; gas fees aren&apos;t broken out.
          &nbsp;·&nbsp; † Bungee&apos;s <span className="t-data" style={{ fontSize: 11 }}>outputValueInUsd</span> is used only within ±50% of the tier, else recomputed. &nbsp;·&nbsp; Rango is disabled.
        </div>
      </Card>

      {/* ─── 4. Filters & ranking ─── */}
      <Card>
        <SectionLabel n="4">Sanity filters &amp; ranking</SectionLabel>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="t-label" style={{ marginBottom: 10 }}>We drop a quote if…</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Pill color="var(--bad)">output worth more than input → price-feed error</Pill>
              <Pill color="var(--bad)">fee above 10% (1,000 bps) → bad route / no liquidity</Pill>
              <Pill color="var(--stale)">no quote refreshed in 12h → shown as dead, not a stale ghost</Pill>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="t-label" style={{ marginBottom: 10 }}>Best bridge wins on…</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Pill color={LIME}>1 · highest output USD</Pill>
              <Pill color={LAV}>2 · lowest fee (tie-break)</Pill>
              <Pill color="var(--fg-3)">3 · fastest time (tie-break)</Pill>
            </div>
          </div>
        </div>
      </Card>

      <div className="t-caption" style={{ textAlign: 'center', padding: '8px 0 4px', color: 'var(--fg-4)' }}>
        Prices refresh continuously. A quote you see is at most 12 hours old — usually minutes.
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
      background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span className="t-body" style={{ fontSize: 12.5 }}>{children}</span>
    </div>
  );
}
