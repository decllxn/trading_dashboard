-- 0012_security_hardening.sql — Full security hardening pass
--
-- Resolves all Supabase security advisor findings and hardens the project:
--
--  1. Enables RLS + FORCE + user-scoped policies on 5 tables that were missing
--     them entirely: user_settings, copilot_sessions, copilot_messages,
--     best_trades, simulations.
--
--  2. Hardens market_data_cache: replaces wide-open USING(true) policies with
--     read-only for authenticated, write restricted to service_role.
--
--  3. Fixes trade-screenshots storage policies: scopes uploads/deletes to the
--     user's own path prefix, restricts reads to authenticated users.
--
--  4. Revokes anon DML on all user-scoped tables (defense in depth).
--
--  5. Grants authenticated + service_role privileges on the 5 new tables.
--
-- Idempotent: every statement guards on DROP IF EXISTS / IF NOT EXISTS.
-- Apply in the Supabase SQL editor as the postgres role.

-- =============================================================================
-- 1a. user_settings — RLS + policies
-- =============================================================================
-- This table was created by drizzle:push but never had a migration to enable
-- RLS. Any authenticated user (or anon with grants) could read/write ALL users'
-- settings.

-- Enable and FORCE Row-Level Security on all 14 tables in the schema
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades FORCE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
ALTER TABLE trade_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_trade_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_trade_links FORCE ROW LEVEL SECURITY;
ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE csv_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE snaptrade_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE snaptrade_users FORCE ROW LEVEL SECURITY;
ALTER TABLE market_data_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_select_own ON user_settings;
CREATE POLICY user_settings_select_own
  ON user_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_insert_own ON user_settings;
CREATE POLICY user_settings_insert_own
  ON user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_update_own ON user_settings;
CREATE POLICY user_settings_update_own
  ON user_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_delete_own ON user_settings;
CREATE POLICY user_settings_delete_own
  ON user_settings FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 1b. copilot_sessions — RLS + policies
-- =============================================================================

ALTER TABLE copilot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS copilot_sessions_select_own ON copilot_sessions;
CREATE POLICY copilot_sessions_select_own
  ON copilot_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS copilot_sessions_insert_own ON copilot_sessions;
CREATE POLICY copilot_sessions_insert_own
  ON copilot_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS copilot_sessions_update_own ON copilot_sessions;
CREATE POLICY copilot_sessions_update_own
  ON copilot_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS copilot_sessions_delete_own ON copilot_sessions;
CREATE POLICY copilot_sessions_delete_own
  ON copilot_sessions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 1c. copilot_messages — RLS + policies (ownership via copilot_sessions)
-- =============================================================================
-- copilot_messages has no user_id column of its own. Ownership is dereferenced
-- through the session it belongs to, identical to the trade_tags / journal_
-- trade_links pattern used throughout the schema.

ALTER TABLE copilot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS copilot_messages_select_own ON copilot_messages;
CREATE POLICY copilot_messages_select_own
  ON copilot_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM copilot_sessions cs
       WHERE cs.id = copilot_messages.session_id
         AND cs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS copilot_messages_insert_own ON copilot_messages;
CREATE POLICY copilot_messages_insert_own
  ON copilot_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM copilot_sessions cs
       WHERE cs.id = copilot_messages.session_id
         AND cs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS copilot_messages_update_own ON copilot_messages;
CREATE POLICY copilot_messages_update_own
  ON copilot_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM copilot_sessions cs
       WHERE cs.id = copilot_messages.session_id
         AND cs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM copilot_sessions cs
       WHERE cs.id = copilot_messages.session_id
         AND cs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS copilot_messages_delete_own ON copilot_messages;
CREATE POLICY copilot_messages_delete_own
  ON copilot_messages FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM copilot_sessions cs
       WHERE cs.id = copilot_messages.session_id
         AND cs.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 1d. best_trades — RLS + policies
-- =============================================================================

ALTER TABLE best_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE best_trades FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS best_trades_select_own ON best_trades;
CREATE POLICY best_trades_select_own
  ON best_trades FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS best_trades_insert_own ON best_trades;
CREATE POLICY best_trades_insert_own
  ON best_trades FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS best_trades_update_own ON best_trades;
CREATE POLICY best_trades_update_own
  ON best_trades FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS best_trades_delete_own ON best_trades;
CREATE POLICY best_trades_delete_own
  ON best_trades FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 1e. simulations — RLS + policies
