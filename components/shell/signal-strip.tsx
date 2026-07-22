'use client';

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignalStripProps {
  startingBalance?: number;
  currentBalance?: number;
  pnlPoints?: Array<{ time: string; value: number }>;
}

export function SignalStrip({
  startingBalance = 10000,
  currentBalance,
  pnlPoints = [],
}: SignalStripProps) {
  const balance = currentBalance ?? startingBalance;
  const delta = balance - startingBalance;
  const isGain = delta >= 0;

  // Generate SVG path points for micro sparkline
  const sparklinePath = useMemo(() => {
    if (!pnlPoints || pnlPoints.length === 0) {
      // Flat baseline line
      return { path: 'M 0 12 L 200 12', isPositive: true };
    }

    const values = pnlPoints.map((p) => p.value);
    const min = Math.min(...values, startingBalance);
    const max = Math.max(...values, startingBalance);
    const range = max - min === 0 ? 1 : max - min;

    const width = 160;
    const height = 20;

    const points = pnlPoints.map((p, i) => {
      const x = (i / Math.max(pnlPoints.length - 1, 1)) * width;
      const y = height - ((p.value - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return {
      path: `M ${points.join(' L ')}`,
      isPositive: (pnlPoints[pnlPoints.length - 1]?.value ?? startingBalance) >= startingBalance,
    };
  }, [pnlPoints, startingBalance]);

  return (
    <div className="border-hairline bg-surface/90 backdrop-blur-xs flex h-8 w-full items-center justify-between border-b px-4 text-[11px] sm:px-6 select-none shrink-0 z-20">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2 items-center justify-center">
          <span className="bg-accent-signal absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
          <span className="bg-accent-signal relative inline-flex h-1.5 w-1.5 rounded-full" />
        </span>
        <span className="font-display text-[10px] font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
          <Activity size={11} className="text-accent-signal" />
          EQUITY SIGNAL STRIP
        </span>
      </div>

      {/* Center micro sparkline graph */}
      <div className="hidden sm:flex items-center gap-3">
        <span className="text-[10px] font-mono text-tertiary">30D CURVE</span>
        <svg className="h-5 w-40 overflow-visible" viewBox="0 0 160 20" fill="none">
          <path
            d={sparklinePath.path}
            stroke={sparklinePath.isPositive ? '#34D399' : '#F87171'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Right P&L quick indicator */}
      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="text-tertiary text-[10px] font-sans">NET EQUITY:</span>
        <span className="num font-semibold text-primary">
          ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span
          className={cn(
            'num font-semibold flex items-center gap-0.5 text-[11px]',
            isGain ? 'text-gain' : 'text-loss',
          )}
        >
          {isGain ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {isGain ? '+' : '−'}${Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
