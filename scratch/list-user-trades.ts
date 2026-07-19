import { db } from '../db/index.ts';
import { trades } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  if (!db) {
    console.error('Database is not configured.');
    return;
  }

  const userId = 'f89e95e0-b2fc-48c9-bfd0-3578b0e8eb26';
  try {
    const userTrades = await db.select({
      id: trades.id,
      instrument: trades.instrument,
      status: trades.status,
      pnl: trades.pnl,
      exitPrice: trades.exitPrice,
      exitTime: trades.exitTime,
    }).from(trades).where(eq(trades.userId, userId));
    
    console.log('Trades for user:', JSON.stringify(userTrades, null, 2));
  } catch (err: any) {
    console.error('Error fetching user trades:', err.message);
  }
}

main();
