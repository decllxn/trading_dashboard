import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { bestTrades, trades } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { decryptText, decryptJson } from '@/lib/crypto';
import { BestTradesContainer } from './best-trades-container';

export const dynamic = 'force-dynamic';

export default async function BestTradesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-primary text-xl">Best Trades of the Week</h1>
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

  // Query logged best trades
  const bestTradesRows = await db
    .select()
    .from(bestTrades)
    .where(eq(bestTrades.userId, user.id))
    .orderBy(desc(bestTrades.timeFormed));

  // Query trades list for selection dropdown
  const tradesRows = await db
    .select({
      id: trades.id,
      instrument: trades.instrument,
      entryTime: trades.entryTime,
      pnl: trades.pnl,
      rMultiple: trades.rMultiple,
    })
    .from(trades)
    .where(eq(trades.userId, user.id))
    .orderBy(desc(trades.entryTime));

  // Serialize models into stable JSON structures for client components with decryption
  const serializedBestTrades = bestTradesRows.map((t) => ({
    id: t.id,
    instrument: t.instrument,
    timeFormed: t.timeFormed.toISOString(),
    dailyPdArray: decryptText(t.dailyPdArray, user.id),
    hourlyPdArray: decryptText(t.hourlyPdArray, user.id),
    images: (Array.isArray(decryptJson(t.images, user.id)) ? decryptJson(t.images, user.id) : []) as string[],
    notes: decryptText(t.notes, user.id),
    wasTaken: t.wasTaken,
    linkedTradeId: t.linkedTradeId,
    rMultiple: t.rMultiple,
    createdAt: t.createdAt.toISOString(),
  }));

  const serializedTrades = tradesRows.map((t) => ({
    id: t.id,
    instrument: t.instrument,
    entryTime: t.entryTime ? t.entryTime.toISOString() : null,
    pnl: t.pnl,
    rMultiple: t.rMultiple,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <BestTradesContainer 
        bestTradesList={serializedBestTrades}
        tradesList={serializedTrades}
      />
    </main>
  );
}
