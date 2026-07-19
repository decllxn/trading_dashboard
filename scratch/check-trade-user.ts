import { db } from '../db/index.ts';
import { trades } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  if (!db) {
    console.error('Database is not configured.');
    return;
  }

  const tradeId = '8e462904-be0a-4d86-8196-d8fd7dfc1257';
  try {
    const trade = await db.select({ userId: trades.userId }).from(trades).where(eq(trades.id, tradeId)).limit(1);
    console.log('Trade userId:', trade[0]?.userId);
  } catch (err: any) {
    console.error('Error fetching trade userId:', err.message);
  }
}

main();
