import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  exchangeCTraderCode,
  discoverCTraderAccounts,
  syncCTraderAccount,
} from '@/lib/ctrader';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=Database+client+unavailable', request.url),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error || !code) {
    const msg = errorDescription || error || 'Authorization failed';
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=${encodeURIComponent(msg)}`, request.url),
    );
  }

  try {
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/ctrader/callback`;

    // 1. Exchange code for access token
    const tokenData = await exchangeCTraderCode(code, redirectUri);
    const accessToken = tokenData.accessToken;
    const refreshToken = tokenData.refreshToken;

    // 2. Discover accounts under this cTID
    const discovered = await discoverCTraderAccounts(accessToken);

    // 3. Sync accounts
    for (const acct of discovered) {
      const acctIdStr = acct.ctidTraderAccountId.toString();
      try {
        await syncCTraderAccount(user.id, acctIdStr, accessToken);
      } catch (syncErr) {
        console.error(`Initial sync failed for account ${acctIdStr}:`, syncErr);
      }
    }

    return NextResponse.redirect(
      new URL('/dashboard/settings?ctrader=connected', request.url),
    );
  } catch (err: any) {
    console.error('Error handling cTrader OAuth callback:', err);
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=${encodeURIComponent(err.message || 'Connection failed')}`,
        request.url,
      ),
    );
  }
}
