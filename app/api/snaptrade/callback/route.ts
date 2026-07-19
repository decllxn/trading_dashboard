import { NextResponse, type NextRequest } from 'next/server';
import { syncBrokerTrades, syncSnaptradeAccounts } from '@/lib/snaptrade';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function settingsRedirect(request: NextRequest, broker: string) {
  const url = new URL('/dashboard/settings', request.url);
  url.searchParams.set('broker', broker);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return settingsRedirect(request, 'unavailable');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return settingsRedirect(request, 'signin');

  try {
    const accountCount = await syncSnaptradeAccounts(user.id);
    if (accountCount > 0) {
      await syncBrokerTrades(user.id);
    }
    return settingsRedirect(
      request,
      accountCount > 0 ? 'connected' : 'pending',
    );
  } catch (error) {
    console.error('Error in SnapTrade connection callback sync:', error);
    return settingsRedirect(request, 'sync-error');
  }
}
