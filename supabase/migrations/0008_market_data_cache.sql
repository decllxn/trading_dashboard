-- 0008_market_data_cache.sql — Caching layer for external market data
--
-- Creates the table for caching Alpaca/Twelve Data price series JSON payloads,
-- enables RLS, and grants full privileges to API roles so the server (and potentially clients)
-- can read/write cached values.

CREATE TABLE IF NOT EXISTS market_data_cache (
  symbol text NOT NULL,
  timeframe text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT market_data_cache_pkey PRIMARY KEY (symbol, timeframe)
);

-- Enable RLS
ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_cache FORCE ROW LEVEL SECURITY;

-- Policies for authenticated and anon users (read-only or full access for server execution)
-- Since the server pooler operates as the superuser/postgres owner, it bypasses RLS.
-- We add these policies to allow API roles to fetch if needed, and to ensure security is locked down.
DROP POLICY IF EXISTS market_data_cache_select ON market_data_cache;
CREATE POLICY market_data_cache_select
  ON market_data_cache FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS market_data_cache_insert ON market_data_cache;
CREATE POLICY market_data_cache_insert
  ON market_data_cache FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS market_data_cache_update ON market_data_cache;
CREATE POLICY market_data_cache_update
  ON market_data_cache FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON market_data_cache TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON market_data_cache TO service_role;
