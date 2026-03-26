-- migrations/001_init_community.sql
-- Bridge Rate Dashboard — TimescaleDB Community (Apache 2.0) Schema
-- Uses hypertables (Apache-licensed) but skips continuous aggregates,
-- compression, and retention policies (TSL-licensed).
-- For Azure PostgreSQL Flexible Server or any TimescaleDB Apache edition.

-- ══════════════════════════════════════════
-- EXTENSIONS
-- ══════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════
-- QUOTES (primary time-series table)
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS quotes (
    ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    batch_id        UUID            NOT NULL,
    src_chain       TEXT            NOT NULL,
    dst_chain       TEXT            NOT NULL,
    asset           TEXT            NOT NULL,
    amount_tier     INTEGER         NOT NULL,
    source          TEXT            NOT NULL,
    bridge          TEXT            NOT NULL,
    input_amount    TEXT            NOT NULL,
    output_amount   TEXT            NOT NULL,
    input_usd       NUMERIC(20,8)  NOT NULL,
    output_usd      NUMERIC(20,8)  NOT NULL,
    gas_cost_usd    NUMERIC(20,8)  NOT NULL DEFAULT 0,
    protocol_fee_bps INTEGER       NOT NULL DEFAULT 0,
    total_fee_bps   INTEGER        NOT NULL DEFAULT 0,
    total_fee_usd   NUMERIC(20,8)  NOT NULL DEFAULT 0,
    estimated_seconds INTEGER      NOT NULL DEFAULT 0,
    is_multihop     BOOLEAN        NOT NULL DEFAULT false,
    steps           INTEGER        NOT NULL DEFAULT 1,
    rank_by_output  INTEGER        DEFAULT NULL,
    spread_bps      INTEGER        DEFAULT NULL
);

-- Convert to hypertable (Apache-licensed feature)
SELECT create_hypertable('quotes', 'ts',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_quotes_route
    ON quotes (src_chain, dst_chain, asset, amount_tier, ts DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_bridge
    ON quotes (bridge, ts DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_batch
    ON quotes (batch_id);

-- ══════════════════════════════════════════
-- ROUTE_LATEST
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
-- ROUTE_STATUS
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS route_status (
    src_chain       TEXT            NOT NULL,
    dst_chain       TEXT            NOT NULL,
    asset           TEXT            NOT NULL,
    amount_tier     INTEGER         NOT NULL,
    state           TEXT            NOT NULL DEFAULT 'dead',
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
-- FETCH_LOG
-- ══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fetch_log (
    ts              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    batch_id        UUID            NOT NULL,
    src_chain       TEXT            NOT NULL,
    dst_chain       TEXT            NOT NULL,
    asset           TEXT            NOT NULL,
    amount_tier     INTEGER         NOT NULL,
    source          TEXT            NOT NULL,
    bridge          TEXT,
    status          TEXT            NOT NULL,
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

-- NOTE: Continuous aggregates (quotes_hourly, bridge_daily),
-- compression policies, and retention policies are NOT included here.
-- They require TimescaleDB's Timescale License (TSL).
-- The app works without them — sparkline/leaderboard queries will
-- run against the raw quotes table instead.
