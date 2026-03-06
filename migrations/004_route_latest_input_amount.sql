-- Add input_amount to route_latest for data completeness
ALTER TABLE route_latest ADD COLUMN IF NOT EXISTS input_amount TEXT NOT NULL DEFAULT '';
