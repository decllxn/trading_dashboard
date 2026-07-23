import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Upload } from 'lucide-react';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import type { TradeRow, TradeRowTag } from '@/lib/trades';
import { computeNetPnl } from '@/lib/stats';
import { TradesTable } from '@/components/trades/trades-table';
import type {
  AssetClass,
  Direction,
  Tag,
  TradeStatus,
} from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Trades list (Phase 3b).
 *
 * Fetches the user's trades + tags + trade_tags server-side, maps them into
 * the clean TradeRow UI contract (resolving tag ids → names and coercing
 * decimal-strings to numbers), and hands them to the client table, which owns
 * sorting and filtering in memory for instant feedback with no reload.
 *
 * Mapping happens here rather than in the client so the component receives a
 * normalized shape and never deals with snake_case keys or numeric strings.
 * The Supabase join returns trade_tags inline; we flatten them into a tags[]
 * array per trade.
 */
export default async function TradesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h1 className="font-display text-primary text-xl">Trades</h1>
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

  // Trades + their tags, fetched as three flat queries and stitched in JS.
  // We deliberately do NOT use a nested PostgREST embed (e.g.
  // `trade_tags(tag_id)`) for the trade→tag resolution: PostgREST can only
  // expand a nested relationship when it can detect the foreign-key path, and
  // any failure there returns the WHOLE trades query as an error with null
  // data — which silently hid every trade (the bug this fixed). Flat queries
  // mean a tag/link problem can never obscure the trades themselves.
  let [
    { data: rawTrades, error: tradesError },
    { data: rawTags },
    { data: rawTradeTags },
  ] = await Promise.all([
    supabase
      .from('trades')
      .select(
        'id, instrument, asset_class, direction, entry_price, exit_price, size, stop_price, target_price, entry_time, exit_time, pnl, commission, swap, fees, r_multiple, status, daily_pd_array, one_hour_pd_array, thirty_minute_pd_array, images, pretrade_checklist',
      )
      .eq('user_id', user.id)
      .order('entry_time', { ascending: false, nullsFirst: false }),
    supabase
      .from('tags')
      .select('id, name, category')
      .eq('user_id', user.id)
      .order('name'),
    supabase
      .from('trade_tags')
      .select('trade_id, tag_id'),
  ]);

  // If pretrade_checklist column is missing in Supabase DB, fallback to selecting without it
  if (tradesError && tradesError.message?.includes('pretrade_checklist')) {
    const retry = await supabase
      .from('trades')
      .select(
        'id, instrument, asset_class, direction, entry_price, exit_price, size, stop_price, target_price, entry_time, exit_time, pnl, commission, swap, fees, r_multiple, status, daily_pd_array, one_hour_pd_array, thirty_minute_pd_array, images',
      )
      .eq('user_id', user.id)
      .order('entry_time', { ascending: false, nullsFirst: false });

    rawTrades = retry.data as any;
    tradesError = retry.error;
  }

  // Surface the query error instead of swallowing it. If the trades query
  // failed, the previous code rendered "No trades logged" — misleading. Show
  // a real error state so a misquery is diagnosable.
  if (tradesError) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h1 className="font-display text-primary text-xl">Trades</h1>
        <div className="border-hairline bg-surface mt-4 rounded-card border px-4 py-3">
          <p className="text-loss text-sm">Couldn&apos;t load trades.</p>
          <p className="num text-tertiary mt-1 text-xs">
            {tradesError.message}
          </p>
        </div>
      </main>
    );
  }

  // Map tag rows into the Tag shape and build a lookup so we can resolve each
  // trade's tag ids to names without a second round-trip.
  const tags = (rawTags ?? []) as unknown as ReadonlyArray<Tag>;
  const tagNameById = new Map<string, TradeRowTag>();
  for (const tag of tags) {
    tagNameById.set(tag.id, { id: tag.id, name: tag.name });
  }

  // Group trade_tags by trade_id for the join. trade_tags has no user_id
  // column (ownership is dereferenced through the joined rows per the 2b
  // migration), so RLS returns only links whose trade AND tag this user owns.
  const tagIdsByTradeId = new Map<string, string[]>();
  for (const link of (rawTradeTags ?? []) as unknown as ReadonlyArray<{
    trade_id: string;
    tag_id: string;
  }>) {
    const list = tagIdsByTradeId.get(link.trade_id) ?? [];
    list.push(link.tag_id);
    tagIdsByTradeId.set(link.trade_id, list);
  }

  const rows: TradeRow[] = ((rawTrades ?? []) as unknown as RawTradeRow[]).map(
    (t) => {
      const grossPnl = toNumber(t.pnl);
      const commission = toNumber(t.commission);
      const swap = toNumber(t.swap);
      const fees = toNumber(t.fees);
      return {
        id: t.id,
        instrument: t.instrument,
        assetClass: t.asset_class as AssetClass,
        direction: t.direction as Direction,
        entryPrice: toNumber(t.entry_price),
        exitPrice: toNumber(t.exit_price),
        size: toNumber(t.size),
        grossPnl,
        commission,
        swap,
        fees,
        stopPrice: toNumber(t.stop_price),
        targetPrice: toNumber(t.target_price),
        exitTime: t.exit_time,
        // Headline P&L is net (gross − costs). Falls back to gross when no
        // costs are recorded, so existing rows are unaffected.
        pnl: computeNetPnl(grossPnl, commission, swap, fees),
        rMultiple: toNumber(t.r_multiple),
        status: t.status as TradeStatus,
        dailyPdArray: t.daily_pd_array,
        oneHourPdArray: t.one_hour_pd_array,
        thirtyMinutePdArray: t.thirty_minute_pd_array,
        images: t.images || [],
        pretradeChecklist: (t as any).pretrade_checklist || [],
        entryTime: t.entry_time,
        tags: (tagIdsByTradeId.get(t.id) ?? [])
          .map((tagId) => tagNameById.get(tagId))
          .filter((tag): tag is TradeRowTag => tag != null)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    },
  );

  return (
    <main className="px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-primary text-xl">Trades</h1>
          <p className="text-secondary mt-1 text-sm">
            {rows.length === 0
              ? 'No trades yet.'
              : `${rows.length} trade${rows.length === 1 ? '' : 's'} logged.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/trades/import"
            className="border-hairline text-secondary hover:text-primary hover:bg-surface-raised inline-flex items-center gap-1.5 rounded-card border px-3 py-2 text-sm transition-colors duration-150"
          >
            <Upload size={14} strokeWidth={1.75} />
            Import CSV
          </Link>
          <Link
            href="/dashboard/trades/new"
            className="bg-accent-signal text-base inline-flex items-center gap-1.5 rounded-card px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent-signal/90"
          >
            <Plus size={14} strokeWidth={2} />
            Log trade
          </Link>
        </div>
      </div>

      <TradesTable trades={rows} tags={tags} />
    </main>
  );
}

/**
 * Postgres numeric comes back as a string. Number() is safe at the magnitudes
 * a retail journal handles; null/undefined pass through as null.
 */
function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Raw shape of one trade row from Supabase. snake_case. */
interface RawTradeRow {
  id: string;
  instrument: string;
  asset_class: string;
  direction: string;
  entry_price: string | null;
  exit_price: string | null;
  size: string | null;
  pnl: string | null;
  commission: string | null;
  swap: string | null;
  fees: string | null;
  r_multiple: string | null;
  status: string;
  entry_time: string | null;
  daily_pd_array: string | null;
  one_hour_pd_array: string | null;
  thirty_minute_pd_array: string | null;
  images: string[] | null;
  stop_price: string | null;
  target_price: string | null;
  exit_time: string | null;
}
