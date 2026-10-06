import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.hbkpzsqtghipvfaxyqws:BXTCC%21QfjS2R6z%3F@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(DATABASE_URL, { prepare: false });

  try {
    console.log('1. Creating trading_accounts table...');
    await sql`
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
    `;

    console.log('2. Enabling RLS...');
    await sql`ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;`;
    await sql`ALTER TABLE trading_accounts FORCE ROW LEVEL SECURITY;`;

    console.log('3. Creating RLS policies...');
    await sql`DROP POLICY IF EXISTS "trading_accounts_select_own" ON trading_accounts;`;
    await sql`CREATE POLICY "trading_accounts_select_own" ON trading_accounts FOR SELECT USING (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "trading_accounts_insert_own" ON trading_accounts;`;
    await sql`CREATE POLICY "trading_accounts_insert_own" ON trading_accounts FOR INSERT WITH CHECK (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "trading_accounts_update_own" ON trading_accounts;`;
    await sql`CREATE POLICY "trading_accounts_update_own" ON trading_accounts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());`;

    await sql`DROP POLICY IF EXISTS "trading_accounts_delete_own" ON trading_accounts;`;
    await sql`CREATE POLICY "trading_accounts_delete_own" ON trading_accounts FOR DELETE USING (user_id = auth.uid());`;

    console.log('4. Granting table permissions...');
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON trading_accounts TO authenticated;`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON trading_accounts TO service_role;`;
    await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON trading_accounts TO postgres;`;

    console.log('5. Adding columns to existing tables...');
    await sql`
      ALTER TABLE trades
        ADD COLUMN IF NOT EXISTS trading_account_id uuid
        REFERENCES trading_accounts(id) ON DELETE SET NULL;
    `;

    await sql`
      ALTER TABLE capital_transactions
        ADD COLUMN IF NOT EXISTS trading_account_id uuid
        REFERENCES trading_accounts(id) ON DELETE SET NULL;
    `;

    await sql`
      ALTER TABLE best_trades
        ADD COLUMN IF NOT EXISTS trading_account_id uuid
        REFERENCES trading_accounts(id) ON DELETE SET NULL;
    `;

    console.log('6. Backfilling existing users into default Main Account...');
    await sql`
      DO $$
      DECLARE
        u RECORD;
        acct_id uuid;
        sb numeric;
        hl integer;
      BEGIN
        FOR u IN
          SELECT DISTINCT id AS user_id FROM auth.users
        LOOP
          -- Check if account already exists
          IF NOT EXISTS (SELECT 1 FROM trading_accounts WHERE user_id = u.user_id) THEN
            SELECT COALESCE(starting_balance, 150)
              INTO sb
              FROM user_settings
              WHERE user_id = u.user_id;
            IF sb IS NULL THEN sb := 150; END IF;

            SELECT COALESCE(highest_achieved_level, 0)
              INTO hl
              FROM user_settings
              WHERE user_id = u.user_id;
            IF hl IS NULL THEN hl := 0; END IF;

            INSERT INTO trading_accounts (user_id, name, starting_balance, highest_achieved_level, is_active)
            VALUES (u.user_id, 'Main Account', sb, hl, true)
            RETURNING id INTO acct_id;

            -- Backfill existing trades for this user
            UPDATE trades SET trading_account_id = acct_id WHERE user_id = u.user_id AND trading_account_id IS NULL;

            -- Backfill capital transactions
            UPDATE capital_transactions SET trading_account_id = acct_id WHERE user_id = u.user_id AND trading_account_id IS NULL;

            -- Backfill best trades
            UPDATE best_trades SET trading_account_id = acct_id WHERE user_id = u.user_id AND trading_account_id IS NULL;
          END IF;
        END LOOP;
      END $$;
    `;

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
