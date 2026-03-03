-- migrations/001_init.sql
-- Bridge Rate Dashboard — Full Schema (TimescaleDB)
-- Run once. Idempotent with IF NOT EXISTS.

-- ══════════════════════════════════════════
-- EXTENSIONS
-- ══════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════
-- QUOTES (primary time-series table)
-- One row per quote from any source (aggregator or direct bridge)
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS quotes (
    ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    batch_id        UUID            NOT NULL,

    -- Route identity
    src_chain       TEXT            NOT NULL,
    dst_chain       TEXT            NOT NULL,
    asset           TEXT            NOT NULL,  -- 'ETH', 'USDC', 'USDT'
    amount_tier     INTEGER         NOT NULL,  -- 50, 1000, 50000

    -- Source
    source          TEXT            NOT NULL,  -- 'lifi', 'rango', 'bungee', 'rubic', 'direct'
    bridge          TEXT            NOT NULL,  -- Canonical bridge slug

    -- Amounts (text for bigint safety, numeric for USD)
    input_amount    TEXT            NOT NULL,
    output_amount   TEXT            NOT NULL,
    input_usd       NUMERIC(20,8)  NOT NULL,
    output_usd      NUMERIC(20,8)  NOT NULL,

    -- Fees
    gas_cost_usd    NUMERIC(20,8)  NOT NULL DEFAULT 0,
    protocol_fee_bps INTEGER       NOT NULL DEFAULT 0,
    total_fee_bps   INTEGER        NOT NULL DEFAULT 0,
    total_fee_usd   NUMERIC(20,8)  NOT NULL DEFAULT 0,

    -- Timing
    estimated_seconds INTEGER      NOT NULL DEFAULT 0,

    -- Flags
    is_multihop     BOOLEAN        NOT NULL DEFAULT false,
    steps           INTEGER        NOT NULL DEFAULT 1,

    -- Rank (computed per batch)
    rank_by_output  INTEGER        DEFAULT NULL,
    spread_bps      INTEGER        DEFAULT NULL
);

