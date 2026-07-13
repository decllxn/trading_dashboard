import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { JournalClient } from './journal-client';

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

  const [{ data: entries }, { data: trades }, { data: links }, { data: emotions }] = await Promise.all([
    supabase
      .from('journal_entries')
      .select('id, date, content, mood, mistakes')
      .eq('user_id', user.id),
    supabase
      .from('trades')
      .select('id, instrument, direction, pnl, r_multiple, entry_time')
      .eq('user_id', user.id),
    supabase
      .from('journal_trade_links')
      .select('journal_entry_id, trade_id'),
    supabase
      .from('tags')
      .select('name')
      .eq('category', 'emotion')
      .eq('user_id', user.id)
  ]);

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col bg-base overflow-hidden p-6">
      <JournalClient 
        entries={entries || []} 
        trades={trades || []} 
        links={links || []} 
        emotions={(emotions || []).map(e => e.name)}
      />
    </main>
  );
}
