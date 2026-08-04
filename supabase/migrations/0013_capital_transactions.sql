-- 0013_capital_transactions.sql — Deposit & Withdrawal Tracking
--
-- Creates `capital_transactions` table to record user cash flows (deposits/withdrawals).
-- Enables Row Level Security (RLS) with policies restricting access to the owning user.

DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS capital_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         transaction_type NOT NULL,
  amount       numeric(20, 8) NOT NULL,
  date         timestamptz NOT NULL DEFAULT now(),
  broker_name  text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capital_transactions_user_id_idx
  ON capital_transactions (user_id);

CREATE INDEX IF NOT EXISTS capital_transactions_date_idx
  ON capital_transactions (date);

ALTER TABLE capital_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capital_transactions_select_own ON capital_transactions;
CREATE POLICY capital_transactions_select_own
  ON capital_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS capital_transactions_insert_own ON capital_transactions;
CREATE POLICY capital_transactions_insert_own
  ON capital_transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS capital_transactions_update_own ON capital_transactions;
CREATE POLICY capital_transactions_update_own
  ON capital_transactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS capital_transactions_delete_own ON capital_transactions;
CREATE POLICY capital_transactions_delete_own
  ON capital_transactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON capital_transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON capital_transactions TO service_role;

ANALYZE capital_transactions;
