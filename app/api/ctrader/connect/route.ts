import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getCTraderAuthUrl } from '@/lib/ctrader';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/ctrader/callback`;
    const authUrl = await getCTraderAuthUrl(redirectUri);
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Error generating cTrader auth URL:', error);
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=' + encodeURIComponent(error.message), request.url),
    );
  }
}
