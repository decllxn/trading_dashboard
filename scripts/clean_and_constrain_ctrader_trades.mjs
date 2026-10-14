import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.hbkpzsqtghipvfaxyqws:BXTCC%21QfjS2R6z%3F@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(DATABASE_URL, { prepare: false });

  try {
    console.log('1. Identifying duplicate trades by (user_id, external_trade_id)...');
    
    // Find duplicates and remove all but the earliest created row for each (user_id, external_trade_id)
    const deleted = await sql`
      WITH ranked_trades AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, external_trade_id 
                 ORDER BY created_at ASC, id ASC
               ) as rn
        FROM trades
        WHERE external_trade_id IS NOT NULL
      )
      DELETE FROM trades
      WHERE id IN (
        SELECT id FROM ranked_trades WHERE rn > 1
      )
      RETURNING id, external_trade_id;
    `;

    console.log(`Removed ${deleted.length} duplicate trade rows.`);

    console.log('2. Backfilling missing entry_time for closed trades from exit_time...');
    const backfilled = await sql`
      UPDATE trades
      SET entry_time = exit_time
      WHERE entry_time IS NULL AND exit_time IS NOT NULL AND source = 'ctrader'
      RETURNING id;
    `;
    console.log(`Backfilled entry_time for ${backfilled.length} trades.`);

    console.log('3. Creating partial unique index trades_user_external_trade_id_uidx...');
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS trades_user_external_trade_id_uidx 
      ON trades (user_id, external_trade_id) 
      WHERE external_trade_id IS NOT NULL;
    `;
    console.log('Unique index created successfully.');

    // Count remaining trades
    const [{ count }] = await sql`
      SELECT count(*)::int FROM trades WHERE external_trade_id IS NOT NULL;
    `;
    console.log(`Remaining cTrader trades count: ${count}`);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
