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
  tradeResultTag,
  sortTrades,
  calculateTradeRisk,
  formatRisk,
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  const visible = useMemo(() => {
    const filtered = filterTrades(trades, filters);
    return sortTrades(filtered, sort);
  }, [trades, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);

  const paginatedVisible = useMemo(() => {
    const start = (pageIndex - 1) * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, pageIndex, pageSize]);

  const hasAnyTrades = trades.length > 0;
  const hasFilters = !filtersAreEmpty(filters);

  function toggleSort(key: TradeSortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
    setCurrentPage(1);
  }

  function handleFilterChange(newFilters: TradeFilters) {
    setFilters(newFilters);
    setCurrentPage(1);
  }

  return (
    <div className="space-y-4">
      {hasAnyTrades ? (
        <TradeFiltersBar
          filters={filters}
          onChange={handleFilterChange}
          tags={tags}
          canClear={hasFilters}
          onClear={() => handleFilterChange(DEFAULT_FILTERS)}
        />
      ) : null}

      {visible.length === 0 ? (
        hasAnyTrades ? (
          <NoMatches onClear={() => handleFilterChange(DEFAULT_FILTERS)} />
        ) : (
          <NoTrades />
        )
      ) : (
        <div className="space-y-3">
          {/* Desktop Data Table (sm:block) */}
          <div className="hidden sm:block border-hairline bg-surface overflow-hidden rounded-card border">
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
                  {paginatedVisible.map((t) => (
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

          {/* Mobile Card Reflow View (< sm) */}
          <div className="block sm:hidden space-y-2.5">
            {paginatedVisible.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedTrade(t)}
                className="border border-hairline bg-surface hover:border-hairline/80 rounded-card p-3.5 space-y-2.5 cursor-pointer transition-colors duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-primary text-sm font-bold">
                      {t.instrument}
                    </span>
                    <span className="px-1.5 py-0.5 border border-hairline rounded text-[9px] font-mono text-secondary uppercase">
                      {t.direction}
                    </span>
                    <span className="px-1.5 py-0.5 border border-hairline rounded text-[9px] font-mono text-tertiary uppercase">
                      {t.status}
                    </span>
                  </div>
                  <span className="num text-tertiary text-xs font-mono">
                    {formatEntryDate(t.entryTime)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs border-y border-hairline/40 py-2">
                  <div>
                    <span className="text-tertiary text-[9px] uppercase tracking-wider block font-display">P&amp;L</span>
                    <span className={cn('num text-sm font-semibold', pnlColorClass(t.pnl))}>
                      {formatPnlCell(t.pnl)}
                    </span>
                  </div>
                  <div>
                    <span className="text-tertiary text-[9px] uppercase tracking-wider block font-display">R-Multiple</span>
                    <span className={cn('num text-sm font-semibold', rColorClass(t.rMultiple))}>
                      {formatR(t.rMultiple)}
                    </span>
                  </div>
                  <div>
                    <span className="text-tertiary text-[9px] uppercase tracking-wider block font-display">Entry Price</span>
                    <span className="num text-primary">{formatPrice(t.entryPrice, t.assetClass)}</span>
                  </div>
                  <div>
                    <span className="text-tertiary text-[9px] uppercase tracking-wider block font-display">Exit Price</span>
                    <span className="num text-primary">{formatPrice(t.exitPrice, t.assetClass)}</span>
                  </div>
                </div>

                {t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {t.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="border-hairline text-secondary rounded border px-1.5 py-0.5 text-[9px] uppercase font-mono"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-hairline bg-surface/40 rounded-card border px-4 py-2.5 text-xs">
              <span className="text-secondary font-mono text-xs">
                Page <span className="num text-primary font-semibold">{pageIndex}</span> of{' '}
                <span className="num text-primary font-semibold">{totalPages}</span>{' '}
                <span className="text-tertiary">({visible.length} trades)</span>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pageIndex <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-hairline bg-base text-secondary hover:text-primary rounded-card transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={pageIndex >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-hairline bg-base text-secondary hover:text-primary rounded-card transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
      <td className="num px-3 py-2.5 text-right">
        <div>{formatPrice(trade.entryPrice, trade.assetClass)}</div>
        {trade.entryPrice != null && trade.stopPrice != null && trade.size != null && (
          <div className="text-[10px] text-tertiary font-mono">
            {formatRisk(calculateTradeRisk(trade.instrument, trade.size, trade.entryPrice, trade.stopPrice, trade.assetClass))}
          </div>
        )}
      </td>
      <td className="num px-3 py-2.5 text-right">{formatPrice(trade.exitPrice, trade.assetClass)}</td>
      <td
        className={cn('num px-3 py-2.5 text-right', pnlColorClass(trade.pnl))}
        title={pnlTitle(trade)}
      >
        {formatPnlCell(trade.pnl)}
      </td>
      <td className={cn('num px-3 py-2.5 text-right', rColorClass(trade.rMultiple))}>
        {formatR(trade.rMultiple)}
      </td>
      <td className="text-secondary px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span>{capitalize(trade.status)}</span>
          {trade.status === 'closed' && (() => {
            const tag = tradeResultTag(trade.pnl);
            return tag ? <span className={tag.className}>{tag.label}</span> : null;
          })()}
        </div>
      </td>
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
