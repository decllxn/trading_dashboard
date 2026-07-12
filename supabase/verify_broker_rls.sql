-- verify_broker_rls.sql — deterministic Phase 2d proof.
--
-- Run in the Supabase SQL editor AFTER applying 0003_broker_connections.sql.
-- Self-contained and idempotent. The Phase 2d "done when" is "migration runs
-- clean"; this script additionally confirms RLS is correctly user-scoped, so a
-- misconfiguration surfaces now rather than mid-Phase-8.
--
-- Proves:
--   1. An authenticated user sees ONLY their own broker_connections rows.
--   2. trades.broker_connection_id now resolves to broker_connections(id)
--      (the forward FK from 0000_trades.sql is wired).
--   3. ON DELETE SET NULL semantics: deleting a connection nulls the trade's
--      reference instead of deleting the trade.
--
-- Same identity-simulation technique as the prior verify_*.sql scripts.

DO $$
DECLARE
  owner_uid      constant uuid := '77777777-7777-7777-7777-777777777777';
  intruder_uid   constant uuid := '88888888-8888-8888-8888-888888888888';
  owner_conn     uuid;
  intruder_conn  uuid;
  owner_trade    uuid;
  owner_n        integer;
  intruder_n     integer;
  trade_link_ref uuid;
  pass           boolean := true;
BEGIN
  -- 0. Pre-clean residue from a prior run.
  UPDATE trades SET broker_connection_id = NULL
    WHERE broker_connection_id IN (SELECT id FROM broker_connections WHERE user_id IN (owner_uid, intruder_uid));
  DELETE FROM broker_connections WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM trades            WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users        WHERE id      IN (owner_uid, intruder_uid);

  -- Seed two throwaway auth.users.
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', owner_uid,
     'authenticated', 'authenticated',
     'broker-owner@example.test',
     crypt('pw', gen_salt('bf')), now()),
    ('00000000-0000-0000-0000-000000000000', intruder_uid,
     'authenticated', 'authenticated',
     'broker-intruder@example.test',
     crypt('pw', gen_salt('bf')), now())
  ON CONFLICT (id) DO NOTHING;

  -- Seed one connection each (as superuser).
  INSERT INTO broker_connections (user_id, provider, broker_name, status)
  VALUES (owner_uid, 'snaptrade', 'Alpaca', 'active')
  RETURNING id INTO owner_conn;

  INSERT INTO broker_connections (user_id, provider, broker_name, status)
  VALUES (intruder_uid, 'manual', 'Interactive Brokers', 'active')
  RETURNING id INTO intruder_conn;

  -- Seed a trade owned by owner that references the owner's connection.
  INSERT INTO trades (user_id, instrument, asset_class, direction, broker_connection_id)
  VALUES (owner_uid, 'AAPL', 'equity', 'long', owner_conn)
  RETURNING id INTO owner_trade;

  RAISE NOTICE '--- Phase 2d broker_connections verification ---';

  -- 1. RLS scope — owner sees 1 connection, intruder sees 0 of owner's.
  SET ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', owner_uid, 'role', 'authenticated')::text, false);
  SELECT count(*) INTO owner_n FROM broker_connections;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', intruder_uid, 'role', 'authenticated')::text, false);
  SELECT count(*) INTO intruder_n FROM broker_connections;

  IF owner_n = 1 THEN
    RAISE NOTICE 'PASS: owner sees their own broker connection';
  ELSE
    RAISE NOTICE 'FAIL: owner should see 1 connection, saw %', owner_n;
    pass := false;
  END IF;

  IF intruder_n = 1 THEN
    RAISE NOTICE 'PASS: intruder sees only their own connection (not owner''s)';
  ELSE
    RAISE NOTICE 'FAIL: intruder saw % connections, expected 1 (own only)', intruder_n;
    pass := false;
  END IF;

  -- 2 & 3. FK wired + ON DELETE SET NULL — delete the owner's connection and
  --    confirm the trade survives with a nulled reference. Done as superuser.
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);

  DELETE FROM broker_connections WHERE id = owner_conn;

  SELECT broker_connection_id INTO trade_link_ref
    FROM trades WHERE id = owner_trade;

  IF trade_link_ref IS NULL THEN
    RAISE NOTICE 'PASS: deleting connection nulled trade.broker_connection_id (trade preserved)';
  ELSE
    RAISE NOTICE 'FAIL: trade.broker_connection_id should be NULL after connection delete';
    pass := false;
  END IF;

  RAISE NOTICE 'RESULT: %', CASE WHEN pass THEN 'ALL CHECKS PASSED' ELSE 'BROKER RLS BROKEN' END;

  -- 4. Cleanup.
  UPDATE trades SET broker_connection_id = NULL
    WHERE broker_connection_id IN (SELECT id FROM broker_connections WHERE user_id IN (owner_uid, intruder_uid));
  DELETE FROM broker_connections WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM trades            WHERE user_id IN (owner_uid, intruder_uid);
  DELETE FROM auth.users        WHERE id      IN (owner_uid, intruder_uid);
END $$;
