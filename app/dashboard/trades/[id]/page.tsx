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
  params: { id: string };
}) {
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
    .eq('id', params.id)
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

      <div className="flex-1 p-4 bg-base overflow-hidden">
        <TradeChart 
          trade={trade as any} 
          initialAnnotations={annotations} 
          sessionsEnabled={sessionsEnabled} 
        />
      </div>
    </main>
  );
}
