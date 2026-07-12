import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { formatPnl, formatR, pnlColorClass, rColorClass } from '@/lib/trades';
import type { Trade } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Trades list (Phase 3a scope).
 *
 * The full sort/filter/density treatment is Phase 3b — this page exists so a
 * freshly-submitted trade is verifiably visible without a page reload. It
 * shows the core columns (instrument, direction, entry/exit, P&L, R, status,
 * date) with the design-system's numeric rules: monospace, right-aligned,
 * gain/loss colored only for real P&L. revalidatePath('/dashboard/trades') in
 * the create action refreshes this server render on submit.
 */
export default async function TradesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="p-6">
        <h1 className="font-display text-primary text-xl">Trades</h1>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rawTrades } = await supabase
    .from('trades')
    .select(
      'id, user_id, instrument, asset_class, direction, entry_price, exit_price, size, stop_price, target_price, entry_time, exit_time, pnl, r_multiple, status, source, broker_connection_id, created_at',
    )
    .eq('user_id', user.id)
    .order('entry_time', { ascending: false, nullsFirst: false });

  const trades = (rawTrades ?? []) as unknown as Trade[];

  return (
    <main className="px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-primary text-xl">Trades</h1>
          <p className="text-secondary mt-1 text-sm">
            {trades.length === 0
              ? 'No trades yet. Log your first to start building history.'
              : `${trades.length} trade${trades.length === 1 ? '' : 's'} logged.`}
          </p>
        </div>
        <Link
          href="/dashboard/trades/new"
          className="bg-accent-signal text-base inline-flex items-center gap-1.5 rounded-card px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent-signal/90"
        >
          <Plus size={14} strokeWidth={2} />
          Log trade
        </Link>
      </div>

      {trades.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="border-hairline bg-surface overflow-hidden rounded-card border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-tertiary border-hairline border-b text-left text-[10px] uppercase tracking-wide">
                <Th>Instrument</Th>
                <Th>Direction</Th>
                <Th align="right">Entry</Th>
                <Th align="right">Exit</Th>
                <Th align="right">P&amp;L</Th>
                <Th align="right">R</Th>
                <Th>Status</Th>
                <Th align="right">Entry time</Th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const pnl = t.pnl != null ? Number(t.pnl) : null;
                const r = t.rMultiple != null ? Number(t.rMultiple) : null;
                return (
                  <tr
                    key={t.id}
                    className="border-hairline border-b last:border-b-0 hover:bg-surface-raised transition-colors duration-150"
                  >
                    <Td>
                      <span className="text-primary">{t.instrument}</span>
                    </Td>
                    <Td>
                      <span
                        className={
                          t.direction === 'long'
                            ? 'text-gain'
                            : 'text-loss'
                        }
                      >
                        {t.direction === 'long' ? 'Long' : 'Short'}
                      </span>
                    </Td>
                    <Td align="right" mono>
                      {t.entryPrice ?? '—'}
                    </Td>
                    <Td align="right" mono>
                      {t.exitPrice ?? '—'}
                    </Td>
                    <Td align="right" mono className={pnlColorClass(pnl)}>
                      {formatPnl(pnl)}
                    </Td>
                    <Td align="right" mono className={rColorClass(r)}>
                      {formatR(r)}
                    </Td>
                    <Td>
                      <span className="text-secondary">{t.status}</span>
                    </Td>
                    <Td align="right" mono>
                      {t.entryTime
                        ? new Date(t.entryTime).toLocaleDateString()
                        : '—'}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/** Empty state — instructional copy, no emoji, no filler (per DS). */
function EmptyState() {
  return (
    <div className="border-hairline bg-surface rounded-card border px-6 py-12 text-center">
      <p className="text-primary font-display text-sm">No trades logged</p>
      <p className="text-secondary mx-auto mt-2 max-w-sm text-sm">
        Log your first trade to populate this list. Entry, stop, and exit
        prices compute the R-multiple automatically.
      </p>
      <Link
        href="/dashboard/trades/new"
        className="bg-accent-signal text-base mt-4 inline-flex items-center gap-1.5 rounded-card px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent-signal/90"
      >
        <Plus size={14} strokeWidth={2} />
        Log trade
      </Link>
    </div>
  );
}

type Align = 'left' | 'right';

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: Align;
}) {
  return (
    <th
      className={`px-3 py-2 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono = false,
  className = '',
}: {
  children: React.ReactNode;
  align?: Align;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 ${mono ? 'num' : ''} ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}
