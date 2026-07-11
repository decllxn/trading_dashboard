-- verify_tags_rls.sql — deterministic Phase 2b proof.
--
-- Run in the Supabase SQL editor AFTER applying 0001_tags.sql. Self-contained
-- and idempotent (pre-cleans and post-cleans its own test data). Proves the
-- three Phase 2b requirements:
--   1. Seeding: inserting an auth.users row fires the trigger and plants the
--      default tag set (12 rows, exact names/categories).
--   2. User scope: an authenticated user sees ONLY their own tags.
--   3. Join isolation: a user cannot reference another user's tag via
--      trade_tags (the insert WITH CHECK rejects it).
--
-- Uses fixed UUIDs + SET ROLE authenticated + request.jwt.claims sub (the same
-- identity-simulation technique as verify_rls.sql). All three checks feed one
-- running `pass` flag printed at the end.

DO $$
DECLARE
  owner_uid      constant uuid := '33333333-3333-3333-3333-333333333333';
  intruder_uid   constant uuid := '44444444-4444-4444-4444-444444444444';
  seed_count     integer;
  intruder_n     integer;
  intruder_trade uuid;
  owner_tag      uuid;
  join_blocked   boolean := false;
  pass           boolean := true;
BEGIN
  -- 0. Pre-clean any residue from a prior run.
  DELETE FROM trade_tags WHERE tag_id IN (SELECT id FROM tags WHERE user_id IN (owner_uid, intruder_uid));
  DELETE FROM tags       WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM trades     WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users WHERE id      IN (owner_uid, intruder_uid);

  -- 1. Seed check — inserting auth.users rows should fire the trigger and plant
  --    12 default tags for EACH user. Done as superuser (RLS bypass).
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', owner_uid,
     'authenticated', 'authenticated',
     'tags-owner@example.test',
     crypt('pw', gen_salt('bf')), now()),
    ('00000000-0000-0000-0000-000000000000', intruder_uid,
     'authenticated', 'authenticated',
     'tags-intruder@example.test',
     crypt('pw', gen_salt('bf')), now())
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO seed_count FROM tags WHERE user_id = owner_uid;
  RAISE NOTICE '--- Phase 2b tags verification ---';
  RAISE NOTICE 'seeded tags for new user: %  (expected 12)', seed_count;
  IF seed_count = 12 THEN
    RAISE NOTICE 'PASS: default tag set seeded on signup';
  ELSE
    RAISE NOTICE 'FAIL: expected 12 default tags, got %', seed_count;
    pass := false;
  END IF;

  -- Spot-check two exact (name, category) entries from the canonical set.
  IF EXISTS (
    SELECT 1 FROM tags
     WHERE user_id = owner_uid AND name = 'Order Block' AND category = 'ict_concept'
  ) AND EXISTS (
    SELECT 1 FROM tags
     WHERE user_id = owner_uid AND name = 'Revenge Trade' AND category = 'emotion'
  ) THEN
    RAISE NOTICE 'PASS: seeded rows match canonical names/categories';
  ELSE
    RAISE NOTICE 'FAIL: seeded rows do not match canonical set';
    pass := false;
  END IF;

  -- 2. RLS scope — as intruder, count visible tags. The intruder was also
  --    seeded 12 tags, so the only correct count is 12 (not 24). This proves
  --    the owner's rows are invisible.
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', intruder_uid, 'role', 'authenticated')::text, false);

  SELECT count(*) INTO intruder_n FROM tags;
  IF intruder_n = 12 THEN
    RAISE NOTICE 'PASS: intruder sees only their own tags (12, not 24)';
  ELSE
    RAISE NOTICE 'FAIL: intruder sees % tags, expected 12 (own only)', intruder_n;
    pass := false;
  END IF;

  -- 3. Join isolation — as intruder: insert own trade (allowed), then attempt
  --    to link it to one of OWNER's tags. Must be rejected by the
  --    trade_tags_insert_own WITH CHECK.
  INSERT INTO trades (user_id, instrument, asset_class, direction)
    VALUES (intruder_uid, 'ES1!', 'futures', 'long')
    RETURNING id INTO intruder_trade;

  -- Look up an owner-owned tag. The intruder can't see it under RLS, so we
  -- grab the id while still superuser, then re-enter the intruder identity.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);
  SELECT id INTO owner_tag FROM tags WHERE user_id = owner_uid LIMIT 1;

  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', intruder_uid, 'role', 'authenticated')::text, false);

  BEGIN
    INSERT INTO trade_tags (trade_id, tag_id) VALUES (intruder_trade, owner_tag);
  EXCEPTION
    WHEN check_violation OR insufficient_privilege OR foreign_key_violation OR others THEN
      join_blocked := true;
  END;

  IF join_blocked THEN
    RAISE NOTICE 'PASS: cannot link own trade to another user''s tag';
  ELSE
    RAISE NOTICE 'FAIL: trade_tags allowed a cross-user tag link';
    pass := false;
  END IF;

  RAISE NOTICE 'RESULT: %', CASE WHEN pass THEN 'ALL CHECKS PASSED' ELSE 'TAGS RLS BROKEN' END;

  -- 4. Cleanup.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);
  DELETE FROM trade_tags WHERE tag_id IN (SELECT id FROM tags WHERE user_id IN (owner_uid, intruder_uid));
  DELETE FROM tags       WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM trades     WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users WHERE id      IN (owner_uid, intruder_uid);
END $$;
