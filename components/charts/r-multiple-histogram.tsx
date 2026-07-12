'use client';

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

interface RMultipleHistogramProps {
  data: {
    bucket: number;
    label: string;
    count: number;
    isGain: boolean;
  }[];
}

export function RMultipleHistogram({ data }: RMultipleHistogramProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <p className="text-secondary text-sm">No trades available for distribution.</p>
      </div>
    );
  }

  return (
    <div className="border-hairline bg-surface rounded-card border p-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-primary text-xs uppercase tracking-wide">
          R-Multiple Distribution
        </h2>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#242931" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontFamily: 'var(--font-mono)', fill: '#E8EAED', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              dy={8}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontFamily: 'var(--font-mono)', fill: '#565D68', fontSize: 10 }}
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
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: '#E8EAED',
                boxShadow: 'none',
              }}
              itemStyle={{
                color: '#E8EAED',
              }}
              formatter={(value: any) => [value, 'Trades']}
              labelStyle={{ color: '#565D68', marginBottom: '4px' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.isGain ? '#34D399' : '#F87171'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
