import { type NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const CTRADER_SERVICE_URL =
  process.env.CTRADER_SERVICE_URL || 'http://localhost:8001';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return new Response('Database unavailable', { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const upstream = await fetch(`${CTRADER_SERVICE_URL}/events/stream`, {
      headers: {
        Accept: 'text/event-stream',
      },
    });

    if (!upstream.ok || !upstream.body) {
      return new Response('Event stream unavailable', { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(
      `data: {"type": "error", "message": ${JSON.stringify(err.message)}}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
        },
      },
    );
  }
}
