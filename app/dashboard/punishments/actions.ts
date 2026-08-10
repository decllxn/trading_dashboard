'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { goodHabits, punishments, punishmentTrades } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export interface ActionResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

// -----------------------------------------------------------------------------
// GOOD HABITS ACTIONS
// -----------------------------------------------------------------------------

export async function createGoodHabit(title: string): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  const trimmed = title.trim();
  if (!trimmed) return { success: false, error: 'Habit title cannot be empty.' };

  try {
    const [newHabit] = await db
      .insert(goodHabits)
      .values({
        userId: user.id,
        title: trimmed,
        streakDays: 1,
      })
      .returning();

    revalidatePath('/dashboard/punishments');
    return { success: true, data: newHabit };
  } catch (err: any) {
    console.error('Create good habit error:', err);
    return { success: false, error: err.message || 'Failed to create habit.' };
  }
}

export async function incrementHabitStreak(id: string): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  try {
    const [existing] = await db
      .select()
      .from(goodHabits)
      .where(and(eq(goodHabits.id, id), eq(goodHabits.userId, user.id)))
      .limit(1);

    if (!existing) return { success: false, error: 'Habit not found.' };

    await db
      .update(goodHabits)
      .set({ streakDays: existing.streakDays + 1 })
      .where(and(eq(goodHabits.id, id), eq(goodHabits.userId, user.id)));

    revalidatePath('/dashboard/punishments');
    return { success: true };
  } catch (err: any) {
    console.error('Increment habit streak error:', err);
    return { success: false, error: err.message || 'Failed to update habit streak.' };
  }
}

export async function deleteGoodHabit(id: string): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  try {
    await db
      .delete(goodHabits)
      .where(and(eq(goodHabits.id, id), eq(goodHabits.userId, user.id)));

    revalidatePath('/dashboard/punishments');
    return { success: true };
  } catch (err: any) {
    console.error('Delete good habit error:', err);
    return { success: false, error: err.message || 'Failed to delete habit.' };
  }
}

// -----------------------------------------------------------------------------
// PUNISHMENT SESSION ACTIONS
// -----------------------------------------------------------------------------

export async function startPunishment(formData: FormData): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  const reason = String(formData.get('reason') ?? '').trim();
  const taskDescription = String(formData.get('taskDescription') ?? '').trim();
  const targetTradeCount = parseInt(String(formData.get('targetTradeCount') ?? '30'), 10);
  const targetEssayWordCount = parseInt(String(formData.get('targetEssayWordCount') ?? '3000'), 10);

  if (!reason) return { success: false, error: 'Punishment reason is required.' };
  if (!taskDescription) return { success: false, error: 'Task description is required.' };

  try {
    // Check if there is already an active punishment
    const activeList = await db
      .select()
      .from(punishments)
      .where(and(eq(punishments.userId, user.id), eq(punishments.status, 'active')))
      .limit(1);

    if (activeList.length > 0) {
      return { success: false, error: 'You already have an active punishment session in progress.' };
    }

    const [newPunishment] = await db
      .insert(punishments)
      .values({
        userId: user.id,
        reason,
        taskDescription,
        targetTradeCount: isNaN(targetTradeCount) || targetTradeCount < 1 ? 30 : targetTradeCount,
        targetEssayWordCount: isNaN(targetEssayWordCount) || targetEssayWordCount < 100 ? 3000 : targetEssayWordCount,
        status: 'active',
      })
      .returning();

    revalidatePath('/dashboard/punishments');
    return { success: true, data: newPunishment };
  } catch (err: any) {
    console.error('Start punishment error:', err);
    return { success: false, error: err.message || 'Failed to initiate punishment.' };
  }
}

export async function saveEssayText(punishmentId: string, essayText: string): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  try {
    await db
      .update(punishments)
      .set({ essayText })
      .where(and(eq(punishments.id, punishmentId), eq(punishments.userId, user.id)));

    revalidatePath('/dashboard/punishments');
    return { success: true };
  } catch (err: any) {
    console.error('Save essay text error:', err);
    return { success: false, error: err.message || 'Failed to save essay.' };
  }
}

export async function completePunishment(punishmentId: string): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  try {
    await db
      .update(punishments)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(and(eq(punishments.id, punishmentId), eq(punishments.userId, user.id)));

    revalidatePath('/dashboard/punishments');
    return { success: true };
  } catch (err: any) {
    console.error('Complete punishment error:', err);
    return { success: false, error: err.message || 'Failed to mark punishment as completed.' };
  }
}

