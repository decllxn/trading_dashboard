import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { trades } from '../db/schema.ts';
import { computeRMultiple } from '../lib/trades.ts';

async function main() {
  if (!db) {
    console.error('Database is not configured.');
    return;
  }

  console.log('Fetching all trades...');
  try {
    const allTrades = await db.select().from(trades);
    console.log(`Found ${allTrades.length} trades. Recalculating R-multiples...`);

    let updatedCount = 0;
    for (const t of allTrades) {
      // Calculate R-multiple based strictly on exit price
      const entryPrice = t.entryPrice ? Number(t.entryPrice) : null;
      const stopPrice = t.stopPrice ? Number(t.stopPrice) : null;
      const exitPrice = t.exitPrice ? Number(t.exitPrice) : null;
      
      const newR = computeRMultiple(entryPrice, stopPrice, exitPrice, t.direction);
      const newRStr = newR !== null ? newR.toFixed(4) : null;
      
      // Only update if it actually changed
      const currentRStr = t.rMultiple ? Number(t.rMultiple).toFixed(4) : null;
      if (newRStr !== currentRStr) {
        await db.update(trades)
          .set({ rMultiple: newRStr })
          .where(eq(trades.id, t.id));
        updatedCount++;
      }
    }

    console.log(`Done! Updated R-multiple for ${updatedCount} trades.`);
  } catch (err: any) {
    console.error('Error fixing R-multiples:', err.message);
  }
}

main();
