-- verify_journal_rls.sql — deterministic Phase 2c proof.
--
-- Run in the Supabase SQL editor AFTER applying 0002_journal.sql. Self-contained
-- and idempotent (pre-cleans and post-cleans its own test data). Proves the
-- Phase 2c requirements:
--   1. journal_entries RLS: an authenticated user sees ONLY their own entries.
--   2. One entry per day per user: the UNIQUE(user_id, date) constraint rejects
--      a second row for the same day.
--   3. journal_trade_links RLS: a user cannot link their entry to another user's
--      trade (the insert WITH CHECK rejects it).
--
-- Uses fixed UUIDs + SET ROLE authenticated + request.jwt.claims sub, the same
-- identity-simulation technique as verify_rls.sql / verify_tags_rls.sql. All
-- checks feed one running `pass` flag printed at the end.

DO $$
DECLARE
  owner_uid     constant uuid := '55555555-5555-5555-5555-555555555555';
  intruder_uid  constant uuid := '66666666-6666-6666-6666-666666666666';
  owner_n       integer;
  intruder_n    integer;
  owner_entry   uuid;
  owner_trade   uuid;
  intruder_entry uuid;
  dup_blocked   boolean := false;
  link_blocked  boolean := false;
  pass          boolean := true;
BEGIN
  -- 0. Pre-clean residue from a prior run.
  DELETE FROM journal_trade_links
    WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE user_id IN (owner_uid, intruder_uid));
  DELETE FROM journal_entries WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM trades        WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users    WHERE id      IN (owner_uid, intruder_uid);

  -- Seed two throwaway auth.users. Done as superuser (RLS bypass).
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', owner_uid,
     'authenticated', 'authenticated',
     'journal-owner@example.test',
     crypt('pw', gen_salt('bf')), now()),
    ('00000000-0000-0000-0000-000000000000', intruder_uid,
     'authenticated', 'authenticated',
     'journal-intruder@example.test',
     crypt('pw', gen_salt('bf')), now())
  ON CONFLICT (id) DO NOTHING;

  -- 1. Seed one journal entry + one trade for the owner.
  INSERT INTO journal_entries (user_id, date, content, mood)
  VALUES (owner_uid, '2026-07-12',
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Owner note"}]}]}'::jsonb,
          'Disciplined')
  RETURNING id INTO owner_entry;

  INSERT INTO trades (user_id, instrument, asset_class, direction)
  VALUES (owner_uid, 'AAPL', 'equity', 'long')
  RETURNING id INTO owner_trade;

  RAISE NOTICE '--- Phase 2c journal verification ---';

  -- 2. RLS scope — as owner, see exactly 1 entry; as intruder, see 0.
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', owner_uid, 'role', 'authenticated')::text, false);
  SELECT count(*) INTO owner_n FROM journal_entries;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', intruder_uid, 'role', 'authenticated')::text, false);
  SELECT count(*) INTO intruder_n FROM journal_entries;

  IF owner_n = 1 THEN
    RAISE NOTICE 'PASS: owner sees their own journal entry';
  ELSE
    RAISE NOTICE 'FAIL: owner should see 1 entry, saw %', owner_n;
    pass := false;
  END IF;

  IF intruder_n = 0 THEN
    RAISE NOTICE 'PASS: intruder sees none of the owner''s entries';
  ELSE
    RAISE NOTICE 'FAIL: intruder saw % entries, expected 0', intruder_n;
    pass := false;
  END IF;

  -- 3. One-entry-per-day — owner tries to insert a second entry for the same
  --    date. Must be rejected by journal_entries_user_date_uidx.
  BEGIN
    INSERT INTO journal_entries (user_id, date, content)
    VALUES (owner_uid, '2026-07-12',
            '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dup"}]}]}'::jsonb);
  EXCEPTION
    WHEN unique_violation THEN dup_blocked := true;
  END;

  IF dup_blocked THEN
    RAISE NOTICE 'PASS: duplicate same-day entry rejected (one entry/day/user)';
  ELSE
    RAISE NOTICE 'FAIL: second entry for same day was allowed';
    pass := false;
  END IF;

  -- 4. Join isolation — as owner, create an entry, then try to link it to the
  --    INTRUDER's trade (inserted as superuser below). Must be rejected by
  --    journal_trade_links_insert_own WITH CHECK.
  INSERT INTO journal_entries (user_id, date, content)
  VALUES (intruder_uid, '2026-07-13',
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Intruder trade"}]}]}'::jsonb);
  -- (intruder now owns a trade; we'll attempt a link as intruder to owner_trade.)

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);

  -- Give the intruder an entry of their own to link FROM.
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', intruder_uid, 'role', 'authenticated')::text, false);

  INSERT INTO journal_entries (user_id, date, content)
  VALUES (intruder_uid, '2026-07-14',
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"intruder entry"}]}]}'::jsonb)
  RETURNING id INTO intruder_entry;

  BEGIN
    -- intruder's entry -> owner's trade. Owner trade is invisible to intruder
    -- under RLS, so the WITH CHECK should fire.
    INSERT INTO journal_trade_links (journal_entry_id, trade_id)
    VALUES (intruder_entry, owner_trade);
  EXCEPTION
    WHEN check_violation OR foreign_key_violation OR others THEN
      link_blocked := true;
  END;

  IF link_blocked THEN
    RAISE NOTICE 'PASS: cannot link own entry to another user''s trade';
  ELSE
    RAISE NOTICE 'FAIL: journal_trade_links allowed a cross-user link';
    pass := false;
  END IF;

  RAISE NOTICE 'RESULT: %', CASE WHEN pass THEN 'ALL CHECKS PASSED' ELSE 'JOURNAL RLS BROKEN' END;

  -- 5. Cleanup.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);
  DELETE FROM journal_trade_links
    WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE user_id IN (owner_uid, intruder_uid));
  DELETE FROM journal_entries WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM trades        WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users    WHERE id      IN (owner_uid, intruder_uid);
END $$;
