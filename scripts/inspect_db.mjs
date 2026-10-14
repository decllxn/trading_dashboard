import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.hbkpzsqtghipvfaxyqws:BXTCC%21QfjS2R6z%3F@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function main() {
  const sql = postgres(DATABASE_URL, { prepare: false });
  const rows = await sql`SELECT id, instrument, direction, status, source, external_trade_id, trading_account_id, pnl, entry_time, exit_time FROM trades ORDER BY created_at DESC`;
  console.log('Total trades in database:', rows.length);
  for (const r of rows) {
    console.log(`${r.id.slice(0, 8)} | ${r.instrument} | ${r.direction} | ${r.status} | ${r.external_trade_id} | acct: ${r.trading_account_id} | pnl: ${r.pnl}`);
  }

  const accts = await sql`SELECT id, ctid_trader_account_id, broker_title, balance, equity FROM ctrader_accounts`;
  console.log('\ncTrader Accounts in database:', accts.length);
  for (const a of accts) {
    console.log(a);
  }

  const conns = await sql`SELECT id, provider, broker_name, status FROM broker_connections`;
  console.log('\nBroker connections in database:', conns.length);
  for (const c of conns) {
    console.log(c);
  }

  await sql`UPDATE trading_accounts SET starting_balance = '53.46' WHERE id = '8e3c1486-d5fc-4b83-baa4-3e853cd9e11f'`;
  console.log('Calibrated starting balance for MrVisionary to 53.46');

  const tradingAccts = await sql`SELECT id, name, starting_balance, highest_achieved_level, is_active FROM trading_accounts`;
  console.log('\nTrading Accounts in database:', tradingAccts.length);
  for (const ta of tradingAccts) {
    console.log(ta);
  }

  await sql.end();
}

main().catch(console.error);
