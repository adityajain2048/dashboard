-- Slippage tolerance per quote, in basis points: (toAmount − toAmountMin) / toAmount.
-- Captured for providers that expose a minimum-output guarantee (LI.FI, Squid);
-- NULL for providers that don't (Bungee, Rubic, direct bridges).
-- Idempotent — safe to re-run on every startup.
ALTER TABLE quotes       ADD COLUMN IF NOT EXISTS slippage_bps INTEGER;
ALTER TABLE route_latest ADD COLUMN IF NOT EXISTS slippage_bps INTEGER;
