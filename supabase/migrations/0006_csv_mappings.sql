-- 0006_csv_mappings.sql — Phase 4b
--
-- Creates `csv_mappings`: one saved column-mapping per (user, broker_name).
-- The CSV import flow (4a preview + 4b mapping) lets a user teach the system
-- how each broker's export columns map onto the `trades` fields; this table
-- persists that mapping so re-imports from the same broker auto-apply it.
--
-- Why a table (not localStorage):
--  * Multi-device / multi-session: a mapping saved on desktop must apply on
--    mobile. localStorage is per-browser.
--  * Tenant boundary: `user_id` + RLS makes a mapping private to its owner,
--    consistent with every other user-scoped table in the schema.
--
-- Idempotent: every statement guards on IF NOT EXISTS / DROP IF EXISTS.
-- Apply AFTER 0000–0005. Matches db/schema.ts.

-- =============================================================================
-- Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS csv_mappings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Free text the user types to label the source ("Interactive Brokers",
  -- "Alpaca", "TradingView"). uniqueness is (user_id, broker_name) so a
  -- re-import updates the saved mapping in place rather than stacking rows.
  broker_name  text        NOT NULL,
  -- { tradesField: sourceColumnHeader }. Keyed by header STRING (not column
  -- index) so a saved mapping survives column reordering/relabeling between
  -- re-exports. Resolution against a new file happens in app code.
  mapping      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One mapping per (user, broker). ON CONFLICT (user_id, broker_name) DO UPDATE
-- is how re-importing the same broker refreshes the saved mapping.
CREATE UNIQUE INDEX IF NOT EXISTS csv_mappings_user_broker_uidx
  ON csv_mappings (user_id, broker_name);

-- Query pattern: "list this user's saved broker mappings" (for autocomplete).
CREATE INDEX IF NOT EXISTS csv_mappings_user_id_idx
  ON csv_mappings (user_id);

ALTER TABLE csv_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_mappings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS csv_mappings_select_own ON csv_mappings;
CREATE POLICY csv_mappings_select_own
  ON csv_mappings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS csv_mappings_insert_own ON csv_mappings;
CREATE POLICY csv_mappings_insert_own
  ON csv_mappings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS csv_mappings_update_own ON csv_mappings;
CREATE POLICY csv_mappings_update_own
  ON csv_mappings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS csv_mappings_delete_own ON csv_mappings;
CREATE POLICY csv_mappings_delete_own
  ON csv_mappings FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- Grants
-- =============================================================================
-- Base table privileges for the PostgREST API roles (mirrors 0004). Without
-- these, the client gets "permission denied" before RLS is even evaluated.
GRANT SELECT, INSERT, UPDATE, DELETE ON csv_mappings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON csv_mappings TO service_role;

-- updated_at touch trigger: every INSERT/UPDATE refreshes updated_at so the
-- "last used" signal is accurate. Idempotent function + trigger.
CREATE OR REPLACE FUNCTION csv_mappings_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS csv_mappings_touch_updated_at ON csv_mappings;
CREATE TRIGGER csv_mappings_touch_updated_at
  BEFORE INSERT OR UPDATE ON csv_mappings
  FOR EACH ROW
  EXECUTE FUNCTION csv_mappings_touch_updated_at();

ANALYZE csv_mappings;
