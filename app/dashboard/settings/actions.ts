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
