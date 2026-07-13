'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createConnectionPortalUrl,
  ensureSnaptradeUser,
} from '@/lib/snaptrade';
import { createServerClient } from '@/lib/supabase';

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