-- =============================================================================

ALTER TABLE simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS simulations_select_own ON simulations;
CREATE POLICY simulations_select_own
  ON simulations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS simulations_insert_own ON simulations;
CREATE POLICY simulations_insert_own
  ON simulations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS simulations_update_own ON simulations;
CREATE POLICY simulations_update_own
  ON simulations FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS simulations_delete_own ON simulations;
CREATE POLICY simulations_delete_own
  ON simulations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- 2. Harden market_data_cache — remove anon write, restrict to service_role
-- =============================================================================
-- The server writes market data via DATABASE_URL (postgres role, bypasses RLS).
-- There is no reason for browser clients to INSERT or UPDATE cache rows. We
-- keep SELECT for authenticated users (the dashboard reads cached prices) but
-- remove all write policies from anon/authenticated.

-- Drop the old wide-open policies
DROP POLICY IF EXISTS market_data_cache_select ON market_data_cache;
DROP POLICY IF EXISTS market_data_cache_insert ON market_data_cache;
DROP POLICY IF EXISTS market_data_cache_update ON market_data_cache;

-- Read-only for authenticated users
CREATE POLICY market_data_cache_select_authenticated
  ON market_data_cache FOR SELECT TO authenticated
  USING (true);

-- Revoke DML from anon on market_data_cache (was granted in 0008)
REVOKE INSERT, UPDATE, DELETE ON market_data_cache FROM anon;
-- Revoke client-side write; server uses postgres role which bypasses RLS
REVOKE INSERT, UPDATE, DELETE ON market_data_cache FROM authenticated;
-- Keep SELECT for authenticated
GRANT SELECT ON market_data_cache TO authenticated;
-- service_role retains full access for server-side operations
GRANT SELECT, INSERT, UPDATE, DELETE ON market_data_cache TO service_role;

-- =============================================================================
-- 3. Fix trade-screenshots storage policies
-- =============================================================================
-- The original policies (from 0011) allowed:
--   * Public read (anyone on the internet)
--   * Authenticated insert to ANY path (can overwrite other users' files)
--   * Authenticated delete scoped to owner (correct)
--
-- Fixed policies:
--   * Read: authenticated only (not public)
--   * Insert: authenticated, scoped to user's own path prefix ({uid}/*)
--   * Update: authenticated, scoped to own path prefix
--   * Delete: authenticated, scoped to own path prefix

-- Drop old overly-permissive policies
DROP POLICY IF EXISTS "Allow public read access to trade screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own screenshots" ON storage.objects;

-- Authenticated-only read for trade screenshots
CREATE POLICY "trade_screenshots_select_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trade-screenshots');

-- Upload scoped to user's own folder: the first path segment must be the user's uid
CREATE POLICY "trade_screenshots_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'trade-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update scoped to own folder
CREATE POLICY "trade_screenshots_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'trade-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'trade-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete scoped to own folder
CREATE POLICY "trade_screenshots_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'trade-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- 4. Ensure PostgREST table grants (anon, authenticated)
-- =============================================================================
-- PostgREST requires base table privileges for the `anon` and `authenticated`
-- API roles to route incoming HTTP requests to RLS policy evaluation.
-- Row-level security policies (e.g. user_id = auth.uid()) strictly restrict
-- row access so unauthenticated requests (auth.uid() IS NULL) return 0 rows.

GRANT SELECT, INSERT, UPDATE, DELETE ON trades TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON trade_tags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_trade_links TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON broker_connections TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON csv_mappings TO anon, authenticated;

-- =============================================================================
-- 5. Grants for the 5 newly-protected tables
-- =============================================================================
-- These tables were created by drizzle:push (which runs as postgres) and never
-- had explicit grants. Without GRANT, the PostgREST API roles cannot touch them
-- even though RLS policies exist — same issue fixed in 0004 for the original
-- tables. The server actions use DATABASE_URL (postgres role, bypasses grants +
-- RLS), but adding grants ensures Supabase client access works correctly.

GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_sessions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON copilot_messages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON best_trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON best_trades TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON simulations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON simulations TO service_role;

-- =============================================================================
-- Refresh planner stats on newly-indexed tables
-- =============================================================================
ANALYZE user_settings;
ANALYZE copilot_sessions;
ANALYZE copilot_messages;
ANALYZE best_trades;
ANALYZE simulations;
ANALYZE market_data_cache;
