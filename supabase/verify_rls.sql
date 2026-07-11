-- verify_rls.sql — deterministic Phase 2a RLS proof.
--
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste →
-- Run) AFTER applying supabase/migrations/0000_trades.sql. Fully self-contained
-- and idempotent: safe to re-run any number of times.
--
-- What it proves (the Phase 2a Definition of Done #2):
--   A second authenticated user CANNOT see the first user's trades.
--
-- How: creates two throwaway auth.users (fixed UUIDs so re-runs are
-- deterministic), inserts ONE trade owned by the first user, then switches into
-- each user's identity (SET ROLE authenticated + request.jwt.claims sub, which
-- is exactly what Supabase's auth.uid() reads) and counts visible rows. Owner
-- must see 1; the other user must see 0. Test data is pre-cleaned at the start
-- AND deleted at the end, so a prior failed run leaves no residue.
--
-- Expected Messages output:
--   owner visible:    1  (expected 1)
--   intruder visible: 0  (expected 0)
--   PASS: owner sees their own row
--   PASS: intruder sees none of the owner's rows
--   RESULT: ALL CHECKS PASSED

-- Fixed identities — deterministic across runs, never real user UUIDs.
-- Declared as constants so each block references them by name.
DO $$
DECLARE
  owner_uid    constant uuid := '11111111-1111-1111-1111-111111111111';
  intruder_uid constant uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- 0. Pre-clean residue from a prior run (idempotent).
  DELETE FROM trades  WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users WHERE id   IN (owner_uid, intruder_uid);

  -- 1. Seed two throwaway auth.users + ONE trade owned by "owner".
  --    Done as the editor's superuser role, which bypasses RLS.
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', owner_uid,
     'authenticated', 'authenticated',
     'rls-owner@example.test',
     crypt('pw', gen_salt('bf')), now()),
    ('00000000-0000-0000-0000-000000000000', intruder_uid,
     'authenticated', 'authenticated',
     'rls-intruder@example.test',
     crypt('pw', gen_salt('bf')), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO trades (user_id, instrument, asset_class, direction, status, source)
  VALUES (owner_uid, 'AAPL', 'equity', 'long', 'open', 'manual');

  -- Stash counts in a temp table set under each identity.
  CREATE TEMP TABLE IF NOT EXISTS _rls_result (probe text, visible integer) ON COMMIT DROP;
  DELETE FROM _rls_result;

  -- 2a. As owner — should see exactly 1 row (their own).
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', owner_uid, 'role', 'authenticated')::text, false);
  INSERT INTO _rls_result SELECT 'owner', count(*)::integer FROM trades;

  -- 2b. As intruder — should see 0 rows (the only row belongs to owner).
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', intruder_uid, 'role', 'authenticated')::text, false);
  INSERT INTO _rls_result SELECT 'intruder', count(*)::integer FROM trades;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);

  -- 3. Summary.
  DECLARE
    owner_n    integer := (SELECT visible FROM _rls_result WHERE probe = 'owner');
    intruder_n integer := (SELECT visible FROM _rls_result WHERE probe = 'intruder');
    pass       boolean := true;
  BEGIN
    RAISE NOTICE '--- Phase 2a RLS verification ---';
    RAISE NOTICE 'owner visible:    %  (expected 1)', owner_n;
    RAISE NOTICE 'intruder visible: %  (expected 0)', intruder_n;

    IF owner_n = 1 THEN
      RAISE NOTICE 'PASS: owner sees their own row';
    ELSE
      RAISE NOTICE 'FAIL: owner should see exactly 1 row, saw %', owner_n;
      pass := false;
    END IF;

    IF intruder_n = 0 THEN
      RAISE NOTICE 'PASS: intruder sees none of the owner''s rows';
    ELSE
      RAISE NOTICE 'FAIL: intruder must not see another user''s rows, saw %', intruder_n;
      pass := false;
    END IF;

    RAISE NOTICE 'RESULT: %', CASE WHEN pass THEN 'ALL CHECKS PASSED' ELSE 'RLS BROKEN' END;
  END;

  -- 4. Cleanup — remove test rows so the DB is left pristine.
  DELETE FROM trades  WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users WHERE id IN (owner_uid, intruder_uid);
  DROP TABLE _rls_result;
END $$;
