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

  // Query settings for starting balance
  const settingsRow = await db
    .select({ startingBalance: userSettings.startingBalance })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1)
    .then((rows) => rows[0]);

  const startingBalance = settingsRow?.startingBalance
    ? Number(settingsRow.startingBalance)
    : STARTING_BALANCE_DEFAULT;

  // Fetch user trades
  const tradesRows = await db
    .select({
      id: trades.id,
      pnl: trades.pnl,
      commission: trades.commission,
      swap: trades.swap,
      fees: trades.fees,
      status: trades.status,
    })
    .from(trades)
    .where(eq(trades.userId, user.id));

  // Compute closed net PNL
  let totalClosedNetPnl = 0;
  for (const t of tradesRows) {
    if (t.status === 'closed') {
      const gross = t.pnl ? Number(t.pnl) : 0;
      const commission = t.commission ? Number(t.commission) : 0;
      const swap = t.swap ? Number(t.swap) : 0;
      const fees = t.fees ? Number(t.fees) : 0;
      const netPnl = computeNetPnl(gross, commission, swap, fees);
      if (netPnl !== null) {
        totalClosedNetPnl += netPnl;
      }
    }
  }

  const currentBalance = startingBalance + totalClosedNetPnl;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 bg-base text-primary min-h-screen">
      <GamificationContainer 
        currentBalance={currentBalance} 
        startingBalance={startingBalance} 
        totalClosedNetPnl={totalClosedNetPnl}
      />
    </main>
  );
}
