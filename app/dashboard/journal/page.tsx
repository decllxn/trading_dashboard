import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { JournalClient } from './journal-client';
import { computeNetPnl } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export default async function JournalPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="p-6">
        <h1 className="font-display text-primary text-xl">Journal</h1>
        <p className="text-secondary mt-2 text-sm">Supabase is not configured.</p>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: entries }, { data: trades }, { data: links }, { data: emotions }, { data: settings }] = await Promise.all([
    supabase
      .from('journal_entries')
      .select('id, date, content, text_content, mood, mistakes')
      .eq('user_id', user.id),
    supabase
      .from('trades')
      .select('id, instrument, direction, pnl, commission, swap, fees, r_multiple, entry_time')
      .eq('user_id', user.id),
    supabase
      .from('journal_trade_links')
      .select('journal_entry_id, trade_id'),
    supabase
      .from('tags')
      .select('name')
      .eq('category', 'emotion')
      .eq('user_id', user.id),
    supabase
      .from('user_settings')
      .select('journal_pin')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const mappedTrades = (trades || []).map((t) => {
    const gross = t.pnl != null ? Number(t.pnl) : null;
    const commission = t.commission != null ? Number(t.commission) : null;
    const swap = t.swap != null ? Number(t.swap) : null;
    const fees = t.fees != null ? Number(t.fees) : null;
    return {
      id: t.id,
      instrument: t.instrument,
      direction: t.direction,
      pnl: computeNetPnl(gross, commission, swap, fees),
      r_multiple: t.r_multiple,
      entry_time: t.entry_time,
    };
  });

  return (
    <main className="flex min-h-full h-auto lg:h-full flex-col bg-base overflow-y-auto lg:overflow-hidden p-4 sm:p-6">
      <JournalClient 
        entries={entries || []} 
        trades={mappedTrades} 
        links={links || []} 
        emotions={(emotions || []).map(e => e.name)}
        hasPin={Boolean(settings?.journal_pin)}
      />
    </main>
  );
}
