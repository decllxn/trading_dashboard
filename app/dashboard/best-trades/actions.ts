'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { db } from '@/db';
import { bestTrades } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { encryptText, encryptJson } from '@/lib/crypto';

export interface BestTradeFormState {
  errors?: Partial<Record<string, string>>;
  values?: any;
  formError?: string;
}

export async function createBestTrade(
  _prev: BestTradeFormState,
  formData: FormData
): Promise<BestTradeFormState> {
  if (!isSupabaseConfigured()) {
    return { formError: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { formError: 'Database client unavailable.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { formError: 'You must be signed in to log a best trade.' };
  }
  if (!db) {
    return { formError: 'Database connection not configured.' };
  }

  // Parse fields
  const instrument = String(formData.get('instrument') ?? '').trim();
  const timeFormedRaw = String(formData.get('timeFormed') ?? '').trim();
  const dailyPdArray = String(formData.get('dailyPdArray') ?? '').trim();
  const hourlyPdArray = String(formData.get('hourlyPdArray') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  const wasTaken = formData.get('wasTaken') === 'true';
  const linkedTradeId = String(formData.get('linkedTradeId') ?? '').trim() || null;
  const rMultiple = String(formData.get('rMultiple') ?? '').trim() || null;
  
  // Parse uploaded images from form
  const imagesJson = String(formData.get('images') ?? '[]');
  let images: string[] = [];
  try {
    images = JSON.parse(imagesJson);
  } catch (e) {
    console.error('Failed to parse uploaded images:', e);
  }

  // Validate fields
  const errors: Partial<Record<string, string>> = {};
  if (!instrument) {
    errors.instrument = 'Instrument ticker is required.';
  }
  if (!timeFormedRaw) {
    errors.timeFormed = 'Time formed is required.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { instrument, timeFormed: timeFormedRaw, dailyPdArray, hourlyPdArray, notes, wasTaken, linkedTradeId, rMultiple, images } };
  }

  try {
    await db.insert(bestTrades).values({
      userId: user.id,
      instrument,
      timeFormed: new Date(timeFormedRaw),
      dailyPdArray: dailyPdArray ? encryptText(dailyPdArray, user.id) : null,
      hourlyPdArray: hourlyPdArray ? encryptText(hourlyPdArray, user.id) : null,
      images: encryptJson(images, user.id),
      notes: notes ? encryptText(notes, user.id) : null,
      wasTaken,
      linkedTradeId,
      rMultiple: rMultiple ? String(Number(rMultiple)) : null,
    });

    revalidatePath('/dashboard/best-trades');
    return { values: {} };
  } catch (err: any) {
    console.error('Create best trade error:', err);
    return { formError: err.message || 'Failed to save best trade to database.' };
  }
}

export async function deleteBestTrade(id: string): Promise<{ success: boolean; error?: string }> {
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
      .delete(bestTrades)
      .where(and(eq(bestTrades.id, id), eq(bestTrades.userId, user.id)));
    
    revalidatePath('/dashboard/best-trades');
    return { success: true };
  } catch (err: any) {
    console.error('Delete best trade error:', err);
    return { success: false, error: err.message || 'Failed to delete best trade.' };
  }
}
