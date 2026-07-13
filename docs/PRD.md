# Bridge Rate Dashboard — Product Requirements Document

*Last updated: 2026-07-13. Supersedes the deployment assumptions in `DEPLOYMENT_V1.md` (that doc describes a Railway/Render/Vercel-only setup that is no longer how this runs in production — see `ARCHITECTURE.md` for the real infrastructure).*

---

## 1. What this is

A cross-chain bridge rate comparison engine. It continuously queries every major bridge aggregator and a long tail of direct bridge APIs for the same set of routes, normalizes their quotes into one schema, and serves the result through a REST API and a React dashboard. The product answers one question, repeatedly, at scale: **for moving X of asset Y from chain A to chain B right now, who gives the best price, and by how much?**

The live product is branded **"Squid Bridge Intelligence"** — the frontend, methodology copy, and one purpose-built API endpoint (`/api/relay/report`) are built around using this data to make a specific bridge's competitive case (currently instrumented for Squid; the `/relay/report` endpoint shows the same pattern was built for Relay too, and it generalizes to any tracked bridge).

## 2. Why this exists

Bridge aggregators (LI.FI, Bungee, Rubic, Squid, Rango) each claim broad chain coverage and competitive pricing, but there's no independent, continuously-refreshed source that actually measures this across the full cross product of chains × assets × trade sizes. Two audiences need that ground truth:

- **A bridge/aggregator's own BD team**, who need defensible, sample-size-backed proof points for partner outreach ("we cover 46 of 56 chains you'd want to route to, more than double the next aggregator") rather than self-reported marketing numbers.
- **Anyone evaluating which router to integrate or default to** — a chain, wallet, or protocol comparing options — who wants real coverage and reliability data, not vendor claims.

## 3. Scope

| Dimension | Value |
|---|---|
| Chains tracked | 56 (EVM L1s/L2s, Solana, Bitcoin, Sui, and ~20 Cosmos/IBC chains) |
| Directional routes | 3,080 (56 × 55) |
| Assets per route | Up to 3 (ETH-equivalent native, USDC, USDT — restricted per chain, e.g. Bitcoin is native-only) |
| Amount tiers | 3 ($50 / $1,000 / $50,000 USD-equivalent) |
| Total corridor/asset/tier combinations | ~24,264 |
| Aggregators queried | 5 configured (LI.FI, Rango, Bungee, Rubic, Squid) — **Rango is currently globally disabled** (Cloudflare WAF blocks our Azure egress IP; not a data-quality decision) |
| Direct bridges | 17 tracked; 12 have direct REST integrations used for gap-fill when no aggregator surfaces them |

## 4. Core features

1. **Live rate matrix** — a heatmap over all 56×55 chain pairs for a chosen asset/tier, showing route health (active / stale / dead / single-bridge-only) and the best available price.
2. **Route Explorer** — drill into one specific corridor and see every quote from every source, ranked.
3. **Bridge/aggregator leaderboard** — win-rate ranking ("which aggregator found the best price most often") and coverage ranking ("which bridge appears in the most corridors"), both live and filterable by asset/tier.
4. **Insights** — best/worst fee routes right now, biggest price spreads (arbitrage-style opportunities), route health summary, "monopoly routes" (only one bridge can serve them at all).
5. **Bridge-specific competitive reports** (`/api/relay/report`, and by extension any bridge) — wins, losses with the exact price gap in bps, which competitors beat it and by how much, and coverage gaps against its own supported-chain list. This is the machine-readable version of the BD analysis a human would otherwise have to hand-build from raw data.
6. **Methodology page** — public-facing explanation of how prices, fees, and spreads are computed, so the numbers are auditable rather than a black box.

## 5. Data collection model

Every route/asset/tier combination is refreshed on a recurring cycle by independent background workers (one per aggregator, plus a gap-fill worker for direct bridges). Aggregators are queried first; a direct bridge is only called if no aggregator surfaced it for that route (avoids redundant API calls). See `ARCHITECTURE.md` §4 for the full scheduling design, including why refresh frequency is currently throttled to 3 cycles/day rather than continuous polling.

## 6. Success metrics

- **Coverage**: % of the ~24,264 tracked combinations with at least one live (non-stale) quote. As of this writing, roughly 1,200–1,600 of 3,080 unique corridors have live pricing at any given moment (coverage is corridor-first, not combination-first, since not every chain supports every asset).
- **Freshness**: routes are marked `stale` if no source has refreshed them in the freshness window (currently 4 hours per `/api/health`'s definition, 240 min in the leaderboard's win-rate filter).
- **Reliability of the underlying data itself**: aggregator success rate on "actionable" calls (excludes genuine no-route cases) — currently LI.FI ~97-98%, Bungee ~99-100%, Squid ~95-96%, Rubic ~75-79% over multi-day windows. These numbers are themselves a product output (see the bridge-specific reports).

## 7. Known limitations (as of 2026-07-13)

- **Rango is disabled**, not absent by choice — infra-blocked, not a coverage gap in the data model.
- **No continuous aggregates / compression / retention policies** — the TimescaleDB deployment runs on the Apache (community) edition, which excludes those TSL-licensed features. Historical rollups (`/api/history`) fall back to querying the raw `quotes` table directly when the `quotes_hourly` continuous aggregate doesn't exist, which it currently doesn't in production.
- **Refresh cadence is currently 3×/day per worker**, not near-real-time, as a direct consequence of production database capacity constraints (see `ARCHITECTURE.md` §8 for the full incident history behind this decision). This is a cost/reliability tradeoff, not a design goal — increasing frequency requires either a larger database tier or further architectural work to reduce write volume.
- **A "win" can mean two very different things** and the product does not yet visually distinguish them: winning because you had the best price among multiple competing quotes, versus winning because you were the *only* aggregator that could quote the route at all (common for non-EVM/long-tail chains). Anyone building a BD narrative from this data needs to split contested vs. monopoly routes manually today (see the Squid BD analysis in `output/squid-bd-narrative.md` for a worked example of why this distinction matters and how a naive win-rate number can be actively misleading).

## 8. Open questions for the team

- Should the leaderboard UI itself split "price wins" from "exclusive coverage" instead of leaving that analysis to whoever queries the data directly?
- Is 3×/day refresh acceptable long-term, or does the product need a database tier upgrade to restore faster cycling? (Cost tradeoff: see `ARCHITECTURE.md` §8 for exact pricing pulled from Azure's retail API.)
- The `/relay/report`-style endpoint currently only exists for Relay. Is there value in generalizing it to a `/api/bridges/:id/report` pattern so any tracked bridge gets the same BD-ready output on demand?
