-- 0003_broker_connections.sql — Phase 2d (completes Phase 2)
--
-- Creates `broker_connections`, enables user-scoped RLS, and wires the forward
-- reference left dangling in 0000_trades.sql (trades.broker_connection_id now
-- FKs to this table ON DELETE SET NULL). Idempotent: safe to re-run in the
-- Supabase SQL editor. Apply AFTER 0000/0001/0002.
-- Matches db/schema.ts.
--
-- Design notes:
--  * The table is created but not populated here — Phase 8 (SnapTrade flow)
--    writes the first rows. This migration only finalizes the schema.
--  * trades.broker_connection_id uses ON DELETE SET NULL, not CASCADE: deleting
--    a broker connection must preserve trade history; the trade just loses its
--    link. Contrast with trade_tags/journal_trade_links, where the join row has
--    no meaning once one side is gone.
--  * No (user_id, broker_name) uniqueness — a user may legitimately have
--    multiple accounts at the same broker (e.g. two Alpaca accounts).
--  * `status` is a native enum so invalid values are rejected at the DB layer.
--    The three states (active/error/disconnected) cover the Phase 8 lifecycle.

-- =============================================================================
-- Enums
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE broker_provider AS ENUM ('snaptrade', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE broker_connection_status AS ENUM ('active', 'error', 'disconnected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS broker_connections (
  id                  uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid                       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider            broker_provider            NOT NULL,
  external_account_id text,
  broker_name         text                       NOT NULL,
  status              broker_connection_status   NOT NULL DEFAULT 'active',
  last_synced_at      timestamptz,
  created_at          timestamptz                NOT NULL DEFAULT now()
);

-- Tenant + the two Phase 8 query patterns: "list my connections" and
-- "find connections needing re-sync" (active + stale last_synced_at).
CREATE INDEX IF NOT EXISTS broker_connections_user_id_idx
  ON broker_connections (user_id);
CREATE INDEX IF NOT EXISTS broker_connections_user_status_idx
  ON broker_connections (user_id, status);

ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broker_connections_select_own ON broker_connections;
CREATE POLICY broker_connections_select_own
  ON broker_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS broker_connections_insert_own ON broker_connections;
CREATE POLICY broker_connections_insert_own
  ON broker_connections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS broker_connections_update_own ON broker_connections;
CREATE POLICY broker_connections_update_own
  ON broker_connections FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS broker_connections_delete_own ON broker_connections;
CREATE POLICY broker_connections_delete_own
  ON broker_connections FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- Wire the forward reference from 0000_trades.sql.
-- =============================================================================
-- trades.broker_connection_id was declared as a bare uuid in 0000_trades.sql
-- with a "wire FK in Phase 2d" marker. Now that broker_connections exists, add
-- the FK. ON DELETE SET NULL preserves trade history when a connection is
-- removed. The DO block makes it safe to re-run (skip if the constraint exists).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'trades_broker_connection_id_fkey'
       AND conrelid = 'trades'::regclass
  ) THEN
    ALTER TABLE trades
      ADD CONSTRAINT trades_broker_connection_id_fkey
      FOREIGN KEY (broker_connection_id)
      REFERENCES broker_connections(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ANALYZE broker_connections;
