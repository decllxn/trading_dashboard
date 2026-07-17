'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import type { StatTrade } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { pnlColorClass, formatR } from '@/lib/trades';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface TradingCalendarProps {
  trades: ReadonlyArray<StatTrade>;
}

interface DayInfo {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  dateKey: string;
}

interface DailySummary {
  pnl: number;
  rMultiple: number;
  count: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Helper to format date keys in local timezone
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Custom P&L formatting helper for calendar cells
function formatCalendarPnl(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs === 0) return '$0';
  if (abs >= 1000) {
    const kVal = abs / 1000;
    return `${sign}$${kVal.toFixed(kVal % 1 === 0 ? 0 : 2)}K`;
  }
  return `${sign}$${abs.toFixed(abs % 1 === 0 ? 0 : 2)}`;
}

export function TradingCalendar({ trades }: TradingCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const selectedDateLabel = useMemo(() => {
    if (!selectedDateKey) return '';
    const [y, m, d] = selectedDateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDateKey]);

  const selectedDateTrades = useMemo(() => {
    if (!selectedDateKey) return [];
    return trades.filter((t) => {
      if (t.status === 'open' || t.pnl == null || t.entryTime == null) return false;
      const date = new Date(t.entryTime);
      return !Number.isNaN(date.getTime()) && getLocalDateKey(date) === selectedDateKey;
    });
  }, [trades, selectedDateKey]);

  const selectedDateTotals = useMemo(() => {
    let pnl = 0;
    let rMultiple = 0;
    let count = 0;
    for (const t of selectedDateTrades) {
      pnl += t.pnl || 0;
      rMultiple += t.rMultiple || 0;
      count += 1;
    }
    return { pnl, rMultiple, count };
  }, [selectedDateTrades]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthLabel = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const resetToToday = () => {
    setCurrentDate(new Date());
  };

  // 1. Group closed trades by local date key
  const dailyData = useMemo(() => {
    const map = new Map<string, DailySummary>();

    const closedTrades = trades.filter(
      (t) => t.status !== 'open' && t.pnl != null && t.entryTime != null,
    );

    for (const t of closedTrades) {
      try {
        const date = new Date(t.entryTime!);
        if (Number.isNaN(date.getTime())) continue;

        const dateKey = getLocalDateKey(date);
        const existing = map.get(dateKey) || { pnl: 0, rMultiple: 0, count: 0 };

        existing.pnl += t.pnl!;
        existing.rMultiple += t.rMultiple || 0;
        existing.count += 1;

        map.set(dateKey, existing);
      } catch (err) {
        console.error('Error grouping trade for calendar:', err);
      }
    }

    return map;
  }, [trades]);

  // 2. Generate calendar weeks grid (each week is 7 DayInfo objects)
  const grid = useMemo(() => {
    const weeks: DayInfo[][] = [];
    
    // First day of current month
    const firstDay = new Date(year, month, 1);
    // Day of the week (0-6) of the first day
    const startDayOfWeek = firstDay.getDay();
    
    // Total days in current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Trailing days of previous month
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    let currentWeek: DayInfo[] = [];

    // Fill previous month trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDay = prevMonthDays - i;
      const prevDate = new Date(year, month - 1, prevDay);
      currentWeek.push({
        date: prevDate,
        dayNumber: prevDay,
        isCurrentMonth: false,
        dateKey: getLocalDateKey(prevDate),
      });
    }

    // Fill current month days
    for (let d = 1; d <= daysInMonth; d++) {
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      const date = new Date(year, month, d);
      currentWeek.push({
        date,
        dayNumber: d,
        isCurrentMonth: true,
        dateKey: getLocalDateKey(date),
      });
    }

    // Fill next month leading days
    let nextMonthDay = 1;
    while (currentWeek.length < 7) {
      const nextDate = new Date(year, month + 1, nextMonthDay);
      currentWeek.push({
        date: nextDate,
        dayNumber: nextMonthDay,
        isCurrentMonth: false,
        dateKey: getLocalDateKey(nextDate),
      });
      nextMonthDay++;
    }
    weeks.push(currentWeek);

    // If we have less than 6 rows, we can add one more week to make the calendar height stable
    if (weeks.length < 6) {
      currentWeek = [];
      for (let i = 0; i < 7; i++) {
        const nextDate = new Date(year, month + 1, nextMonthDay);
        currentWeek.push({
          date: nextDate,
          dayNumber: nextMonthDay,
          isCurrentMonth: false,
          dateKey: getLocalDateKey(nextDate),
        });
        nextMonthDay++;
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [year, month]);

  return (
    <div className="border-hairline bg-surface rounded-card border p-4 pt-6">
      {/* Calendar Header Controls */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prevMonth}
            className="border-hairline bg-base hover:text-accent-signal flex h-8 w-8 items-center justify-center rounded-card border transition-colors duration-150 cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          
          <h2 className="font-display text-primary text-sm font-semibold min-w-[120px] text-center uppercase tracking-wide">
            {monthLabel}
          </h2>

          <button
            type="button"
            onClick={nextMonth}
            className="border-hairline bg-base hover:text-accent-signal flex h-8 w-8 items-center justify-center rounded-card border transition-colors duration-150 cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={resetToToday}
          className="border-hairline bg-base text-secondary hover:text-accent-signal rounded-card border px-3 py-1.5 text-xs transition-colors duration-150 cursor-pointer font-sans font-medium"
        >
          This Month
        </button>
      </div>

      {/* Grid Layout */}
      <div className="w-full">
        {/* Column Headers */}
        <div className="grid grid-cols-8 gap-1.5 mb-2 border-b border-hairline/60 pb-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-tertiary text-center text-[10px] uppercase tracking-wider font-display"
            >
              {day}
            </div>
          ))}
          <div className="text-accent-signal text-center text-[10px] uppercase tracking-wider font-display">
            Weekly
          </div>
        </div>

        {/* Calendar Rows */}
        <div className="space-y-1.5">
          {grid.map((week, wIndex) => {
            // Compute weekly summary metrics
            let weeklyPnl = 0;
            let weeklyR = 0;
            let weeklyCount = 0;

            for (const day of week) {
              const summary = dailyData.get(day.dateKey);
              if (summary) {
                weeklyPnl += summary.pnl;
                weeklyR += summary.rMultiple;
                weeklyCount += summary.count;
              }
            }

            return (
              <div key={`week-${wIndex}`} className="grid grid-cols-8 gap-1.5">
                {/* 7 Days of the Week */}
                {week.map((day) => {
                  const summary = dailyData.get(day.dateKey);
                  const hasTrades = summary && summary.count > 0;
                  
                  // Color codes following DESIGN_SYSTEM.md guidelines
                  let cellBgClass = 'bg-base/30 border-hairline';
                  let pnlColor = 'text-primary';

                  if (hasTrades) {
                    if (summary.pnl > 0) {
                      cellBgClass = 'bg-[#34D399]/5 border-[#34D399]/20 hover:bg-[#34D399]/10';
                      pnlColor = 'text-gain';
                    } else if (summary.pnl < 0) {
                      cellBgClass = 'bg-[#F87171]/5 border-[#F87171]/20 hover:bg-[#F87171]/10';
                      pnlColor = 'text-loss';
                    } else {
                      // Neutral / Scratch days (profit == 0 but trades taken)
                      cellBgClass = 'bg-[#4FD1C5]/5 border-[#4FD1C5]/20 hover:bg-[#4FD1C5]/10';
                      pnlColor = 'text-accent-signal';
                    }
                  }

                  return (
                    <div
                      key={day.dateKey}
                      onClick={() => hasTrades && setSelectedDateKey(day.dateKey)}
                      className={cn(
                        'relative flex min-h-[84px] flex-col justify-between border rounded-card p-2 transition-colors duration-150',
                        cellBgClass,
                        !day.isCurrentMonth && 'opacity-30',
                        hasTrades && 'cursor-pointer hover:border-accent-signal/40'
                      )}
                    >
                      {/* Day Number Label */}
                      <span className="text-secondary text-[10px] font-mono leading-none align-top">
                        {day.dayNumber}
                      </span>

                      {/* Day Stats (only visible if trades were executed) */}
                      {hasTrades ? (
                        <div className="mt-1 flex flex-col items-end w-full">
                          {/* Daily PnL */}
                          <span className={cn('num text-xs font-bold leading-tight font-mono', pnlColorClass(summary.pnl))}>
                            {formatCalendarPnl(summary.pnl)}
                          </span>
                          
                          {/* Trades count and realized R */}
                          <div className="mt-1 flex flex-col items-end text-[9px] text-tertiary font-mono space-y-0.5 leading-none">
                            <span className="num">
                              {summary.count} {summary.count === 1 ? 'trade' : 'trades'}
                            </span>
                            <span className={cn('num font-medium', summary.rMultiple > 0 ? 'text-gain' : summary.rMultiple < 0 ? 'text-loss' : 'text-tertiary')}>
                              {summary.rMultiple > 0 ? '+' : ''}
                              {summary.rMultiple.toFixed(1)}R
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="h-8" /> /* Spacing placeholder */
                      )}
                    </div>
                  );
                })}

                {/* 8th Column: Weekly Metrics Summary */}
                <div
                  className={cn(
                    'border-hairline bg-base flex min-h-[84px] flex-col justify-between rounded-card border p-2 text-right',
                    weeklyCount > 0 && weeklyPnl > 0 && 'border-[#34D399]/20 bg-[#34D399]/5',
                    weeklyCount > 0 && weeklyPnl < 0 && 'border-[#F87171]/20 bg-[#F87171]/5'
                  )}
                >
                  <span className="text-tertiary text-[9px] uppercase tracking-wider font-display font-medium leading-none">
                    Metrics
                  </span>

                  {weeklyCount > 0 ? (
                    <div className="mt-2 flex flex-col items-end w-full">
                      <span className={cn('num text-xs font-bold leading-tight font-mono', pnlColorClass(weeklyPnl))}>
                        {formatCalendarPnl(weeklyPnl)}
                      </span>
                      
                      <div className="mt-1 flex flex-col items-end text-[9px] text-tertiary font-mono space-y-0.5 leading-none">
                        <span className="num">
                          {weeklyCount} {weeklyCount === 1 ? 'trade' : 'trades'}
                        </span>
                        <span className={cn('num font-semibold', weeklyR > 0 ? 'text-gain' : weeklyR < 0 ? 'text-loss' : 'text-tertiary')}>
                          {weeklyR > 0 ? '+' : ''}
                          {weeklyR.toFixed(1)}R
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span className="num text-tertiary text-xs font-mono">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={selectedDateKey !== null} onOpenChange={(open) => !open && setSelectedDateKey(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Trades on {selectedDateLabel}</DialogTitle>
            <DialogDescription>
              Review executions, net P&amp;L, and R-multiple scores realized on this day.
            </DialogDescription>
          </DialogHeader>

          {/* Totals Summary */}
          <div className="grid grid-cols-3 gap-3 my-4">
            <div className="border-hairline bg-base rounded-card border px-4 py-3">
              <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display mb-1">
                Net P&amp;L
              </span>
              <span className={cn('num text-base font-semibold font-mono', pnlColorClass(selectedDateTotals.pnl))}>
                {formatCalendarPnl(selectedDateTotals.pnl)}
              </span>
            </div>
            <div className="border-hairline bg-base rounded-card border px-4 py-3">
              <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display mb-1">
                Daily R-Multiple
              </span>
              <span className={cn('num text-base font-semibold font-mono', selectedDateTotals.rMultiple > 0 ? 'text-gain' : selectedDateTotals.rMultiple < 0 ? 'text-loss' : 'text-tertiary')}>
                {selectedDateTotals.rMultiple > 0 ? '+' : ''}{selectedDateTotals.rMultiple.toFixed(2)}R
              </span>
            </div>
            <div className="border-hairline bg-base rounded-card border px-4 py-3">
              <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display mb-1">
                Total Executions
              </span>
              <span className="num text-primary text-base font-semibold font-mono">
                {selectedDateTotals.count} {selectedDateTotals.count === 1 ? 'trade' : 'trades'}
              </span>
            </div>
          </div>

          {/* Details Table */}
          <div className="border-hairline bg-base rounded-card border overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline/60 bg-surface/50">
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal">
                    Instrument
                  </th>
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal">
                    Direction
                  </th>
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal text-right">
                    Size
                  </th>
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal text-right">
                    Entry Price
                  </th>
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal text-right">
                    Exit Price
                  </th>
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal text-right">
                    Net P&amp;L
                  </th>
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal text-right">
                    R
                  </th>
                  <th className="text-tertiary text-[9px] uppercase tracking-wider font-display px-4 py-3 font-normal text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedDateTrades.map((trade) => (
                  <tr key={trade.id} className="border-b border-hairline/30 last:border-0 hover:bg-surface-raised/40 transition-colors duration-150">
                    <td className="px-4 py-3 text-xs font-sans text-primary font-medium">
                      {trade.instrument}
                    </td>
                    <td className="px-4 py-3 text-xs font-sans">
                      <span className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[3px] border',
                        trade.direction === 'long' 
                          ? 'text-gain bg-[#34D399]/5 border-[#34D399]/15' 
                          : 'text-loss bg-[#F87171]/5 border-[#F87171]/15'
                      )}>
                        {trade.direction}
                      </span>
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-primary font-mono">
                      {trade.size != null ? trade.size.toFixed(2) : '—'}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-secondary font-mono">
                      {trade.entryPrice != null ? trade.entryPrice.toFixed(2) : '—'}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-secondary font-mono">
                      {trade.exitPrice != null ? trade.exitPrice.toFixed(2) : '—'}
                    </td>
                    <td className={cn('num px-4 py-3 text-right text-xs font-semibold font-mono', pnlColorClass(trade.pnl))}>
                      {trade.pnl != null ? (trade.pnl > 0 ? '+' : '') + trade.pnl.toFixed(2) : '—'}
                    </td>
                    <td className={cn('num px-4 py-3 text-right text-xs font-semibold font-mono', trade.rMultiple && trade.rMultiple > 0 ? 'text-gain' : trade.rMultiple && trade.rMultiple < 0 ? 'text-loss' : 'text-tertiary')}>
                      {trade.rMultiple != null ? (trade.rMultiple > 0 ? '+' : '') + trade.rMultiple.toFixed(2) + 'R' : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      <Link 
                        href={`/dashboard/trades/${trade.id}`}
                        className="text-accent-signal hover:underline inline-flex items-center gap-1 font-medium cursor-pointer"
                      >
                        View <ArrowUpRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
