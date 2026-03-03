-- migrations/000_init_plain.sql
-- Bridge Rate Dashboard — Plain PostgreSQL Schema (no TimescaleDB)
-- Use this when TimescaleDB extension is unavailable (e.g. local dev without Docker).
-- Same tables and indexes as 001_init.sql, minus hypertables/continuous aggregates/compression.

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
    best_fee_bps    INTEGER,
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

CREATE INDEX IF NOT EXISTS idx_fetch_log_status
    ON fetch_log (status, ts DESC);
