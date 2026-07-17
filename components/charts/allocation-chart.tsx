'use client';

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { StatTrade } from '@/lib/stats';
import { cn } from '@/lib/utils';

interface AllocationChartProps {
  trades: ReadonlyArray<StatTrade>;
}

interface AllocationData {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

// Quiet, engineered cockpit-style color palette
const ALLOCATION_COLORS = [
  '#4FD1C5', // accent-signal (primary interactive cyan)
  '#8B93A1', // secondary text gray
  '#565D68', // tertiary text gray
  '#319795', // dark cyan/teal
  '#2C3539', // gunmetal gray
  '#4A5568', // slate gray
  '#1A202C', // deep charcoal
];

export function AllocationChart({ trades }: AllocationChartProps) {
  const { data, totalTrades } = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Process all trades (both open and closed)
    for (const t of trades) {
      if (!t.instrument) continue;
      const key = t.instrument.toUpperCase().trim();
      counts[key] = (counts[key] || 0) + 1;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    const sortedData = Object.entries(counts)
      .map(([name, count], index) => ({
        name,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);

    return { data: sortedData, totalTrades: total };
  }, [trades]);

  if (totalTrades === 0) {
    return (
      <div className="border-hairline bg-surface rounded-card border p-4 pt-6">
        <h2 className="font-display text-primary text-xs uppercase tracking-wide mb-4">
          Instrument Allocation
        </h2>
        <div className="flex h-64 w-full items-center justify-center">
          <p className="text-secondary text-sm">No trades available for allocation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-hairline bg-surface rounded-card border p-4 pt-6">
      <h2 className="font-display text-primary text-xs uppercase tracking-wide mb-1">
        Instrument Allocation
      </h2>
      <p className="text-secondary text-[11px] mb-6">
        Trade count distribution across instruments.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Donut Chart Visualizer */}
        <div className="relative h-44 w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={75}
                paddingAngle={2}
                dataKey="count"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#14171C" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const dataPoint = payload[0].payload as AllocationData;
                    return (
                      <div className="border-hairline bg-surface rounded-card border p-3 space-y-1">
                        <p className="font-display text-[11px] text-primary uppercase tracking-wider">{dataPoint.name}</p>
                        <div className="flex items-center justify-between gap-4 text-xs">
                          <span className="text-secondary">Trades:</span>
                          <span className="num text-primary font-semibold">{dataPoint.count}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-xs">
                          <span className="text-secondary">Allocation:</span>
                          <span className="num text-accent-signal font-semibold">{dataPoint.percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center readout overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="num font-display text-primary text-xl font-bold leading-none">
              {totalTrades}
            </span>
            <span className="text-tertiary text-[9px] uppercase tracking-wider mt-1">
              Total Trades
            </span>
          </div>
        </div>

        {/* Legend / Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-hairline/60">
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 font-normal">
                  Instrument
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Trades
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  % Alloc
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.name} className="border-b border-hairline/30 last:border-0 hover:bg-surface-raised/40 transition-colors duration-150">
                  <td className="py-2 flex items-center gap-2 text-xs font-sans text-primary">
                    <span 
                      className="w-1.5 h-1.5 rounded-sm shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    {item.name}
                  </td>
                  <td className="num py-2 text-right text-xs text-primary font-semibold">
                    {item.count}
                  </td>
                  <td className="num py-2 text-right text-xs text-secondary">
                    {item.percentage.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
