import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { SimulationsClient } from '@/components/dashboard/simulations-client';

export const dynamic = 'force-dynamic';

export default async function SimulationsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="px-4 py-6 bg-base sm:px-6 min-h-screen">
        <h1 className="font-display text-primary text-xl font-bold">Simulations</h1>
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

  // Fetch closed trades with non-null R-multiples
  const { data: rawTrades, error } = await supabase
    .from('trades')
    .select('r_multiple')
    .eq('user_id', user.id)
    .not('r_multiple', 'is', null)
    .not('status', 'eq', 'open');

  if (error) {
    return (
      <main className="px-4 py-6 bg-base sm:px-6 min-h-screen">
        <h1 className="font-display text-primary text-xl font-bold">Simulations</h1>
        <div className="border-hairline bg-surface mt-4 rounded-card border px-4 py-3">
          <p className="text-loss text-sm font-semibold">Couldn&apos;t load trade history.</p>
          <p className="num text-tertiary mt-1 text-xs">{error.message}</p>
        </div>
      </main>
    );
  }

  const rMultiples = (rawTrades || [])
    .map(t => Number(t.r_multiple))
    .filter(n => !Number.isNaN(n));

  return (
    <main className="px-4 py-6 bg-base sm:px-6 min-h-screen">
      <div className="mb-6">
        <h1 className="font-display text-primary text-xl font-bold uppercase tracking-wide">Monte Carlo Simulations</h1>
        <p className="text-secondary mt-1 text-sm">
          Simulate performance projections and analyze position sizing risk parameters using your trade history.
        </p>
      </div>

      <SimulationsClient initialRMultiples={rMultiples} />
    </main>
  );
}