export async function reactivatePunishment(punishmentId: string): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  try {
    // Set any currently active punishment for this user to completed first
    await db
      .update(punishments)
      .set({ status: 'completed' })
      .where(and(eq(punishments.userId, user.id), eq(punishments.status, 'active')));

    // Set target punishment as active
    await db
      .update(punishments)
      .set({
        status: 'active',
        completedAt: null,
      })
      .where(and(eq(punishments.id, punishmentId), eq(punishments.userId, user.id)));

    revalidatePath('/dashboard/punishments');
    return { success: true };
  } catch (err: any) {
    console.error('Reactivate punishment error:', err);
    return { success: false, error: err.message || 'Failed to reactivate punishment session.' };
  }
}

// -----------------------------------------------------------------------------
// PUNISHMENT TRADES ACTIONS
// -----------------------------------------------------------------------------

export async function logPunishmentTrade(formData: FormData): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  const punishmentId = String(formData.get('punishmentId') ?? '').trim();
  const pair = String(formData.get('pair') ?? '').trim().toUpperCase();
  const direction = String(formData.get('direction') ?? 'long').trim() as 'long' | 'short';
  const timeFormedRaw = String(formData.get('timeFormed') ?? '').trim();
  const dailyPdArray = String(formData.get('dailyPdArray') ?? '').trim();
  const entryPdArray = String(formData.get('entryPdArray') ?? '').trim();
  const timeTakenToTap = String(formData.get('timeTakenToTap') ?? '').trim();
  
  const entryPriceRaw = String(formData.get('entryPrice') ?? '').trim();
  const stopLossRaw = String(formData.get('stopLoss') ?? '').trim();
  const takeProfitRaw = String(formData.get('takeProfit') ?? '').trim();
  const plannedRrRaw = String(formData.get('plannedRr') ?? '').trim();
  const realizedRrRaw = String(formData.get('realizedRr') ?? '').trim();
  const pnlRaw = String(formData.get('pnl') ?? '').trim();
  const timeInDrawdown = String(formData.get('timeInDrawdown') ?? '').trim();
  const killzone = String(formData.get('killzone') ?? '').trim();
  const displacementScoreRaw = String(formData.get('displacementScore') ?? '').trim();
  const liquiditySwept = String(formData.get('liquiditySwept') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();

  const imagesJson = String(formData.get('images') ?? '[]');
  let images: string[] = [];
  try {
    images = JSON.parse(imagesJson);
  } catch (e) {
    console.error('Failed to parse uploaded images:', e);
  }

  if (!punishmentId) return { success: false, error: 'Active punishment session ID missing.' };
  if (!pair) return { success: false, error: 'Pair / Instrument is required (e.g. GBPCAD, EURCAD).' };
  if (!timeFormedRaw) return { success: false, error: 'Time formed timestamp is required.' };
  if (!dailyPdArray) return { success: false, error: 'Daily PD array strategy detail is required.' };
  if (!entryPdArray) return { success: false, error: '1H/30m Entry PD array detail is required.' };
  if (!timeTakenToTap) return { success: false, error: 'Candles / Time taken to tap entry array is required.' };

  try {
    await db.insert(punishmentTrades).values({
      punishmentId,
      userId: user.id,
      pair,
      direction,
      timeFormed: new Date(timeFormedRaw),
      dailyPdArray,
      entryPdArray,
      timeTakenToTap,
      entryPrice: entryPriceRaw ? String(Number(entryPriceRaw)) : null,
      stopLoss: stopLossRaw ? String(Number(stopLossRaw)) : null,
      takeProfit: takeProfitRaw ? String(Number(takeProfitRaw)) : null,
      plannedRr: plannedRrRaw ? String(Number(plannedRrRaw)) : null,
      realizedRr: realizedRrRaw ? String(Number(realizedRrRaw)) : null,
      pnl: pnlRaw ? String(Number(pnlRaw)) : null,
      timeInDrawdown: timeInDrawdown || null,
      killzone: killzone || null,
      displacementScore: displacementScoreRaw ? parseInt(displacementScoreRaw, 10) : null,
      liquiditySwept: liquiditySwept || null,
      notes: notes || null,
      images,
    });

    revalidatePath('/dashboard/punishments');
    return { success: true };
  } catch (err: any) {
    console.error('Log punishment trade error:', err);
    return { success: false, error: err.message || 'Failed to log punishment trade.' };
  }
}

export async function deletePunishmentTrade(id: string): Promise<ActionResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Database unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized.' };
  if (!db) return { success: false, error: 'Database connection unavailable.' };

  try {
    await db
      .delete(punishmentTrades)
      .where(and(eq(punishmentTrades.id, id), eq(punishmentTrades.userId, user.id)));

    revalidatePath('/dashboard/punishments');
    return { success: true };
  } catch (err: any) {
    console.error('Delete punishment trade error:', err);
    return { success: false, error: err.message || 'Failed to delete trade log.' };
  }
}
