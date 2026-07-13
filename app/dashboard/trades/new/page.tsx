import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { TradeForm } from './trade-form';
import type { Tag } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Trade entry page — fetches the signed-in user's tags server-side (so the
 * picker is grouped and populated on first paint) and renders the form.
 * Auth gating mirrors the dashboard layout: redirect to /login if there is no
 * session. The form itself owns the create flow via a server action.
 */
export default async function NewTradePage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="p-6">
        <h1 className="font-display text-primary text-xl">Log a trade</h1>
        <p className="text-secondary mt-2 text-sm">
          Supabase is not configured. Add credentials to{' '}
          <code className="num text-accent-signal">.env.local</code>.
        </p>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: tags } = await supabase
    .from('tags')
    .select('id, user_id, name, category, created_at')
    .eq('user_id', user.id)
    .order('category')
    .order('name');

  // Supabase returns snake_case rows; the Tag type (Drizzle) is camelCase.
  // The columns line up 1:1, so cast through unknown — the TagPicker only
  // reads id/name/category, which are present.
  const typedTags = (tags ?? []) as unknown as ReadonlyArray<Tag>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8">
        <h1 className="font-display text-primary text-xl">Log a trade</h1>
        <p className="text-secondary mt-1 text-sm">
          Manual entry. R-multiple is computed from entry, stop, and exit.
        </p>
      </header>
      <TradeForm tags={typedTags} />
    </main>
  );
}
