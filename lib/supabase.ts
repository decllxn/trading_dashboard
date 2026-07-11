import { createBrowserClient as supabaseBrowserClient } from '@supabase/ssr';
import { createServerClient as supabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** True only when both public Supabase env vars are present. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/**
 * Browser Supabase client.
 *
 * Cached on `globalThis` so HMR in dev reuses a single instance instead of
 * opening a new GoTrue WebSocket on every refresh. Returns null when env vars
 * are unset so callers can render a graceful "not configured" state instead
 * of throwing inside React render.
 */
type BrowserClient = ReturnType<typeof supabaseBrowserClient>;

function buildBrowserClient(): BrowserClient | null {
  if (!isSupabaseConfigured()) return null;
  return supabaseBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowser: BrowserClient | null | undefined;
}

export function createClient(): BrowserClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!globalThis.__supabaseBrowser) {
    globalThis.__supabaseBrowser = buildBrowserClient();
  }
  return globalThis.__supabaseBrowser;
}

/**
 * Server Supabase client, scoped to the current request via cookies().
 *
 * Use inside Server Components, Route Handlers, and Server Actions only.
 * Returns null when env vars are unset so server components can branch
 * gracefully instead of throwing.
 */
export function createServerClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = cookies();
  return supabaseServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `set` call is only invokable from a Server Action or Route
          // Handler; it is a no-op when invoked from a Server Component.
          // Middleware handles cookie refresh for that path.
        }
      },
    },
  });
}

/**
 * Refresh the Supabase session cookie on every matched request.
 *
 * Called by middleware.ts.getUser() probes the access token — if it has rotated
 * or expired, the refreshed cookies are written onto the forwarded response so
 * downstream server components read a valid session. No auth redirects yet
 * (Phase 1c adds route protection).
 */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = supabaseServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Driving getUser() (not getSession()) refreshes cookies on the response and
  // is the source of truth for auth state server-side.
  await supabase.auth.getUser();

  return response;
}
