'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Camera } from 'lucide-react';
import {
  capitalize,
  DEFAULT_FILTERS,
  filterTrades,
  filtersAreEmpty,
  formatEntryDate,
  formatPrice,
  formatR,
  pnlColorClass,
  rColorClass,
  sortTrades,
  type TradeFilters,
  type TradeRow,
  type TradeSort,
  type TradeSortKey,
} from '@/lib/trades';
import { cn } from '@/lib/utils';
import { TradeFiltersBar } from './trade-filters';
import type { Tag } from '@/db/schema';
import { TradeDetailModal } from './trade-detail-modal';

interface TradesTableProps {
  /** All of the user's trades, pre-mapped to the UI contract. */
  trades: ReadonlyArray<TradeRow>;
  /** All of the user's tags (for the tag filter optgroups). */
  tags: ReadonlyArray<Tag>;
}

/**
 * Sortable, filterable trades table.
 *
 * Sorting and filtering are pure (lib/trades.ts) and run client-side in a
 * single useMemo, so re-sorting or changing a filter recomputes instantly
 * with no server round-trip. Sort state is local; filter state is local and
 * starts at DEFAULT_FILTERS.
 *
 * Number columns are monospaced (.num) and right-aligned — the design system
 * rule, no exceptions. P&L and R color comes from the real sign of the value
 * (gain/loss tokens); direction and status are NOT colored, since those are
 * not P&L and the DS bans gain/loss for "good/bad" affordances.
 */
