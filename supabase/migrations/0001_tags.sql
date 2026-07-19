-- 0001_tags.sql — Phase 2b
--
-- Creates `tags` + `trade_tags`, enables user-scoped RLS on both, and installs
-- a trigger that seeds every new account with the default tag set on signup.
-- Idempotent: safe to re-run in the Supabase SQL editor. Apply AFTER 0000_trades.sql.
-- Matches db/schema.ts and db/seed-tags.ts.
--
-- Design notes:
--  * Seed-on-signup is a Postgres trigger on auth.users, NOT app code. This
--    fires identically for email/password, OAuth, and admin-created users, and
--    works whether email confirmation is ON (Supabase inserts the auth.users
--    row immediately) or OFF. The signUp server action has no DB session in
--    the email-confirm-on path, so it could not seed reliably.
--  * The seed function is SECURITY DEFINER so it can write to tags despite
--    running from the auth trigger context; it only ever inserts rows owned by
--    NEW.id, so there is no privilege-escalation surface.
--  * RLS on tags uses the same auth.uid() pattern as trades. trade_tags has no
--    user_id of its own — its policies dereference through the joined trade/tag
--    rows so a user can only link trades and tags they both own.

-- =============================================================================
-- Enum
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE tag_category AS ENUM ('setup', 'ict_concept', 'session', 'emotion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- tags
-- =============================================================================

CREATE TABLE IF NOT EXISTS tags (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text         NOT NULL,
  category    tag_category NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- One (name, category) per user — prevents duplicate seed entries on a
-- theoretical re-trigger and enforces uniqueness in user-created tags.
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_category_uidx
  ON tags (user_id, name, category);

-- Tenant + category filter (the trade form groups the tag picker by category).
CREATE INDEX IF NOT EXISTS tags_user_id_idx
  ON tags (user_id);
CREATE INDEX IF NOT EXISTS tags_user_category_idx
  ON tags (user_id, category);

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
-- trade_tags (join table)
-- =============================================================================
-- No user_id column of its own: ownership is dereferenced through the joined
-- trade and tag rows. Both FKs CASCADE, so deleting a trade or a tag removes
-- the join row automatically (modeled in db/schema.ts).

CREATE TABLE IF NOT EXISTS trade_tags (
  trade_id  uuid NOT NULL REFERENCES trades(id)  ON DELETE CASCADE,
  tag_id    uuid NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  PRIMARY KEY (trade_id, tag_id)
);

CREATE INDEX IF NOT EXISTS trade_tags_tag_id_idx
  ON trade_tags (tag_id);
-- (trade_id leading column is covered by the composite PK's implicit index.)

ALTER TABLE trade_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_tags FORCE ROW LEVEL SECURITY;

-- A user may link/unlink only pairs of (trade, tag) they BOTH own. USING
-- governs which existing rows are visible/editable; WITH CHECK governs inserts.
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
-- Seed: default tags on signup
-- =============================================================================
-- A SECURITY DEFINER function + AFTER INSERT trigger on auth.users. Runs as the
-- function owner (postgres), bypassing RLS, but only ever inserts rows for
-- NEW.id — no cross-user writes are possible. The default set mirrors
-- db/seed-tags.ts exactly.

CREATE OR REPLACE FUNCTION public.seed_default_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tags (user_id, name, category)
  VALUES
    (NEW.id, 'Order Block',      'ict_concept'),
    (NEW.id, 'FVG',              'ict_concept'),
    (NEW.id, 'Liquidity Sweep',  'ict_concept'),
    (NEW.id, 'Breaker',          'ict_concept'),
    (NEW.id, 'Mitigation Block', 'ict_concept'),
    (NEW.id, 'London',           'session'),
    (NEW.id, 'New York',         'session'),
    (NEW.id, 'Asia',             'session'),
    (NEW.id, 'Disciplined',      'emotion'),
    (NEW.id, 'FOMO',             'emotion'),
    (NEW.id, 'Revenge Trade',    'emotion'),
    (NEW.id, 'Hesitant',         'emotion')
  ON CONFLICT (user_id, name, category) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Guard the trigger create/drop so this migration is re-runnable.
DROP TRIGGER IF EXISTS on_auth_user_created_seed_tags ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_tags
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_tags();

ANALYZE tags;
ANALYZE trade_tags;
