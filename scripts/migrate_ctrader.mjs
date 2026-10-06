import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.hbkpzsqtghipvfaxyqws:BXTCC%21QfjS2R6z%3F@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(DATABASE_URL, { prepare: false });

  try {
    console.log('1. Adding ctrader to broker_provider enum...');
    await sql`
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
    `;

    console.log('2. Adding ctrader to trade_source enum...');
    await sql`
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
    `;

    console.log('3. Adding external_trade_id to trades table...');
    await sql`
      ALTER TABLE trades
        ADD COLUMN IF NOT EXISTS external_trade_id text;
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS trades_external_trade_id_idx ON trades (external_trade_id) WHERE external_trade_id IS NOT NULL;
    `;

    console.log('4. Creating ctrader_accounts table...');
    await sql`
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
    `;

    console.log('5. Enabling RLS on ctrader_accounts...');
    await sql`ALTER TABLE ctrader_accounts ENABLE ROW LEVEL SECURITY;`;
    await sql`ALTER TABLE ctrader_accounts FORCE ROW LEVEL SECURITY;`;

    await sql`DROP POLICY IF EXISTS "ctrader_accounts_select_own" ON ctrader_accounts;`;
    await sql`CREATE POLICY "ctrader_accounts_select_own" ON ctrader_accounts FOR SELECT USING (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "ctrader_accounts_insert_own" ON ctrader_accounts;`;
    await sql`CREATE POLICY "ctrader_accounts_insert_own" ON ctrader_accounts FOR INSERT WITH CHECK (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "ctrader_accounts_update_own" ON ctrader_accounts;`;
    await sql`CREATE POLICY "ctrader_accounts_update_own" ON ctrader_accounts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "ctrader_accounts_delete_own" ON ctrader_accounts;`;
    await sql`CREATE POLICY "ctrader_accounts_delete_own" ON ctrader_accounts FOR DELETE USING (user_id = auth.uid());`;

    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ctrader_accounts TO authenticated;`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ctrader_accounts TO service_role;`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ctrader_accounts TO postgres;`;

    console.log('6. Creating balance_snapshots table...');
    await sql`
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
    `;

    console.log('7. Enabling RLS on balance_snapshots...');
    await sql`ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;`;
    await sql`ALTER TABLE balance_snapshots FORCE ROW LEVEL SECURITY;`;

    await sql`DROP POLICY IF EXISTS "balance_snapshots_select_own" ON balance_snapshots;`;
    await sql`CREATE POLICY "balance_snapshots_select_own" ON balance_snapshots FOR SELECT USING (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "balance_snapshots_insert_own" ON balance_snapshots;`;
    await sql`CREATE POLICY "balance_snapshots_insert_own" ON balance_snapshots FOR INSERT WITH CHECK (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "balance_snapshots_update_own" ON balance_snapshots;`;
    await sql`CREATE POLICY "balance_snapshots_update_own" ON balance_snapshots FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "balance_snapshots_delete_own" ON balance_snapshots;`;
    await sql`CREATE POLICY "balance_snapshots_delete_own" ON balance_snapshots FOR DELETE USING (user_id = auth.uid());`;

    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON balance_snapshots TO authenticated;`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON balance_snapshots TO service_role;`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON balance_snapshots TO postgres;`;

    console.log('cTrader database migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
