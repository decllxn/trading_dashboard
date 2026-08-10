import { notFound, redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { formatPrice, formatR, formatPnl, rColorClass, calculateTradeRisk, formatRisk, pnlColorClass } from '@/lib/trades';
import type { AssetClass } from '@/db/schema'; // keep imports clean
import { computeNetPnl } from '@/lib/stats';
import { decryptText, decryptJson } from '@/lib/crypto';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ScreenshotGallery } from '@/components/trades/screenshot-gallery';

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

  const { data: rawTrade, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !rawTrade) notFound();

  const trade = {
    ...rawTrade,
    daily_pd_array: decryptText(rawTrade.daily_pd_array, user.id),
    one_hour_pd_array: decryptText(rawTrade.one_hour_pd_array, user.id),
    thirty_minute_pd_array: decryptText(rawTrade.thirty_minute_pd_array, user.id),
    images: decryptJson(rawTrade.images, user.id) || [],
  };

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
    
  const linkedEntries = (links || [])
    .map((l: any) => l.journal_entries)
    .filter(Boolean)
    .map((e: any) => ({
      ...e,
      mood: decryptText(e.mood, user.id),
      text_content: decryptText(e.text_content, user.id),
    }));

  const sessionsEnabled = userSettings?.chart_sessions_enabled ?? false;

  const grossPnl = trade.pnl != null ? Number(trade.pnl) : null;
  const commission = trade.commission != null ? Number(trade.commission) : null;
  const swap = trade.swap != null ? Number(trade.swap) : null;
  const fees = trade.fees != null ? Number(trade.fees) : null;
  const netPnl = computeNetPnl(grossPnl, commission, swap, fees);
  const hasCosts = (commission ?? 0) + (swap ?? 0) + (fees ?? 0) > 0;

  return (
    <main className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-hairline px-4 py-4 sm:px-6">
        <Link
          href="/dashboard/trades"
          className="text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex flex-wrap items-center gap-3">
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
        
        <div className="ml-auto flex flex-wrap items-center gap-4 text-sm font-mono">
          <div className="flex items-center gap-2">
            <span className="text-tertiary">Net P&amp;L</span>
            <span className={cn('num text-right', pnlColorClass(netPnl))}>
              {formatPnl(netPnl)}
            </span>
          </div>
          {hasCosts ? (
            <div className="flex items-center gap-2">
              <span className="text-tertiary">Gross</span>
              <span className={cn('num text-right', pnlColorClass(grossPnl))}>
                {formatPnl(grossPnl)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-tertiary">R</span>
            <span className={cn('num text-right', rColorClass(Number(trade.r_multiple)))}>
              {trade.r_multiple != null ? formatR(Number(trade.r_multiple)) : '—'}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden lg:flex-row">
        {/* Main Center Area: Screenshots */}
        <div className="flex-1 overflow-y-auto bg-base p-4 lg:border-r border-b border-hairline lg:border-b-0">
          {trade.images && trade.images.length > 0 ? (
            <div className="space-y-4">
              <h2 className="font-display text-primary text-xs uppercase tracking-wide mb-2">
                Trade Screenshots
              </h2>
              <ScreenshotGallery images={trade.images} />
            </div>
          ) : (
            <div className="flex h-full min-h-[350px] items-center justify-center border border-dashed border-hairline rounded-card bg-surface/30">
              <p className="text-secondary text-sm">No screenshots uploaded for this trade.</p>
            </div>
          )}
        </div>
        
        {/* Sidebar: Cost breakdown + Linked Journal Entries */}
        <div className="no-scrollbar w-full shrink-0 overflow-y-auto bg-surface lg:w-80 lg:max-h-none max-h-[40vh]">
          {hasCosts ? (
            <div className="p-4 border-b border-hairline">
              <h2 className="font-display text-primary text-sm uppercase tracking-wide mb-3">Cost Breakdown</h2>
              <dl className="space-y-2 text-sm">
                <CostRow label="Gross P&L" value={formatPnl(grossPnl)} valueClass={pnlColorClass(grossPnl)} />
                {commission ? <CostRow label="Commission" value={`−$${commission.toFixed(2)}`} /> : null}
                {swap ? <CostRow label="Swap / financing" value={`−$${swap.toFixed(2)}`} /> : null}
                {fees ? <CostRow label="Other fees" value={`−$${fees.toFixed(2)}`} /> : null}
                <div className="border-t border-hairline pt-2 mt-2">
                  <CostRow label="Net P&L" value={formatPnl(netPnl)} valueClass={pnlColorClass(netPnl)} bold />
                </div>
              </dl>
            </div>
          ) : null}

          <div className="p-4 border-b border-hairline">
            <h2 className="font-display text-primary text-sm uppercase tracking-wide mb-3">Sizing &amp; Levels</h2>
            <dl className="space-y-2 text-sm font-mono">
              <div className="flex items-center justify-between">
                <dt className="text-secondary text-xs">Position Size</dt>
                <dd className="text-primary text-right text-xs font-medium">{trade.size != null ? Number(trade.size).toLocaleString() : '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-secondary text-xs">Entry Price</dt>
                <dd className="text-primary text-right text-xs font-medium">{formatPrice(trade.entry_price != null ? Number(trade.entry_price) : null, trade.asset_class as AssetClass)}</dd>
              </div>
              {trade.exit_price != null && (
                <div className="flex items-center justify-between">
                  <dt className="text-secondary text-xs">Exit Price</dt>
                  <dd className="text-primary text-right text-xs font-medium">{formatPrice(Number(trade.exit_price), trade.asset_class as AssetClass)}</dd>
                </div>
              )}
              {trade.stop_price != null && (
                <div className="flex items-center justify-between">
                  <dt className="text-secondary text-xs">Stop Price</dt>
                  <dd className="text-primary text-right text-xs font-medium">{formatPrice(Number(trade.stop_price), trade.asset_class as AssetClass)}</dd>
                </div>
              )}
              {trade.target_price != null && (
                <div className="flex items-center justify-between">
                  <dt className="text-secondary text-xs">Target Price</dt>
                  <dd className="text-primary text-right text-xs font-medium">{formatPrice(Number(trade.target_price), trade.asset_class as AssetClass)}</dd>
                </div>
              )}
              {trade.entry_price != null && trade.stop_price != null && trade.size != null && (
                <div className="flex items-center justify-between border-t border-hairline/30 pt-2 mt-2 font-sans">
                  <dt className="text-secondary text-xs">Calculated Risk</dt>
                  <dd className="text-accent-signal text-right text-xs font-semibold">
                    {formatRisk(calculateTradeRisk(trade.instrument, Number(trade.size), Number(trade.entry_price), Number(trade.stop_price), trade.asset_class as AssetClass))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {(trade.daily_pd_array || trade.one_hour_pd_array || trade.thirty_minute_pd_array) ? (
            <div className="p-4 border-b border-hairline">
              <h2 className="font-display text-primary text-sm uppercase tracking-wide mb-3">Market Context</h2>
              <dl className="space-y-2 text-sm font-mono">
                {trade.daily_pd_array ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-secondary text-xs">Daily PD Array</dt>
                    <dd className="text-primary text-right text-xs font-medium">{trade.daily_pd_array}</dd>
                  </div>
                ) : null}
                {trade.one_hour_pd_array ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-secondary text-xs">1 Hr PD Array</dt>
                    <dd className="text-primary text-right text-xs font-medium">{trade.one_hour_pd_array}</dd>
                  </div>
                ) : null}
                {trade.thirty_minute_pd_array ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-secondary text-xs">30 Min PD Array</dt>
                    <dd className="text-primary text-right text-xs font-medium">{trade.thirty_minute_pd_array}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
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

interface CostRowProps {
  label: string;
  value: string;
  valueClass?: string;
  bold?: boolean;
}

function CostRow({ label, value, valueClass, bold }: CostRowProps) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn('text-secondary text-xs', bold && 'text-primary font-medium')}>{label}</dt>
      <dd className={cn('num text-right text-xs', bold && 'text-sm font-semibold', valueClass)}>{value}</dd>
    </div>
  );
}
