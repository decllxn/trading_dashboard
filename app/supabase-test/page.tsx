import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function SupabaseTestPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="bg-base flex min-h-screen items-center justify-center px-unit">
        <div className="border-hairline bg-surface w-full max-w-md rounded-card p-8">
          <h1 className="font-display text-primary text-lg">
            Supabase connection
          </h1>
          <p className="text-secondary mt-2 text-sm">
            Not configured. Add the following to{' '}
            <code className="num text-accent-signal">.env.local</code> to enable
            the connection layer.
          </p>
          <ul className="mt-4 space-y-1">
            <li className="num text-tertiary text-sm">
              NEXT_PUBLIC_SUPABASE_URL
            </li>
            <li className="num text-tertiary text-sm">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </li>
          </ul>
        </div>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) {
    return (
      <main className="bg-base flex min-h-screen items-center justify-center px-unit">
        <p className="text-secondary text-sm">
          Supabase client unavailable.
        </p>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="bg-base flex min-h-screen items-center justify-center px-unit">
      <div className="border-hairline bg-surface w-full max-w-md rounded-card p-8">
        <h1 className="font-display text-primary text-lg">
          Supabase connection
        </h1>
        <p className="text-secondary mt-2 text-sm">
          {user
            ? 'Authenticated as'
            : 'No active session. Connection is live; sign in to populate user data.'}
        </p>
        {user ? (
          <p className="num text-accent-signal mt-1 text-sm">{user.email}</p>
        ) : null}
      </div>
    </main>
  );
}
