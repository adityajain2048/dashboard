-- Add best_fee_bps: total fee (bps) of the best route for matrix display.
-- Matrix shows best route per corridor instead of spread between best/worst.

ALTER TABLE route_status ADD COLUMN IF NOT EXISTS best_fee_bps INTEGER;
