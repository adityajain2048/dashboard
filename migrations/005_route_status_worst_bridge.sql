ALTER TABLE route_status ADD COLUMN IF NOT EXISTS worst_bridge TEXT;
-- NOTE: not CONCURRENTLY — the migration runner wraps each file in a
-- transaction, and CREATE INDEX CONCURRENTLY cannot run inside one.
-- route_latest is small (≈ a few thousand rows) so a plain CREATE INDEX
-- is near-instant; the brief SHARE lock during creation is acceptable.
CREATE INDEX IF NOT EXISTS idx_latest_asset_tier
  ON route_latest (asset, amount_tier);
