import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { syncCTraderAccount } from '@/lib/ctrader';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database client unavailable.' },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { data: accounts, error: acctErr } = await supabase
      .from('ctrader_accounts')
      .select('ctid_trader_account_id, access_token')
      .eq('user_id', user.id);

    if (acctErr || !accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: 'No linked cTrader accounts found.' },
        { status: 404 },
      );
    }

    const results = [];
    for (const acct of accounts) {
      if (!acct.access_token) continue;
      const res = await syncCTraderAccount(
        user.id,
        acct.ctid_trader_account_id,
        acct.access_token,
      );
      results.push({
        accountId: acct.ctid_trader_account_id,
        ...res,
      });
    }

    return NextResponse.json({ success: true, syncedAccounts: results });
  } catch (error: any) {
    console.error('Error during manual cTrader sync:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed.' },
      { status: 500 },
    );
  }
}
