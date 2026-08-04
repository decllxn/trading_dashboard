import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { trades, userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { computeNetPnl, STARTING_BALANCE_DEFAULT } from '@/lib/stats';
import { GamificationContainer } from './gamification-container';

export const dynamic = 'force-dynamic';

export default async function GamificationPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 bg-base min-h-screen text-primary">
        <h1 className="font-display text-primary text-xl">Rank Progression</h1>
        <p className="text-secondary mt-2 text-sm">
          Supabase is not configured. Add credentials to{' '}
          <code className="num text-accent-signal">.env.local</code>.
        </p>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!db) redirect('/login');

  // Query settings for starting balance & highest achieved level
  const settingsRow = await db
    .select({
      startingBalance: userSettings.startingBalance,
      highestAchievedLevel: userSettings.highestAchievedLevel,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  const startingBalance = settingsRow?.startingBalance
    ? Number(settingsRow.startingBalance)
    : STARTING_BALANCE_DEFAULT;

  const storedHighestLevel = settingsRow?.highestAchievedLevel ?? 0;

  // Fetch capital transactions for net cashflow
  const { capitalTransactions } = await import('@/db/schema');
  const { computeNetCapitalCashflow } = await import('@/lib/stats');
  let txRows: any[] = [];
  try {
    txRows = await db
      .select({
        id: capitalTransactions.id,
        type: capitalTransactions.type,
        amount: capitalTransactions.amount,
        date: capitalTransactions.date,
      })
      .from(capitalTransactions)
      .where(eq(capitalTransactions.userId, user.id));
  } catch (e) {
    // optional table fallback
  }
  const statTx = txRows.map((t) => ({
    id: t.id,
    type: t.type,
    amount: Number(t.amount),
    date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
  }));
  const netCashflow = computeNetCapitalCashflow(statTx);

  // Fetch user trades
  const tradesRows = await db
    .select({
      id: trades.id,
      pnl: trades.pnl,
      commission: trades.commission,
      swap: trades.swap,
      fees: trades.fees,
      status: trades.status,
      entryTime: trades.entryTime,
      exitTime: trades.exitTime,
    })
    .from(trades)
    .where(eq(trades.userId, user.id));

  const { accountEquitySeries } = await import('@/lib/stats');
  const statTrades = tradesRows.map((t) => ({
    pnl: computeNetPnl(
      t.pnl ? Number(t.pnl) : null,
      t.commission ? Number(t.commission) : null,
      t.swap ? Number(t.swap) : null,
      t.fees ? Number(t.fees) : null,
    ),
    status: t.status,
    entryTime: t.entryTime ? new Date(t.entryTime).toISOString() : null,
    exitTime: t.exitTime ? new Date(t.exitTime).toISOString() : null,
  }));

  let totalClosedNetPnl = 0;
  for (const st of statTrades) {
    if (st.status === 'closed' && st.pnl != null) {
      totalClosedNetPnl += st.pnl;
    }
  }

  const currentBalance = startingBalance + netCashflow + totalClosedNetPnl;
  const eqPoints = accountEquitySeries(statTrades, startingBalance, statTx);

  // Compute peak level from historical equity points
  const { resolveActiveLevel, computePeakLevelFromEquity } = await import('@/lib/levels');
  const historicalPeakLevel = computePeakLevelFromEquity(eqPoints, startingBalance);
  const highestAchieved = Math.max(storedHighestLevel, historicalPeakLevel);

  const levelRes = resolveActiveLevel(currentBalance, highestAchieved);
  let effectiveHighestLevel = Math.max(highestAchieved, levelRes.activeLevelIdx);

  if (effectiveHighestLevel > storedHighestLevel) {
    try {
      await db
        .insert(userSettings)
        .values({
          userId: user.id,
          highestAchievedLevel: effectiveHighestLevel,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: {
            highestAchievedLevel: effectiveHighestLevel,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.warn('Failed to update highestAchievedLevel:', err);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 bg-base text-primary min-h-screen">
      <GamificationContainer 
        currentBalance={currentBalance} 
        startingBalance={startingBalance} 
        totalClosedNetPnl={totalClosedNetPnl}
        highestAchievedLevel={effectiveHighestLevel}
      />
    </main>
  );
}
