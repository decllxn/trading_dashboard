-- 0005_restore_rls_policies.sql — Phase 2 backfill
--
-- Re-enables + FORCES row-level security and restores the user-scoped policies
-- on every public table. This repairs an environment where RLS had been
-- dropped or never applied: with RLS enabled but no policies (the state this
-- repairs), `trades` was default-deny for authenticated users so the app saw
-- zero trades; with RLS disabled (the state of the other tables), every
-- logged-in user could read every other user's rows — a cross-tenant leak.
--
-- What went wrong:
--  * 0000–0003 authored ENABLE/FORCE RLS + the *_own policies, but the live
--    environment was missing them (policies dropped, or applied via a path
--    that skipped them).
--  * Grants (fixed in 0004) decide whether a role may touch the table at all.
--    RLS policies (restored here) decide which rows that role can see. Both
--    layers must be in place: grants alone left the tables either default-deny
--    (trades) or wide open (everything else).
--
-- Idempotent: every statement guards on DROP IF EXISTS / the policy is
-- re-created from scratch. Safe to re-run in the Supabase SQL editor as the
-- postgres role. Policy text mirrors 0000–0003 verbatim.

-- =============================================================================
-- trades (Phase 2a)
-- =============================================================================
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trades_select_own ON trades;
CREATE POLICY trades_select_own
  ON trades FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS trades_insert_own ON trades;
CREATE POLICY trades_insert_own
  ON trades FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS trades_update_own ON trades;
CREATE POLICY trades_update_own
  ON trades FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS trades_delete_own ON trades;
CREATE POLICY trades_delete_own
  ON trades FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- tags (Phase 2b)
-- =============================================================================
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tags_select_own ON tags;
CREATE POLICY tags_select_own
  ON tags FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS tags_insert_own ON tags;
CREATE POLICY tags_insert_own
  ON tags FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tags_update_own ON tags;
CREATE POLICY tags_update_own
  ON tags FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS tags_delete_own ON tags;
CREATE POLICY tags_delete_own
  ON tags FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- trade_tags (Phase 2b) — no user_id; ownership dereferenced via joined rows
-- =============================================================================
ALTER TABLE trade_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_tags_select_own ON trade_tags;
CREATE POLICY trade_tags_select_own
  ON trade_tags FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_tags.trade_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM tags   g WHERE g.id = trade_tags.tag_id   AND g.user_id = auth.uid())
  );

DROP POLICY IF EXISTS trade_tags_insert_own ON trade_tags;
CREATE POLICY trade_tags_insert_own
  ON trade_tags FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_tags.trade_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM tags   g WHERE g.id = trade_tags.tag_id   AND g.user_id = auth.uid())
  );

DROP POLICY IF EXISTS trade_tags_update_own ON trade_tags;
CREATE POLICY trade_tags_update_own
  ON trade_tags FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_tags.trade_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM tags   g WHERE g.id = trade_tags.tag_id   AND g.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_tags.trade_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM tags   g WHERE g.id = trade_tags.tag_id   AND g.user_id = auth.uid())
  );

DROP POLICY IF EXISTS trade_tags_delete_own ON trade_tags;
CREATE POLICY trade_tags_delete_own
  ON trade_tags FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_tags.trade_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM tags   g WHERE g.id = trade_tags.tag_id   AND g.user_id = auth.uid())
  );

-- =============================================================================
-- journal_entries (Phase 2c)
-- =============================================================================
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_entries_select_own ON journal_entries;
CREATE POLICY journal_entries_select_own
  ON journal_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS journal_entries_insert_own ON journal_entries;
CREATE POLICY journal_entries_insert_own
  ON journal_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS journal_entries_update_own ON journal_entries;
CREATE POLICY journal_entries_update_own
  ON journal_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS journal_entries_delete_own ON journal_entries;
CREATE POLICY journal_entries_delete_own
  ON journal_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- journal_trade_links (Phase 2c) — no user_id; ownership dereferenced
-- =============================================================================
ALTER TABLE journal_trade_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_trade_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_trade_links_select_own ON journal_trade_links;
CREATE POLICY journal_trade_links_select_own
  ON journal_trade_links FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM journal_entries je
             WHERE je.id = journal_trade_links.journal_entry_id
               AND je.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trades t
                 WHERE t.id = journal_trade_links.trade_id
                   AND t.user_id = auth.uid())
  );

DROP POLICY IF EXISTS journal_trade_links_insert_own ON journal_trade_links;
CREATE POLICY journal_trade_links_insert_own
  ON journal_trade_links FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM journal_entries je
             WHERE je.id = journal_trade_links.journal_entry_id
               AND je.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trades t
                 WHERE t.id = journal_trade_links.trade_id
                   AND t.user_id = auth.uid())
  );

DROP POLICY IF EXISTS journal_trade_links_update_own ON journal_trade_links;
CREATE POLICY journal_trade_links_update_own
  ON journal_trade_links FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM journal_entries je
             WHERE je.id = journal_trade_links.journal_entry_id
               AND je.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trades t
                 WHERE t.id = journal_trade_links.trade_id
                   AND t.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM journal_entries je
             WHERE je.id = journal_trade_links.journal_entry_id
               AND je.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trades t
                 WHERE t.id = journal_trade_links.trade_id
                   AND t.user_id = auth.uid())
  );

DROP POLICY IF EXISTS journal_trade_links_delete_own ON journal_trade_links;
CREATE POLICY journal_trade_links_delete_own
  ON journal_trade_links FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM journal_entries je
             WHERE je.id = journal_trade_links.journal_entry_id
               AND je.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM trades t
                 WHERE t.id = journal_trade_links.trade_id
                   AND t.user_id = auth.uid())
  );

-- =============================================================================
-- broker_connections (Phase 2d)
-- =============================================================================
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
