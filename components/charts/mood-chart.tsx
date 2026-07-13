'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface MoodChartProps {
  data: { date: string; mood: string; moodValue: number }[];
}

export function MoodChart({ data }: MoodChartProps) {
  // Custom dot to color based on mood value
  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    let fill = '#8B93A1'; // secondary
    if (payload.moodValue === 4) fill = '#34D399'; // gain (Disciplined)
    if (payload.moodValue === 3) fill = '#4FD1C5'; // signal (Hesitant)
    if (payload.moodValue === 2) fill = '#F5B841'; // alert (FOMO)
    if (payload.moodValue === 1) fill = '#F87171'; // loss (Revenge)

    return (
      <circle cx={cx} cy={cy} r={4} fill={fill} stroke="#14171C" strokeWidth={2} />
    );
  };

  return (
    <div className="border-hairline bg-surface rounded-card border w-full overflow-hidden p-4 flex flex-col h-[250px]">
      <h2 className="font-display text-primary mb-4 text-xs uppercase tracking-wide">
        Mood Over Time
      </h2>
      {data.length === 0 ? (
        <p className="text-sm text-tertiary">No mood data available yet.</p>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#242931" />
              <XAxis 
                dataKey="date" 
                stroke="#8B93A1" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => {
                  // val is YYYY-MM-DD -> MM/DD
                  return val.substring(5).replace('-', '/');
                }}
              />
              <YAxis 
                stroke="#8B93A1" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                domain={[0, 5]}
                ticks={[1, 2, 3, 4]}
                tickFormatter={(val) => {
                  if (val === 4) return 'Disciplined';
                  if (val === 3) return 'Hesitant';
                  if (val === 2) return 'FOMO';
                  if (val === 1) return 'Revenge';
                  return '';
                }}
              />
              <Tooltip 
                 cursor={{ stroke: '#242931', strokeWidth: 1, strokeDasharray: '3 3' }}
                 contentStyle={{ backgroundColor: '#14171C', border: '1px solid #242931', borderRadius: '6px' }}
                 itemStyle={{ color: '#E8EAED', fontFamily: 'var(--font-mono)' }}
                 labelStyle={{ color: '#8B93A1', marginBottom: '4px' }}
                 formatter={(value: any, name: any, props: any) => [props.payload.mood, 'Mood']}
                 labelFormatter={(label) => label}
              />
              <Line 
                type="monotone" 
                dataKey="moodValue" 
                stroke="#4FD1C5" 
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 6, fill: '#E8EAED', stroke: '#14171C', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
