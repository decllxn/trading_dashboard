-- Migration: Multi-account support
-- Adds trading_accounts table, trading_account_id FK to trades,
-- capital_transactions, and best_trades.

-- 1. Create the trading_accounts table
CREATE TABLE IF NOT EXISTS trading_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  starting_balance numeric(20,8) NOT NULL DEFAULT 150,
  highest_achieved_level integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_accounts FORCE ROW LEVEL SECURITY;

-- 3. RLS policies for trading_accounts
CREATE POLICY "trading_accounts_select_own"
  ON trading_accounts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "trading_accounts_insert_own"
  ON trading_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trading_accounts_update_own"
  ON trading_accounts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trading_accounts_delete_own"
  ON trading_accounts FOR DELETE
  USING (user_id = auth.uid());

-- 4. Grant access to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON trading_accounts TO authenticated;

-- 5. Add trading_account_id column to trades
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS trading_account_id uuid
  REFERENCES trading_accounts(id) ON DELETE SET NULL;

-- 6. Add trading_account_id column to capital_transactions
ALTER TABLE capital_transactions
  ADD COLUMN IF NOT EXISTS trading_account_id uuid
  REFERENCES trading_accounts(id) ON DELETE SET NULL;

-- 7. Add trading_account_id column to best_trades
ALTER TABLE best_trades
  ADD COLUMN IF NOT EXISTS trading_account_id uuid
  REFERENCES trading_accounts(id) ON DELETE SET NULL;

-- 8. Backfill: For each user who has trades but no trading account,
--    create a default "Main Account" and assign all existing data to it.
--    This uses a DO block so it's atomic and idempotent.
DO $$
DECLARE
  u RECORD;
  acct_id uuid;
  sb numeric;
BEGIN
  -- Find users who have trades but no trading accounts yet
  FOR u IN
    SELECT DISTINCT t.user_id
    FROM trades t
    LEFT JOIN trading_accounts ta ON ta.user_id = t.user_id
    WHERE ta.id IS NULL
  LOOP
    -- Look up their starting balance from user_settings (if set)
    SELECT COALESCE(us.starting_balance, 150)
      INTO sb
      FROM user_settings us
      WHERE us.user_id = u.user_id;
    IF sb IS NULL THEN sb := 150; END IF;

    -- Look up their highest achieved level
    INSERT INTO trading_accounts (user_id, name, starting_balance, highest_achieved_level, is_active)
    VALUES (
      u.user_id,
      'Main Account',
      sb,
      COALESCE((SELECT us2.highest_achieved_level FROM user_settings us2 WHERE us2.user_id = u.user_id), 0),
      true
    )
    RETURNING id INTO acct_id;

    -- Backfill all existing trades for this user
    UPDATE trades SET trading_account_id = acct_id WHERE user_id = u.user_id AND trading_account_id IS NULL;

    -- Backfill capital transactions
    UPDATE capital_transactions SET trading_account_id = acct_id WHERE user_id = u.user_id AND trading_account_id IS NULL;

    -- Backfill best trades
    UPDATE best_trades SET trading_account_id = acct_id WHERE user_id = u.user_id AND trading_account_id IS NULL;
  END LOOP;
END $$;
