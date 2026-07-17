import { db } from '../db/index.ts';
import { trades } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  if (!db) {
    console.error('Database is not configured.');
    return;
  }

  const tradeId = '8e462904-be0a-4d86-8196-d8fd7dfc1257';
  console.log(`Setting status to 'closed' for trade ID: ${tradeId}...`);
  try {
    const result = await db.update(trades)
      .set({ status: 'closed' })
      .where(eq(trades.id, tradeId))
      .returning();
      
    console.log('Update result:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('Error updating trade status:', err.message);
  }
}

main();
