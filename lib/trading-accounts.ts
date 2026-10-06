import { db } from '@/db';
import { tradingAccounts, trades, capitalTransactions, bestTrades } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * Ensures the user has at least one trading account. If none exist,
 * creates a "Main Account" using the starting balance
 * and marks it active. Returns the active account.
 *
 * Scoped to database queries without 'use server' boundary issues.
 */
export async function ensureDefaultTradingAccount(
  userId: string,
  startingBalance: number,
  highestAchievedLevel: number,
): Promise<{ id: string; name: string; startingBalance: string; highestAchievedLevel: number } | null> {
  if (!db) return null;

  // Check if user already has any trading accounts
  const existing = await db
    .select()
    .from(tradingAccounts)
    .where(eq(tradingAccounts.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    // Find the active one
    const active = await db
      .select()
      .from(tradingAccounts)
      .where(
        and(
          eq(tradingAccounts.userId, userId),
          eq(tradingAccounts.isActive, true),
        ),
      )
      .limit(1);

    if (active.length > 0) {
      return {
        id: active[0].id,
        name: active[0].name,
        startingBalance: active[0].startingBalance,
        highestAchievedLevel: active[0].highestAchievedLevel,
      };
    }

    // No active account — activate the first one
    const first = existing[0];
    await db
      .update(tradingAccounts)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(tradingAccounts.id, first.id));

    return {
      id: first.id,
      name: first.name,
      startingBalance: first.startingBalance,
      highestAchievedLevel: first.highestAchievedLevel,
    };
  }

  // No accounts at all — create a default "Main Account"
  const [newAccount] = await db
    .insert(tradingAccounts)
    .values({
      userId,
      name: 'Main Account',
      startingBalance: String(startingBalance),
      highestAchievedLevel,
      isActive: true,
    })
    .returning();

  // Backfill existing trades
  await db
    .update(trades)
    .set({ tradingAccountId: newAccount.id })
    .where(and(eq(trades.userId, userId), isNull(trades.tradingAccountId)));

  // Backfill capital transactions
  try {
    await db
      .update(capitalTransactions)
      .set({ tradingAccountId: newAccount.id })
      .where(and(eq(capitalTransactions.userId, userId), isNull(capitalTransactions.tradingAccountId)));
  } catch {}

  // Backfill best trades
  try {
    await db
      .update(bestTrades)
      .set({ tradingAccountId: newAccount.id })
      .where(and(eq(bestTrades.userId, userId), isNull(bestTrades.tradingAccountId)));
  } catch {}

  return {
    id: newAccount.id,
    name: newAccount.name,
    startingBalance: newAccount.startingBalance,
    highestAchievedLevel: newAccount.highestAchievedLevel,
  };
}
