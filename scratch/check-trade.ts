import { db } from '../db/index.ts';
import { trades } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  if (!db) {
    console.error('Database is not configured.');
    return;
  }

  const tradeId = '8e462904-be0a-4d86-8196-d8fd7dfc1257';
  console.log(`Fetching trade with id ${tradeId}...`);
  try {
    const trade = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
    console.log('Trade found:', JSON.stringify(trade, null, 2));
  } catch (err: any) {
    console.error('Error fetching trade:', err.message);
  }
}

main();
