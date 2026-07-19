-- 0004_table_grants.sql — Phase 2 backfill
--
-- Grants base table privileges to the PostgREST API roles (anon, authenticated,
-- service_role). This was missing from 0000–0003 and is the reason trades
-- (and every other user table) returned "permission denied for table trades"
-- through the Supabase client even though RLS policies were correct.
--
-- Why this is needed:
--  * RLS policies decide WHICH ROWS a role may touch; they do NOT grant the
--    privilege to touch the table at all. The base privileges (SELECT/INSERT/
--    UPDATE/DELETE) must be granted separately.
--  * Tables created via the Supabase dashboard get these grants automatically.
--    Tables created via raw SQL as the postgres superuser (which is how
--    0000–0003 were applied) start with NO grants to the API roles, so every
--    client request failed with "permission denied" before RLS was even
--    evaluated.
--
-- Idempotent: GRANT is safe to re-run. Apply in the Supabase SQL editor as the
-- postgres role (or any role that holds GRANT OPTION on these tables).

-- =============================================================================
-- trades
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON trades TO anon, authenticated;
-- service_role bypasses RLS; it needs the same DML to run trusted server jobs.
GRANT SELECT, INSERT, UPDATE, DELETE ON trades TO service_role;

-- =============================================================================
-- tags
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO service_role;

-- =============================================================================
-- trade_tags (join table — same privileges so link/unlink works)
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON trade_tags TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON trade_tags TO service_role;

-- =============================================================================
-- journal_entries
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries TO service_role;

-- =============================================================================
-- journal_trade_links
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_trade_links TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_trade_links TO service_role;

-- =============================================================================
-- broker_connections
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON broker_connections TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON broker_connections TO service_role;

-- Grant USAGE on the enums so the API roles can reference enum values in
-- filters and inserts (e.g. asset_class eq 'equity'). Without USAGE on a type,
-- PostgREST cannot expose columns of that type.
GRANT USAGE ON TYPE asset_class            TO anon, authenticated, service_role;
GRANT USAGE ON TYPE direction              TO anon, authenticated, service_role;
GRANT USAGE ON TYPE trade_status           TO anon, authenticated, service_role;
GRANT USAGE ON TYPE trade_source           TO anon, authenticated, service_role;
GRANT USAGE ON TYPE tag_category           TO anon, authenticated, service_role;
GRANT USAGE ON TYPE broker_provider        TO anon, authenticated, service_role;
GRANT USAGE ON TYPE broker_connection_status TO anon, authenticated, service_role;
