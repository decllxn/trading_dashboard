import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { syncBrokerTrades } from '@/lib/snaptrade';

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
    const result = await syncBrokerTrades(user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error syncing broker trades:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed.' },
      { status: 500 },
    );
  }
}
