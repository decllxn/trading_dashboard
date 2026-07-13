import { notFound, redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { TradeChart } from '@/components/charts/trade-chart';
import type { ChartAnnotation } from '@/db/schema';
import { formatPrice, formatR, pnlColorClass, rColorClass } from '@/lib/trades';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = await Promise.resolve(params);
  const id = resolvedParams.id;

  if (!isSupabaseConfigured()) {
    return (
      <main className="p-6">
        <h1 className="font-display text-primary text-xl">Trade Detail</h1>
        <p className="text-secondary mt-2 text-sm">
          Supabase is not configured.
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

  const { data: trade, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !trade) notFound();

  // Load annotations
  const annotations: ChartAnnotation[] = trade.annotations 
    ? (trade.annotations as unknown as ChartAnnotation[])
    : [];

  // Load user settings for session
  const { data: userSettings } = await supabase
    .from('user_settings')
    .select('chart_sessions_enabled')
    .eq('user_id', user.id)
    .single();

  // Load linked journal entries
  const { data: links } = await supabase
    .from('journal_trade_links')
    .select('journal_entries(id, date, mood, text_content)')
    .eq('trade_id', trade.id);
    
  const linkedEntries = (links || []).map(l => l.journal_entries).filter(Boolean);

  const sessionsEnabled = userSettings?.chart_sessions_enabled ?? false;

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-hairline">
        <Link
          href="/dashboard/trades"
          className="text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-primary text-lg">
            {trade.instrument}
          </h1>
          <span className="px-2 py-0.5 border border-hairline rounded text-xs text-secondary capitalize">
            {trade.direction}
          </span>
          <span className="px-2 py-0.5 border border-hairline rounded text-xs text-secondary capitalize">
            {trade.status}
          </span>
        </div>
        
        <div className="ml-auto flex items-center gap-4 text-sm font-mono">
          <div className="flex items-center gap-2">
            <span className="text-tertiary">P&L</span>
            <span className={cn('text-right', pnlColorClass(Number(trade.pnl)))}>
              {trade.pnl != null ? `$${Math.abs(Number(trade.pnl)).toFixed(2)}` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-tertiary">R</span>
            <span className={cn('text-right', rColorClass(Number(trade.r_multiple)))}>
              {trade.r_multiple != null ? formatR(Number(trade.r_multiple)) : '—'}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Chart Area */}
        <div className="flex-1 p-4 bg-base overflow-hidden border-r border-hairline">
          <TradeChart 
            trade={trade as any} 
            initialAnnotations={annotations} 
            sessionsEnabled={sessionsEnabled} 
          />
        </div>
        
        {/* Sidebar: Linked Journal Entries */}
        <div className="w-80 shrink-0 bg-surface flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-hairline">
             <h2 className="font-display text-primary text-sm uppercase tracking-wide">Linked Journal Entries</h2>
          </div>
          <div className="p-4 flex flex-col gap-4">
             {linkedEntries.length === 0 ? (
               <p className="text-sm text-tertiary">No journal entries linked to this trade.</p>
             ) : (
               linkedEntries.map((entry: any) => (
                 <Link href="/dashboard/journal" key={entry.id} className="block group border border-hairline bg-base p-3 rounded-card transition-colors hover:border-accent-signal">
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-xs font-mono text-accent-signal">{entry.date}</span>
                     {entry.mood && <span className="text-[10px] text-tertiary uppercase border border-hairline px-1.5 py-0.5 rounded">{entry.mood}</span>}
                   </div>
                   <p className="text-sm text-secondary line-clamp-3 group-hover:text-primary transition-colors">
                     {entry.text_content || 'No text content'}
                   </p>
                 </Link>
               ))
             )}
          </div>
        </div>
      </div>
    </main>
  );
}
