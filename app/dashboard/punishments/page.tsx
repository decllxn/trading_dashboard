import React from 'react';
import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { goodHabits, punishments, punishmentTrades } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { decryptText, decryptJson } from '@/lib/crypto';
import { PunishmentsContainer } from './punishments-container';

export const dynamic = 'force-dynamic';

export default async function PunishmentsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-primary text-xl">Punishments & Discipline</h1>
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

  let goodHabitsRows: any[] = [];
  let activePunishmentRow: any = null;
  let allPunishmentTradesRows: any[] = [];
  let pastPunishmentsRows: any[] = [];

  if (db) {
    try {
      goodHabitsRows = await db
        .select()
        .from(goodHabits)
        .where(eq(goodHabits.userId, user.id))
        .orderBy(desc(goodHabits.createdAt));
    } catch (err) {
      console.warn('good_habits table query failed:', err);
    }

    try {
      const activeP = await db
        .select()
        .from(punishments)
        .where(and(eq(punishments.userId, user.id), eq(punishments.status, 'active')))
        .limit(1);
      
      activePunishmentRow = activeP[0] || null;

      allPunishmentTradesRows = await db
        .select()
        .from(punishmentTrades)
        .where(eq(punishmentTrades.userId, user.id))
        .orderBy(desc(punishmentTrades.createdAt));

      pastPunishmentsRows = await db
        .select()
        .from(punishments)
        .where(and(eq(punishments.userId, user.id), eq(punishments.status, 'completed')))
        .orderBy(desc(punishments.completedAt));
    } catch (err) {
      console.warn('punishments table query failed:', err);
    }
  }

  // Serialize models into JSON-safe objects with decryption
  const serializedGoodHabits = goodHabitsRows.map((h) => ({
    id: h.id,
    title: decryptText(h.title, user.id) || '',
    streakDays: h.streakDays,
    createdAt: h.createdAt.toISOString(),
  }));

  const serializedActivePunishment = activePunishmentRow
    ? {
        id: activePunishmentRow.id,
        reason: decryptText(activePunishmentRow.reason, user.id) || '',
        taskDescription: decryptText(activePunishmentRow.taskDescription, user.id) || '',
        targetTradeCount: activePunishmentRow.targetTradeCount,
        targetEssayWordCount: activePunishmentRow.targetEssayWordCount,
        essayText: decryptText(activePunishmentRow.essayText, user.id) || '',
        status: activePunishmentRow.status,
        createdAt: activePunishmentRow.createdAt.toISOString(),
        completedAt: activePunishmentRow.completedAt ? activePunishmentRow.completedAt.toISOString() : null,
      }
    : null;

  const serializedAllPunishmentTrades = allPunishmentTradesRows.map((t) => ({
    id: t.id,
    punishmentId: t.punishmentId,
    pair: t.pair,
    direction: t.direction,
    timeFormed: t.timeFormed.toISOString(),
    dailyPdArray: decryptText(t.dailyPdArray, user.id) || '',
    entryPdArray: decryptText(t.entryPdArray, user.id) || '',
    timeTakenToTap: decryptText(t.timeTakenToTap, user.id) || '',
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    plannedRr: t.plannedRr,
    realizedRr: t.realizedRr,
    pnl: t.pnl,
    timeInDrawdown: decryptText(t.timeInDrawdown, user.id),
    killzone: decryptText(t.killzone, user.id),
    displacementScore: t.displacementScore,
    liquiditySwept: decryptText(t.liquiditySwept, user.id),
    notes: decryptText(t.notes, user.id),
    images: (Array.isArray(decryptJson(t.images, user.id)) ? decryptJson(t.images, user.id) : []) as string[],
    createdAt: t.createdAt.toISOString(),
  }));

  const serializedPastPunishments = pastPunishmentsRows.map((p) => ({
    id: p.id,
    reason: decryptText(p.reason, user.id) || '',
    taskDescription: decryptText(p.taskDescription, user.id) || '',
    targetTradeCount: p.targetTradeCount,
    targetEssayWordCount: p.targetEssayWordCount,
    essayText: decryptText(p.essayText, user.id) || '',
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PunishmentsContainer
        goodHabitsList={serializedGoodHabits}
        activePunishment={serializedActivePunishment}
        allPunishmentTradesList={serializedAllPunishmentTrades}
        pastPunishmentsList={serializedPastPunishments}
      />
    </main>
  );
}
