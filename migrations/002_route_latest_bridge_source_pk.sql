-- Store all routes: one row per (bridge, source) so we keep multiple quotes per bridge
-- (e.g. Across from LI.FI and Across from Bungee as separate rows).
-- Drops old PK (bridge only), adds new PK (bridge + source).

ALTER TABLE route_latest DROP CONSTRAINT IF EXISTS route_latest_pkey;
ALTER TABLE route_latest ADD PRIMARY KEY (src_chain, dst_chain, asset, amount_tier, bridge, source);
