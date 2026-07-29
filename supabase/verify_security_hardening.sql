-- verify_security_hardening.sql
--
-- Run this in the Supabase SQL editor after applying 0012_security_hardening.sql
-- to verify all tables have RLS enabled, policies are in place, and grants are
-- correct. Every query should return the expected results documented inline.
--
-- This script is READ-ONLY; it does not modify any data.

-- =============================================================================
-- 1. Verify RLS is ENABLED on every public table
-- =============================================================================
-- Expected: ALL tables should show relrowsecurity = true AND relforcerowsecurity = true
-- If any row shows false, RLS is NOT enabled on that table.

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'  -- ordinary tables only
  AND c.relname IN (
    'trades',
    'tags',
    'trade_tags',
    'journal_entries',
    'journal_trade_links',
    'broker_connections',
    'csv_mappings',
    'snaptrade_users',
    'market_data_cache',
    'user_settings',
    'copilot_sessions',
    'copilot_messages',
    'best_trades',
    'simulations'
  )
ORDER BY c.relname;

-- =============================================================================
-- 2. Count RLS policies per table
-- =============================================================================
-- Expected:
--   trades:              4 (select/insert/update/delete)
--   tags:                4
--   trade_tags:          4
--   journal_entries:     4
--   journal_trade_links: 4
--   broker_connections:  4
--   csv_mappings:        4
--   snaptrade_users:     0 (intentionally no client policies)
--   market_data_cache:   1 (select only)
--   user_settings:       4
--   copilot_sessions:    4
--   copilot_messages:    4
--   best_trades:         4
--   simulations:         4

SELECT
  schemaname,
  tablename,
  count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- =============================================================================
-- 3. List all policies with their details
-- =============================================================================
-- Verify each policy targets the correct role and has the correct USING/CHECK.

SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- =============================================================================
-- 4. Verify anon has NO DML grants on user-scoped tables
-- =============================================================================
-- Expected: NO rows should appear for anon on user-scoped tables.
-- If rows appear, anon still has privileges that should be revoked.

SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND table_name IN (
    'trades',
    'tags',
    'trade_tags',
    'journal_entries',
    'journal_trade_links',
    'broker_connections',
    'csv_mappings',
    'market_data_cache'
  )
ORDER BY table_name, privilege_type;

-- =============================================================================
-- 5. Verify authenticated has correct grants on new tables
-- =============================================================================
-- Expected: 4 rows per table (SELECT, INSERT, UPDATE, DELETE) for 'authenticated'.

SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name IN (
    'user_settings',
    'copilot_sessions',
    'copilot_messages',
    'best_trades',
    'simulations'
  )
ORDER BY table_name, privilege_type;

-- =============================================================================
-- 6. Verify storage policies for trade-screenshots bucket
-- =============================================================================
-- Expected: 4 policies (select_authenticated, insert_own, update_own, delete_own)
-- None should reference 'public' or have USING(true) for INSERT.

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'trade_screenshots%'
ORDER BY policyname;

-- =============================================================================
-- 7. Verify market_data_cache has NO write grants for authenticated
-- =============================================================================
-- Expected: only SELECT for authenticated. No INSERT, UPDATE, DELETE.

SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee = 'authenticated'
  AND table_name = 'market_data_cache'
ORDER BY privilege_type;
