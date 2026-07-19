'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { simulations } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export interface SaveSimulationInput {
  name: string;
  numSimulations: number;
  numTrades: number;
  riskPerTrade: number;
  ruinThreshold: number;
  mcResult: any;
  sizingResult: any;
}

export async function saveSimulation(input: SaveSimulationInput) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { success: false, error: 'Database client unavailable.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'You must be signed in to save simulations.' };
  }
  if (!db) {
    return { success: false, error: 'Database connection not configured.' };
  }

  try {
    await db.insert(simulations).values({
      userId: user.id,
      name: input.name.trim() || `Simulation ${new Date().toLocaleDateString()}`,
      numSimulations: input.numSimulations,
      numTrades: input.numTrades,
      riskPerTrade: String(input.riskPerTrade),
      ruinThreshold: String(input.ruinThreshold),
      mcResult: input.mcResult,
      sizingResult: input.sizingResult,
    });

    revalidatePath('/dashboard/simulations');
    return { success: true };
  } catch (err: any) {
    console.error('Save simulation error:', err);
    return { success: false, error: err.message || 'Failed to save simulation.' };
  }
}

export async function deleteSimulation(id: string) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { success: false, error: 'Database client unavailable.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized.' };
  }
  if (!db) {
    return { success: false, error: 'Database connection not configured.' };
  }

  try {
    await db
      .delete(simulations)
      .where(and(eq(simulations.id, id), eq(simulations.userId, user.id)));

    revalidatePath('/dashboard/simulations');
    return { success: true };
  } catch (err: any) {
    console.error('Delete simulation error:', err);
    return { success: false, error: err.message || 'Failed to delete simulation.' };
  }
}