-- Convert to hypertable (1-hour chunks for fast compression)
SELECT create_hypertable('quotes', 'ts',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_quotes_route
    ON quotes (src_chain, dst_chain, asset, amount_tier, ts DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_bridge
    ON quotes (bridge, ts DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_batch
    ON quotes (batch_id);

-- ══════════════════════════════════════════
-- ROUTE_LATEST (materialized current state)
-- Upserted after each fetch cycle. Powers the Route Explorer.
-- One row per route × bridge (best quote from each bridge)
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS route_latest (
    src_chain       TEXT            NOT NULL,
    dst_chain       TEXT            NOT NULL,
    asset           TEXT            NOT NULL,
    amount_tier     INTEGER         NOT NULL,
    bridge          TEXT            NOT NULL,

    ts              TIMESTAMPTZ     NOT NULL,
    batch_id        UUID            NOT NULL,

    output_amount   TEXT            NOT NULL,
    output_usd      NUMERIC(20,8)  NOT NULL,
    input_usd       NUMERIC(20,8)  NOT NULL,
    gas_cost_usd    NUMERIC(20,8)  NOT NULL DEFAULT 0,
    total_fee_bps   INTEGER        NOT NULL DEFAULT 0,
    total_fee_usd   NUMERIC(20,8)  NOT NULL DEFAULT 0,
    estimated_seconds INTEGER      NOT NULL DEFAULT 0,
    source          TEXT            NOT NULL,

    rank_by_output  INTEGER        DEFAULT NULL,
    spread_bps      INTEGER        DEFAULT NULL,

    PRIMARY KEY (src_chain, dst_chain, asset, amount_tier, bridge)
);

CREATE INDEX IF NOT EXISTS idx_latest_route
    ON route_latest (src_chain, dst_chain, asset, amount_tier);

-- ══════════════════════════════════════════
-- ROUTE_STATUS (all 870 routes, including dead)
-- Powers the heatmap. Updated after each fetch cycle.
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS route_status (
    src_chain       TEXT            NOT NULL,
    dst_chain       TEXT            NOT NULL,
    asset           TEXT            NOT NULL,
    amount_tier     INTEGER         NOT NULL,

    state           TEXT            NOT NULL DEFAULT 'dead',  -- 'active', 'dead', 'stale', 'single-bridge'
    last_seen       TIMESTAMPTZ,
    quote_count     INTEGER         DEFAULT 0,
    bridge_count    INTEGER         DEFAULT 0,
    best_bridge     TEXT,
    best_output_usd NUMERIC(20,8),
    worst_output_usd NUMERIC(20,8),
    spread_bps      INTEGER,
    refresh_tier    SMALLINT        NOT NULL DEFAULT 3,

    PRIMARY KEY (src_chain, dst_chain, asset, amount_tier)
);

CREATE INDEX IF NOT EXISTS idx_route_status_state
    ON route_status (state, asset, amount_tier);

-- ══════════════════════════════════════════
-- FETCH_LOG (monitoring + debugging)
-- One row per API call attempt
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fetch_log (
    ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    batch_id        UUID            NOT NULL,
    src_chain       TEXT            NOT NULL,
    dst_chain       TEXT            NOT NULL,
    asset           TEXT            NOT NULL,
    amount_tier     INTEGER         NOT NULL,
    source          TEXT            NOT NULL,  -- 'lifi', 'rango', 'direct:across', etc.
    bridge          TEXT,
    status          TEXT            NOT NULL,  -- 'success', 'error', 'timeout', 'skipped'
    response_ms     INTEGER         NOT NULL DEFAULT 0,
    error_message   TEXT,
    quote_count     INTEGER         NOT NULL DEFAULT 0
);

SELECT create_hypertable('fetch_log', 'ts',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_fetch_log_status
    ON fetch_log (status, ts DESC);

-- ══════════════════════════════════════════
-- CONTINUOUS AGGREGATES (for sparklines + leaderboard)
-- ══════════════════════════════════════════

-- Hourly best/worst/avg per route
CREATE MATERIALIZED VIEW IF NOT EXISTS quotes_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', ts) AS bucket,
    src_chain,
    dst_chain,
    asset,
    amount_tier,
    bridge,
    COUNT(*)                    AS quote_count,
    MIN(total_fee_bps)          AS min_fee_bps,
    MAX(total_fee_bps)          AS max_fee_bps,
    AVG(total_fee_bps)::INTEGER AS avg_fee_bps,
    MAX(output_usd)             AS best_output_usd,
    MIN(output_usd)             AS worst_output_usd,
    AVG(estimated_seconds)::INTEGER AS avg_seconds
FROM quotes
GROUP BY bucket, src_chain, dst_chain, asset, amount_tier, bridge
WITH NO DATA;

-- Daily bridge performance
CREATE MATERIALIZED VIEW IF NOT EXISTS bridge_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', ts)    AS bucket,
    bridge,
    COUNT(*)                    AS total_quotes,
    COUNT(DISTINCT src_chain || ':' || dst_chain) AS route_coverage,
    AVG(total_fee_bps)::INTEGER AS avg_fee_bps,
    AVG(estimated_seconds)::INTEGER AS avg_seconds,
    COUNT(*) FILTER (WHERE rank_by_output = 1) AS times_cheapest
FROM quotes
GROUP BY bucket, bridge
WITH NO DATA;

-- ══════════════════════════════════════════
-- REFRESH POLICIES
-- ══════════════════════════════════════════

SELECT add_continuous_aggregate_policy('quotes_hourly',
    start_offset    => INTERVAL '3 hours',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists   => TRUE
);

SELECT add_continuous_aggregate_policy('bridge_daily',
    start_offset    => INTERVAL '3 days',
    end_offset      => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists   => TRUE
);

-- ══════════════════════════════════════════
-- COMPRESSION + RETENTION
-- ══════════════════════════════════════════

-- Compress quotes older than 1 day
ALTER TABLE quotes SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'src_chain,dst_chain,asset,bridge',
    timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('quotes', INTERVAL '1 day', if_not_exists => TRUE);

-- Drop raw quotes older than 7 days (aggregates survive)
SELECT add_retention_policy('quotes', INTERVAL '7 days', if_not_exists => TRUE);

-- Compress fetch_log older than 1 day
ALTER TABLE fetch_log SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source,status',
    timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('fetch_log', INTERVAL '1 day', if_not_exists => TRUE);
SELECT add_retention_policy('fetch_log', INTERVAL '30 days', if_not_exists => TRUE);
