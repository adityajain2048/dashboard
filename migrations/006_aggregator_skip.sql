-- Track per-(route, aggregator) consecutive no-route cycles.
-- Rows are upserted on every no_route response and reset on a successful quote.
-- The scheduler loads this table at startup and every 30 minutes to build an
-- in-memory skip map — aggregators are skipped for routes where skip_until > NOW().

CREATE TABLE IF NOT EXISTS aggregator_route_skip (
  src_chain    TEXT            NOT NULL,
  dst_chain    TEXT            NOT NULL,
  asset        TEXT            NOT NULL,
  amount_tier  NUMERIC(20, 8)  NOT NULL,
  aggregator   TEXT            NOT NULL,
  -- How many consecutive cycles this aggregator returned no_route for this route.
  -- Incremented on each no_route; reset to 0 on a successful quote.
  miss_count   INTEGER         NOT NULL DEFAULT 0,
  -- NULL = not currently skipped. When set, the fetcher skips this pair until this time.
  skip_until   TIMESTAMPTZ,
  last_miss_at TIMESTAMPTZ,
  PRIMARY KEY (src_chain, dst_chain, asset, amount_tier, aggregator)
);

-- Partial index: only active skips need fast lookup.
CREATE INDEX IF NOT EXISTS idx_agg_skip_active
  ON aggregator_route_skip (skip_until)
  WHERE skip_until IS NOT NULL;
