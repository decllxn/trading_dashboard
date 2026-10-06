-- 0018_ctrader_integration.sql
-- cTrader Open API integration tables, enums, and external_trade_id column

-- 1. Extend broker_provider enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'broker_provider' AND e.enumlabel = 'ctrader'
  ) THEN
    ALTER TYPE broker_provider ADD VALUE 'ctrader';
  END IF;
END $$;

-- 2. Extend trade_source enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'trade_source' AND e.enumlabel = 'ctrader'
  ) THEN
    ALTER TYPE trade_source ADD VALUE 'ctrader';
  END IF;
END $$;

-- 3. Add external_trade_id to trades table
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS external_trade_id text;

CREATE INDEX IF NOT EXISTS trades_external_trade_id_idx ON trades (external_trade_id) WHERE external_trade_id IS NOT NULL;

-- 4. Create ctrader_accounts table
CREATE TABLE IF NOT EXISTS ctrader_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_connection_id uuid REFERENCES broker_connections(id) ON DELETE SET NULL,
  trading_account_id uuid REFERENCES trading_accounts(id) ON DELETE SET NULL,
  ctid_trader_account_id text NOT NULL,
  account_number text,
  broker_title text NOT NULL DEFAULT 'Pepperstone',
  is_live boolean NOT NULL DEFAULT true,
  currency text NOT NULL DEFAULT 'USD',
  balance numeric(20, 8),
  equity numeric(20, 8),
  free_margin numeric(20, 8),
  margin numeric(20, 8),
  leverage_in_cents integer,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ctrader_accounts_user_ctid_uidx UNIQUE (user_id, ctid_trader_account_id)
);

ALTER TABLE ctrader_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrader_accounts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctrader_accounts_select_own" ON ctrader_accounts;
CREATE POLICY "ctrader_accounts_select_own" ON ctrader_accounts FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ctrader_accounts_insert_own" ON ctrader_accounts;
CREATE POLICY "ctrader_accounts_insert_own" ON ctrader_accounts FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ctrader_accounts_update_own" ON ctrader_accounts;
CREATE POLICY "ctrader_accounts_update_own" ON ctrader_accounts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ctrader_accounts_delete_own" ON ctrader_accounts;
CREATE POLICY "ctrader_accounts_delete_own" ON ctrader_accounts FOR DELETE USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrader_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrader_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrader_accounts TO postgres;

-- 5. Create balance_snapshots table
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trading_account_id uuid REFERENCES trading_accounts(id) ON DELETE SET NULL,
  ctrader_account_id uuid REFERENCES ctrader_accounts(id) ON DELETE CASCADE,
  balance numeric(20, 8) NOT NULL,
  equity numeric(20, 8) NOT NULL,
  margin numeric(20, 8),
  free_margin numeric(20, 8),
  unrealized_pnl numeric(20, 8),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "balance_snapshots_select_own" ON balance_snapshots;
CREATE POLICY "balance_snapshots_select_own" ON balance_snapshots FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "balance_snapshots_insert_own" ON balance_snapshots;
CREATE POLICY "balance_snapshots_insert_own" ON balance_snapshots FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "balance_snapshots_update_own" ON balance_snapshots;
CREATE POLICY "balance_snapshots_update_own" ON balance_snapshots FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "balance_snapshots_delete_own" ON balance_snapshots;
CREATE POLICY "balance_snapshots_delete_own" ON balance_snapshots FOR DELETE USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON balance_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON balance_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON balance_snapshots TO postgres;
