'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatPnl, pnlColorClass } from '@/lib/trades';
import type { StatTrade } from '@/lib/stats';
import { cn } from '@/lib/utils';

interface HourlyPnlChartProps {
  trades: ReadonlyArray<StatTrade>;
}

type TimezoneOption = 'nairobi' | 'newyork';

interface HourData {
  hour: number;
  label: string;
  pnl: number;
  count: number;
}

export function HourlyPnlChart({ trades }: HourlyPnlChartProps) {
  const [timezone, setTimezone] = useState<TimezoneOption>('nairobi');

  const timezoneLabel = timezone === 'nairobi' ? 'Nairobi (UTC+3)' : 'New York (EST/EDT)';
  const timezoneCode = timezone === 'nairobi' ? 'Africa/Nairobi' : 'America/New_York';

  const chartData = useMemo(() => {
    // Initialize 24 hours
    const hours: HourData[] = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i.toString().padStart(2, '0')}:00`,
      pnl: 0,
      count: 0,
    }));

    // Filter to closed trades with valid realized P&L and entry time
    const closedTrades = trades.filter(
      (t) => t.status !== 'open' && t.pnl != null && t.entryTime != null,
    );

    for (const t of closedTrades) {
      try {
        const date = new Date(t.entryTime!);
        if (Number.isNaN(date.getTime())) continue;

        // Determine hour in target timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour12: false,
          hour: '2-digit',
          timeZone: timezoneCode,
        });
        const parts = formatter.formatToParts(date);
        const hourPart = parts.find((p) => p.type === 'hour');
        
        if (hourPart) {
          const hourVal = parseInt(hourPart.value, 10) % 24;
          hours[hourVal].pnl += t.pnl!;
          hours[hourVal].count += 1;
        }
      } catch (err) {
        console.error('Error parsing trade time:', err);
      }
    }

    return hours;
  }, [trades, timezoneCode]);

  // Find best and worst hours to highlight or summarize
  const { bestHour, worstHour } = useMemo(() => {
    let best: HourData | null = null;
    let worst: HourData | null = null;

    for (const d of chartData) {
      if (d.count === 0) continue;
      if (!best || d.pnl > best.pnl) best = d;
      if (!worst || d.pnl < worst.pnl) worst = d;
    }

    return { bestHour: best, worstHour: worst };
  }, [chartData]);

  const hasData = chartData.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className="border-hairline bg-surface rounded-card border p-4 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-primary text-xs uppercase tracking-wide">
            Hourly Performance
          </h2>
        </div>
        <div className="flex h-64 w-full items-center justify-center">
          <p className="text-secondary text-sm">No trades available for hourly analysis.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-hairline bg-surface rounded-card border p-4 pt-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-primary text-xs uppercase tracking-wide">
            Hourly Performance
          </h2>
          <p className="text-secondary mt-1 text-xs">
            Net P&amp;L distribution by entry hour in {timezoneLabel}
          </p>
        </div>
        
        <div className="border-hairline bg-base flex rounded-card border w-56 p-0.5">
          <button
            type="button"
            onClick={() => setTimezone('nairobi')}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center px-3 py-1 text-xs transition-colors duration-150 rounded-[4px] font-sans font-medium',
              timezone === 'nairobi'
                ? 'text-accent-signal bg-surface-raised border border-hairline'
                : 'text-secondary hover:text-primary border border-transparent',
            )}
          >
            Nairobi
          </button>
          <button
            type="button"
            onClick={() => setTimezone('newyork')}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center px-3 py-1 text-xs transition-colors duration-150 rounded-[4px] font-sans font-medium',
              timezone === 'newyork'
                ? 'text-accent-signal bg-surface-raised border border-hairline'
                : 'text-secondary hover:text-primary border border-transparent',
            )}
          >
            New York
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="border-hairline bg-base rounded-card border px-4 py-3">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Best Hour</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="num text-primary font-mono text-sm">
              {bestHour ? bestHour.label : '—'}
            </span>
            <span className={cn('num font-mono text-sm font-semibold', bestHour ? pnlColorClass(bestHour.pnl) : 'text-secondary')}>
              {bestHour ? formatPnl(bestHour.pnl) : '—'}
            </span>
          </div>
        </div>

        <div className="border-hairline bg-base rounded-card border px-4 py-3">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Worst Hour</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="num text-primary font-mono text-sm">
              {worstHour ? worstHour.label : '—'}
            </span>
            <span className={cn('num font-mono text-sm font-semibold', worstHour ? pnlColorClass(worstHour.pnl) : 'text-secondary')}>
              {worstHour ? formatPnl(worstHour.pnl) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#242931" vertical={false} />
            <XAxis
              dataKey="label"
              tickFormatter={(value) => value.split(':')[0]}
              tick={{ fontFamily: 'var(--font-mono)', fill: '#8B93A1', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={(value) => `$${value}`}
              tick={{ fontFamily: 'var(--font-mono)', fill: '#565D68', fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              dx={-8}
            />
            <Tooltip
              cursor={{ fill: '#242931', opacity: 0.2 }}
              contentStyle={{
                backgroundColor: '#14171C',
                border: '1px solid #242931',
                borderRadius: '6px',
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                color: '#E8EAED',
                boxShadow: 'none',
              }}
              labelStyle={{ fontFamily: 'var(--font-mono)', color: '#8B93A1', marginBottom: '4px' }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const dataPoint = payload[0].payload as HourData;
                  return (
                    <div className="border-hairline bg-surface rounded-card border p-3 space-y-1">
                      <p className="num text-[11px] text-tertiary uppercase tracking-wider">{label} - {(dataPoint.hour + 1).toString().padStart(2, '0')}:00</p>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-secondary">Net P&amp;L:</span>
                        <span className={cn('num font-semibold', pnlColorClass(dataPoint.pnl))}>
                          {formatPnl(dataPoint.pnl)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-secondary">Trades:</span>
                        <span className="num text-primary">{dataPoint.count}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, index) => {
                const fill = entry.pnl > 0 ? '#34D399' : entry.pnl < 0 ? '#F87171' : '#565D68';
                return <Cell key={`cell-${index}`} fill={fill} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
