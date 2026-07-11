-- 0000_trades.sql — Phase 2a
--
-- Creates the `trades` table with row-level security scoped to auth.uid().
-- Idempotent: safe to re-run in the Supabase SQL editor (each statement guards
-- on IF NOT EXISTS / OR REPLACE). This file is the canonical migration; the
-- matching Drizzle definition lives in db/schema.ts. See db/README.md.
--
-- Design notes:
--  * Money/price/size columns are NUMERIC (decimal), never float — floats
--    corrupt P&L. `pnl` is SIGNED; the UI paints gain/loss off its sign.
--  * Timestamps are TIMESTAMPTZ (stored UTC, rendered in viewer tz).
--  * user_id is the tenant boundary. The FK points at auth.users (a Supabase
--    system table Drizzle doesn't manage) so it's declared here in raw DDL.
--  * RLS is FORCED so even the table owner role is bound by the policies
--    (defense in depth — no bypass via the postgres role from the client).

-- =============================================================================
-- Enums
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE asset_class AS ENUM ('equity', 'forex', 'futures', 'crypto', 'option');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE direction AS ENUM ('long', 'short');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trade_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE trade_source AS ENUM ('manual', 'csv', 'snaptrade');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS trades (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument            text            NOT NULL,
  asset_class           asset_class     NOT NULL,
  direction             direction       NOT NULL,
  entry_price           numeric(20, 8),
  exit_price            numeric(20, 8),
  size                  numeric(20, 8),
  stop_price            numeric(20, 8),
  target_price          numeric(20, 8),
  entry_time            timestamptz,
  exit_time             timestamptz,
  pnl                   numeric(20, 8),
  r_multiple            numeric(10, 4),
  status                trade_status    NOT NULL DEFAULT 'open',
  source                trade_source    NOT NULL DEFAULT 'manual',
  broker_connection_id  uuid,
  created_at            timestamptz     NOT NULL DEFAULT now()
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- A user can only ever see or touch rows where user_id matches their own
-- auth.uid(). There is no service_role bypass policy here intentionally — app
-- code uses the anon/authenticated role through the Supabase client, so RLS is
-- the single enforcement point. (The service_role key bypasses RLS by default
-- and is reserved for trusted server jobs.)
-- =============================================================================

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades FORCE ROW LEVEL SECURITY;

-- SELECT / UPDATE / DELETE share the same USING predicate: you must own the row.
-- We split them into four named policies for auditability (rather than one
-- ALL-policy) so a future change to, say, the INSERT check is a one-line diff.

DROP POLICY IF EXISTS trades_select_own ON trades;
CREATE POLICY trades_select_own
  ON trades
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS trades_insert_own ON trades;
CREATE POLICY trades_insert_own
  ON trades
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS trades_update_own ON trades;
CREATE POLICY trades_update_own
  ON trades
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS trades_delete_own ON trades;
CREATE POLICY trades_delete_own
  ON trades
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- Indexes
-- =============================================================================
-- Tenant + the columns Phase 3b (trade list) and 12c (performance) filter/sort
-- on. All are compound with user_id as the leading column so every RLS query
-- (which always filters user_id = auth.uid()) can use them.

CREATE INDEX IF NOT EXISTS trades_user_id_idx
  ON trades (user_id);

CREATE INDEX IF NOT EXISTS trades_user_entry_time_idx
  ON trades (user_id, entry_time DESC);

CREATE INDEX IF NOT EXISTS trades_user_status_idx
  ON trades (user_id, status);

-- Refresh planner stats so the new indexes are picked up immediately.
ANALYZE trades;
