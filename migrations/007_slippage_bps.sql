-- Per-quote PRICE IMPACT (the real, liquidity-driven slippage), in basis points.
-- Captured only from providers that report it (Squid: aggregatePriceImpact);
-- NULL otherwise (LI.FI/Bungee/Rubic don't expose price impact).
-- NB: an earlier revision stored the slippage *tolerance* in slippage_bps — that was
-- the user-set threshold, not a real cost — so we drop it and use price_impact_bps.
-- Idempotent — safe to re-run on every startup.
ALTER TABLE quotes       DROP COLUMN IF EXISTS slippage_bps;
ALTER TABLE route_latest DROP COLUMN IF EXISTS slippage_bps;
ALTER TABLE quotes       ADD COLUMN IF NOT EXISTS price_impact_bps INTEGER;
ALTER TABLE route_latest ADD COLUMN IF NOT EXISTS price_impact_bps INTEGER;
