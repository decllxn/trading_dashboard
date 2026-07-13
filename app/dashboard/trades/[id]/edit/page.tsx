import { redirect, notFound } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { TradeForm } from '../../new/trade-form';
import type { TradeInitialData } from '../../new/trade-form';
import type { Tag } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Format a timestamptz string to the `datetime-local` input format
 * (YYYY-MM-DDTHH:mm) in the user's local timezone. Returns '' if null.
 */
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Offset-adjusted local ISO string, trimmed to minute precision.
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Edit trade page — fetches the trade by [id], pre-populates the shared
 * TradeForm in edit mode so the user can correct any field (stop price,
 * P&L, tags, etc.). R-multiple is recomputed on save.
 */
export default async function EditTradePage({
  params,
}: {
  params: { id: string };
}) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="p-6">
        <h1 className="font-display text-primary text-xl">Edit trade</h1>
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

  // Fetch the trade (RLS-scoped — only the owner's row is returned).
  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .select(
      'id, instrument, asset_class, direction, entry_price, exit_price, size, stop_price, target_price, entry_time, exit_time, pnl, commission, swap, fees, status',
    )
    .eq('id', params.id)
    .single();

  if (tradeError || !trade) notFound();

  // Fetch user's tags for the picker.
  const { data: tags } = await supabase
    .from('tags')
    .select('id, user_id, name, category, created_at')
    .eq('user_id', user.id)
    .order('category')
    .order('name');

  const typedTags = (tags ?? []) as unknown as ReadonlyArray<Tag>;

  // Fetch existing trade_tags for this trade to pre-select in the picker.
  const { data: tradeTagLinks } = await supabase
    .from('trade_tags')
    .select('tag_id')
    .eq('trade_id', params.id);

  const existingTagIds = (tradeTagLinks ?? []).map(
    (link: { tag_id: string }) => link.tag_id,
  );

  const initialData: TradeInitialData = {
    id: trade.id,
    instrument: trade.instrument,
    assetClass: trade.asset_class,
    direction: trade.direction,
    status: trade.status,
    entryPrice: trade.entry_price ?? '',
    exitPrice: trade.exit_price ?? '',
    size: trade.size ?? '',
    stopPrice: trade.stop_price ?? '',
    targetPrice: trade.target_price ?? '',
    entryTime: toDateTimeLocal(trade.entry_time),
    exitTime: toDateTimeLocal(trade.exit_time),
    pnl: trade.pnl ?? '',
    commission: trade.commission ?? '',
    swap: trade.swap ?? '',
    fees: trade.fees ?? '',
    tagIds: existingTagIds,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-8">
        <h1 className="font-display text-primary text-xl">Edit trade</h1>
        <p className="text-secondary mt-1 text-sm">
          Update any field. R-multiple is recomputed from entry, stop, and exit
          on save.
        </p>
      </header>
      <TradeForm tags={typedTags} initialData={initialData} />
    </main>
  );
}
