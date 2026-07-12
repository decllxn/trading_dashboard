-- 0002_journal.sql — Phase 2c
--
-- Creates `journal_entries` + `journal_trade_links`, enables user-scoped RLS on
-- both, and indexes the day/calendar lookup path. Idempotent: safe to re-run in
-- the Supabase SQL editor. Apply AFTER 0000_trades.sql and 0001_tags.sql.
-- Matches db/schema.ts.
--
-- Design notes:
--  * `date` is a bare DATE (not timestamptz) — the journal is day-granular, one
--    entry per day. A UNIQUE(user_id, date) constraint enforces "one entry per
--    day per user" at the DB layer so races can't create duplicates.
--  * `content` is JSONB storing a Tiptap document. Phase 7a will define a
--    concrete TS type for it; here it is schemaless JSON.
--  * `mood` is free text for now. Phase 7c links it to the emotion tags seeded
--    in 0001_tags.sql.
--  * journal_trade_links has no user_id of its own — its RLS policies
--    dereference ownership through the joined entry and trade rows (same pattern
--    as trade_tags in 0001_tags.sql).

-- =============================================================================
-- journal_entries
-- =============================================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date         NOT NULL,
  content     jsonb,
  mood        text,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- One entry per day per user. Creates the unique constraint as a defensive
-- guard against concurrent inserts from two clients at once.
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_user_date_uidx
  ON journal_entries (user_id, date);

-- Tenant + the calendar-view default sort (most-recent day first).
CREATE INDEX IF NOT EXISTS journal_entries_user_date_idx
  ON journal_entries (user_id, date DESC);

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
-- journal_trade_links (join table)
-- =============================================================================
-- No user_id column: ownership is dereferenced through the joined entry and
-- trade rows. Both FKs CASCADE, so deleting an entry or a trade removes the
-- link automatically (modeled in db/schema.ts).

CREATE TABLE IF NOT EXISTS journal_trade_links (
  journal_entry_id  uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  trade_id          uuid NOT NULL REFERENCES trades(id)          ON DELETE CASCADE,
  PRIMARY KEY (journal_entry_id, trade_id)
);

CREATE INDEX IF NOT EXISTS journal_trade_links_trade_id_idx
  ON journal_trade_links (trade_id);
-- (journal_entry_id leading column is covered by the composite PK's index.)

ALTER TABLE journal_trade_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_trade_links FORCE ROW LEVEL SECURITY;

-- A user may link/unlink only pairs of (entry, trade) they BOTH own. USING
-- governs visible/editable rows; WITH CHECK governs inserts/updates.
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

ANALYZE journal_entries;
ANALYZE journal_trade_links;
