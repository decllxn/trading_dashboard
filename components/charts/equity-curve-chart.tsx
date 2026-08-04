'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, IChartApi } from 'lightweight-charts';

export interface CapitalTransactionItem {
  id?: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  date: string;
}

interface EquityCurveChartProps {
  /** Account equity over time: starting capital + running cumulative P&L + cashflows. */
  data: { time: string; value: number }[];
  /** The user's starting capital, shown as the baseline. */
  startingBalance: number;
  /** When true, no closed trades exist yet — show an empty state. */
  empty?: boolean;
  netCashflow?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  capitalTransactions?: CapitalTransactionItem[];
}

export function EquityCurveChart({
  data,
  startingBalance,
  empty,
  netCashflow = 0,
  totalDeposits = 0,
  totalWithdrawals = 0,
  capitalTransactions = [],
}: EquityCurveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const hasData = data.length > 0;

  useEffect(() => {
    if (!hasData || !chartContainerRef.current) return;

    const finalValue = data[data.length - 1].value;
    const isGain = finalValue >= startingBalance;
    const lineColor = isGain ? '#34D399' : '#F87171';
    const topColor = isGain
      ? 'rgba(52, 211, 153, 0.18)'
      : 'rgba(248, 113, 113, 0.18)';
    const bottomColor = 'rgba(0, 0, 0, 0)';

    const chart: IChartApi = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8B93A1',
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#242931' },
        horzLines: { color: '#242931' },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
      crosshair: {
        vertLine: { color: '#565D68', width: 1, style: 3 },
        horzLine: { color: '#565D68', width: 1, style: 3 },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: false,
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) =>
          `$${price.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })}`,
      },
      lastValueVisible: true,
      priceLineVisible: false,
    });

    series.setData(data);

    // Render cashflow markers on timeline if capitalTransactions exist
    if (capitalTransactions.length > 0) {
      const markers = capitalTransactions
        .map((tx) => {
          const isDeposit = tx.type === 'deposit';
          const dateStr = new Date(tx.date).toISOString().split('T')[0];
          const amountStr = Number(tx.amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
          return {
            time: dateStr,
            position: isDeposit ? ('belowBar' as const) : ('aboveBar' as const),
            color: isDeposit ? '#34D399' : '#F87171',
            shape: isDeposit ? ('arrowUp' as const) : ('arrowDown' as const),
            text: `${isDeposit ? '+ Dep' : '− Wdr'} $${amountStr}`,
          };
        })
        .sort((a, b) => a.time.localeCompare(b.time));

      try {
        (series as any).setMarkers(markers);
      } catch (err) {
        console.warn('Failed to set markers on EquityCurveChart:', err);
      }
    }

    // Baseline at the starting balance so the gain/loss region is clear.
    series.createPriceLine({
      price: startingBalance,
      color: '#565D68',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'Start',
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 280,
        });
      }
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, startingBalance, hasData, capitalTransactions]);

  const finalEquity = hasData ? data[data.length - 1].value : startingBalance;
  const delta = finalEquity - startingBalance;
  const isGain = delta >= 0;

  return (
    <div className="border-hairline bg-surface rounded-card border w-full overflow-hidden p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-primary text-xs uppercase tracking-wide flex items-center gap-2">
            <span>Account Equity Curve</span>
            {(totalDeposits > 0 || totalWithdrawals > 0) && (
              <span className="text-[10px] normal-case px-2 py-0.5 rounded-full bg-accent-signal/15 text-accent-signal font-mono border border-accent-signal/30">
                Cashflow Adjusted
              </span>
            )}
          </h2>
          <p className="text-secondary mt-1 text-[11px]">
            Starting capital + net cash flows (+ deposits / − withdrawals) + cumulative P&amp;L.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          {(totalDeposits > 0 || totalWithdrawals > 0) && (
            <div>
              <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                Net Cash Flow
              </span>
              <span className={`num text-sm font-semibold ${netCashflow >= 0 ? 'text-gain' : 'text-loss'}`}>
                {netCashflow >= 0 ? '+' : '−'}${Math.abs(netCashflow).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div>
            <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
              Current Equity
            </span>
            <span className="num text-primary text-sm font-semibold">
              ${finalEquity.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
              Total Delta
            </span>
            <span
              className={`num text-sm font-semibold ${isGain ? 'text-gain' : 'text-loss'}`}
            >
              {isGain ? '+' : '−'}${Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {hasData ? (
        <div ref={chartContainerRef} className="h-[280px] w-full" />
      ) : (
        <div className="flex h-[280px] w-full items-center justify-center">
          <p className="text-secondary text-sm">
            {empty
              ? 'Log a closed trade or deposit to build your equity curve.'
              : 'No equity data yet.'}
          </p>
        </div>
      )}
    </div>
  );
}