export function TradesTable({ trades, tags }: TradesTableProps) {
  const [sort, setSort] = useState<TradeSort>({
    key: 'entryTime',
    direction: 'desc',
  });
  const [filters, setFilters] = useState<TradeFilters>(DEFAULT_FILTERS);
  const [selectedTrade, setSelectedTrade] = useState<TradeRow | null>(null);

  const visible = useMemo(() => {
    const filtered = filterTrades(trades, filters);
    return sortTrades(filtered, sort);
  }, [trades, filters, sort]);

  const hasAnyTrades = trades.length > 0;
  const hasFilters = !filtersAreEmpty(filters);

  function toggleSort(key: TradeSortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  return (
    <div className="space-y-4">
      {hasAnyTrades ? (
        <TradeFiltersBar
          filters={filters}
          onChange={setFilters}
          tags={tags}
          canClear={hasFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />
      ) : null}

      {visible.length === 0 ? (
        hasAnyTrades ? (
          <NoMatches onClear={() => setFilters(DEFAULT_FILTERS)} />
        ) : (
          <NoTrades />
        )
      ) : (
        <div className="border-hairline bg-surface overflow-hidden rounded-card border">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-tertiary border-hairline border-b">
                  <SortableTh
                    label="Instrument"
                    sortKey="instrument"
                    sort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Direction"
                    sortKey="direction"
                    sort={sort}
                    onToggle={toggleSort}
                  />
                  <SortableTh
                    label="Entry"
                    sortKey="entryPrice"
                    sort={sort}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Exit"
                    sortKey="exitPrice"
                    sort={sort}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortableTh
                    label="P&L"
                    sortKey="pnl"
                    sort={sort}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortableTh
                    label="R"
                    sortKey="rMultiple"
                    sort={sort}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <SortableTh
                    label="Status"
                    sortKey="status"
                    sort={sort}
                    onToggle={toggleSort}
                  />
                  <th className="text-tertiary px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wide">
                    Daily PD
                  </th>
                  <th className="text-tertiary px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wide">
                    1h PD
                  </th>
                  <th className="text-tertiary px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wide">
                    30m PD
                  </th>
                  <th className="text-tertiary px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wide">
                    Tags
                  </th>
                  <SortableTh
                    label="Date"
                    sortKey="entryTime"
                    sort={sort}
                    onToggle={toggleSort}
                    align="right"
                  />
                  <th className="text-tertiary px-3 py-2 text-right text-[10px] font-normal uppercase tracking-wide">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <TradeTableRow
                    key={t.id}
                    trade={t}
                    onSelect={() => setSelectedTrade(t)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTrade && (
        <TradeDetailModal
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  );
}

function TradeTableRow({
  trade,
  onSelect,
}: {
  trade: TradeRow;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className="border-hairline border-b transition-colors duration-150 last:border-b-0 hover:bg-surface-raised cursor-pointer"
    >
      <td className="text-primary px-3 py-2.5 font-medium">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hover:text-accent-signal text-left font-medium transition-colors focus:outline-none"
          >
            {trade.instrument}
          </button>
          {trade.images && trade.images.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-tertiary" title={`${trade.images.length} screenshots`}>
              <Camera size={11} className="text-secondary" />
              <span>{trade.images.length}</span>
            </span>
          )}
        </div>
      </td>
      <td className="text-secondary px-3 py-2.5">{capitalize(trade.direction)}</td>
      <td className="num px-3 py-2.5 text-right">{formatPrice(trade.entryPrice)}</td>
      <td className="num px-3 py-2.5 text-right">{formatPrice(trade.exitPrice)}</td>
      <td
        className={cn('num px-3 py-2.5 text-right', pnlColorClass(trade.pnl))}
        title={pnlTitle(trade)}
      >
        {formatPnlCell(trade.pnl)}
      </td>
      <td className={cn('num px-3 py-2.5 text-right', rColorClass(trade.rMultiple))}>
        {formatR(trade.rMultiple)}
      </td>
      <td className="text-secondary px-3 py-2.5">{capitalize(trade.status)}</td>
      <td className="text-secondary px-3 py-2.5 font-mono text-xs">
        {trade.dailyPdArray || <span className="text-tertiary">—</span>}
      </td>
      <td className="text-secondary px-3 py-2.5 font-mono text-xs">
        {trade.oneHourPdArray || <span className="text-tertiary">—</span>}
      </td>
      <td className="text-secondary px-3 py-2.5 font-mono text-xs">
        {trade.thirtyMinutePdArray || <span className="text-tertiary">—</span>}
      </td>
      <td className="px-3 py-2.5">
        {trade.tags.length === 0 ? (
          <span className="text-tertiary">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {trade.tags.map((tag) => (
              <span
                key={tag.id}
                className="border-hairline text-secondary rounded-card border px-1.5 py-0.5 text-[10px]"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="num px-3 py-2.5 text-right">{formatEntryDate(trade.entryTime)}</td>
      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
        <Link
          href={`/dashboard/trades/${trade.id}/edit`}
          className="text-tertiary hover:text-accent-signal inline-flex items-center rounded-card p-1 transition-colors duration-150"
          title="Edit trade"
        >
          <Pencil size={14} strokeWidth={1.75} />
        </Link>
      </td>
    </tr>
  );
}

/**
 * P&L cell text: sign-prefixed currency, e.g. +$120.00, −$45.50. The color
 * comes from the cell's className (pnlColorClass), not the string.
 */
function formatPnlCell(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Tooltip text for the P&L cell. When the trade has carrying costs, shows the
 * gross → net breakdown so the headline net number is auditable on hover.
 * Returns undefined (no title) when there are no costs.
 */
function pnlTitle(trade: TradeRow): string | undefined {
  const costs = (trade.commission ?? 0) + (trade.swap ?? 0) + (trade.fees ?? 0);
  if (costs === 0) return undefined;
  const fmt = (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
  return `Gross ${fmt(trade.grossPnl)} − commission ${fmt(trade.commission)} − swap ${fmt(trade.swap)} − fees ${fmt(trade.fees)} = Net ${fmt(trade.pnl)}`;
}

type Align = 'left' | 'right';

interface SortableThProps {
  label: string;
  sortKey: TradeSortKey;
  sort: TradeSort;
  onToggle: (key: TradeSortKey) => void;
  align?: Align;
}

function SortableTh({ label, sortKey, sort, onToggle, align = 'left' }: SortableThProps) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn(
        'px-3 py-2 text-[10px] font-normal uppercase tracking-wide',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors duration-150',
          align === 'right' ? 'flex-row-reverse' : '',
          active ? 'text-accent-signal' : 'hover:text-primary',
        )}
      >
        {label}
        <SortIcon active={active} direction={active ? sort.direction : null} />
      </button>
    </th>
  );
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: 'asc' | 'desc' | null;
}) {
  if (!active || direction == null) {
    return <ArrowUpDown size={10} strokeWidth={1.75} className="text-tertiary" />;
  }
  return direction === 'asc' ? (
    <ArrowUp size={10} strokeWidth={2} />
  ) : (
    <ArrowDown size={10} strokeWidth={2} />
  );
}

// ---------------------------------------------------------------------------
// Empty states — real instructional copy, no emoji, no filler.
// ---------------------------------------------------------------------------

/** No trades exist for this user at all. */
function NoTrades() {
  return (
    <div className="border-hairline bg-surface rounded-card border px-6 py-16 text-center">
      <p className="text-primary font-display text-sm">No trades logged</p>
      <p className="text-secondary mx-auto mt-2 max-w-sm text-sm">
        Log your first trade to populate this list. Entry, stop, and exit
        prices compute the R-multiple automatically.
      </p>
    </div>
  );
}

/** Trades exist, but the active filters matched nothing. */
function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="border-hairline bg-surface rounded-card border px-6 py-16 text-center">
      <p className="text-primary font-display text-sm">No matching trades</p>
      <p className="text-secondary mx-auto mt-2 max-w-sm text-sm">
        No trades match the current filters. Try widening the date range or
        clearing a filter.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="text-accent-signal mt-4 rounded-card px-3 py-2 text-xs transition-colors duration-150 hover:text-accent-signal/80"
      >
        Clear filters
      </button>
    </div>
  );
}
