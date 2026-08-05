'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createConnectionPortalUrl, ensureSnaptradeUser } from '@/lib/snaptrade';
import { createServerClient } from '@/lib/supabase';
import { db } from '@/db';
import { brokerConnections, trades } from '@/db/schema';
import { computeRMultiple } from '@/lib/trades';
import { revalidatePath } from 'next/cache';
import { eq, and, isNull } from 'drizzle-orm';

function callbackUrl(): string {
  const configuredOrigin = process.env.APP_URL;
  const requestOrigin = headers().get('origin');
  const origin = configuredOrigin ?? requestOrigin;

  if (!origin) {
    throw new Error('Set APP_URL to launch the broker connection portal.');
  }

  const url = new URL(origin);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTP or HTTPS.');
  }

  return new URL('/api/snaptrade/callback', url).toString();
}

export async function connectBroker(): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) {
    redirect('/dashboard/settings?broker=unavailable');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let portalUrl: string;
  try {
    const credentials = await ensureSnaptradeUser(user.id);
    portalUrl = await createConnectionPortalUrl(credentials, callbackUrl());
  } catch {
    redirect('/dashboard/settings?broker=unavailable');
  }

  redirect(portalUrl);
}

export interface StartingBalanceState {
  error?: string;
  success?: boolean;
}

/**
 * Upsert the user's starting capital into user_settings. The dashboard equity
 * curve reads this as its baseline (starting capital + cumulative P&L). A
 * non-finite or negative value is rejected; empty input reverts to the app
 * default by clearing the stored value.
 */
export async function saveStartingBalance(
  _prev: StartingBalanceState,
  formData: FormData,
): Promise<StartingBalanceState> {
  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const raw = (formData.get('startingBalance') as string | null)?.trim() ?? '';

  // Empty input = use the app default (store null so future default changes
  // propagate).
  let storedValue: number | null;
  if (raw === '') {
    storedValue = null;
  } else {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: 'Enter a valid non-negative amount.' };
    }
    storedValue = parsed;
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: user.id,
        starting_balance: storedValue === null ? null : String(storedValue),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export interface BreakevenThresholdState {
  error?: string;
  success?: boolean;
}

/**
 * Upsert the user's break even threshold into user_settings. Trades with
 * |P&L| <= threshold are categorized as Break Even. Empty input reverts to the
 * app default ($5.00).
 */
export async function saveBreakevenThreshold(
  _prev: BreakevenThresholdState,
  formData: FormData,
): Promise<BreakevenThresholdState> {
  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const raw = (formData.get('breakevenThreshold') as string | null)?.trim() ?? '';

  let storedValue: number | null;
  if (raw === '') {
    storedValue = null;
  } else {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: 'Enter a valid non-negative amount.' };
    }
    storedValue = parsed;
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: user.id,
        breakeven_threshold: storedValue === null ? null : String(storedValue),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/trades');

  return { success: true };
}

export async function connectMt5Broker(
  brokerName: string,
  accountRef: string,
  serverName: string,
): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  if (!db) throw new Error('Database not configured');

  const externalAccountId = `MT5-${accountRef}`;

  // Insert broker connection without seeding mock trades
  const [conn] = await db
    .insert(brokerConnections)
    .values({
      userId: user.id,
      provider: 'manual',
      externalAccountId,
      brokerName: `${brokerName} (${serverName})`,
      status: 'active',
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        brokerConnections.userId,
        brokerConnections.provider,
        brokerConnections.externalAccountId,
      ],
      set: {
        brokerName: `${brokerName} (${serverName})`,
        status: 'active',
        lastSyncedAt: new Date(),
      }
    })
    .returning();

  if (conn) {
    // Link all existing trades for this user that don't have a brokerConnectionId
    await db
      .update(trades)
      .set({ brokerConnectionId: conn.id })
      .where(and(eq(trades.userId, user.id), isNull(trades.brokerConnectionId)));
  }

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
}

export async function purgeTradeDetails(): Promise<{ success: boolean; count?: number; error?: string }> {
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  if (!db) return { success: false, error: 'Database not configured' };

  try {
    const updated = await db
      .update(trades)
      .set({
        entryPrice: null,
        exitPrice: null,
        stopPrice: null,
        targetPrice: null,
        size: null,
        pnl: null,
        commission: null,
        swap: null,
        fees: null,
        rMultiple: null,
      })
      .where(eq(trades.userId, user.id))
      .returning();

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/trades');
    return { success: true, count: updated.length };
  } catch (err: any) {
    console.error('Purge error:', err);
    return { success: false, error: err.message || 'Failed to purge trade details' };
  }
}

export async function saveJournalPinAction(
  pin: string,
  currentPin?: string
): Promise<{ success: boolean; error?: string }> {
  const { hashPin, verifyPin } = await import('@/lib/pin');
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!/^\d{4}$/.test(pin)) {
    return { success: false, error: 'PIN must be exactly 4 digits.' };
  }

  const { data: existingSettings } = await supabase
    .from('user_settings')
    .select('journal_pin')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingSettings?.journal_pin) {
    if (!currentPin || !verifyPin(currentPin, existingSettings.journal_pin, user.id)) {
      return { success: false, error: 'Incorrect current PIN.' };
    }
  }

  const hashed = hashPin(pin, user.id);

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: user.id,
        journal_pin: hashed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/journal');
  return { success: true };
}

export async function removeJournalPinAction(
  currentPin: string
): Promise<{ success: boolean; error?: string }> {
  const { verifyPin } = await import('@/lib/pin');
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: existingSettings } = await supabase
    .from('user_settings')
    .select('journal_pin')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingSettings?.journal_pin) {
    if (!currentPin || !verifyPin(currentPin, existingSettings.journal_pin, user.id)) {
      return { success: false, error: 'Incorrect current PIN.' };
    }
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: user.id,
        journal_pin: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/journal');
  return { success: true };
}

export async function verifyJournalPinAction(
  enteredPin: string
): Promise<{ success: boolean; error?: string }> {
  const { verifyPin } = await import('@/lib/pin');
  const supabase = createServerClient();
  if (!supabase) return { success: false, error: 'Supabase not configured' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: settings } = await supabase
    .from('user_settings')
    .select('journal_pin')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!settings?.journal_pin) {
    return { success: true };
  }

  const isValid = verifyPin(enteredPin, settings.journal_pin, user.id);
  if (!isValid) {
    return { success: false, error: 'Incorrect PIN' };
  }

  return { success: true };
}




