-- route_status is missing its primary key in production (confirmed via
-- pg_constraint: zero constraints on the table as of 2026-07-13). Likely lost
-- during an earlier pg_dump/restore cycle that also dropped the quotes
-- hypertable's chunk indexes (fixed separately). Without this PK, every
-- updateRouteStatus() upsert's `ON CONFLICT (src_chain, dst_chain, asset,
-- amount_tier)` fails with "no unique or exclusion constraint matching the ON
-- CONFLICT specification" — silently, since pipeline.ts's catch just logs a
-- warning and continues. This means route_status has not been kept in sync by
-- normal fetch cycles for an unknown period; only a one-off manual UPDATE
-- refreshed it previously.
-- Idempotent (mirrors 002_route_latest_bridge_source_pk.sql's pattern) so it's
-- safe to run on every startup regardless of current state.
ALTER TABLE route_status DROP CONSTRAINT IF EXISTS route_status_pkey;
ALTER TABLE route_status ADD PRIMARY KEY (src_chain, dst_chain, asset, amount_tier);
