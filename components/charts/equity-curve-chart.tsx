'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, IChartApi } from 'lightweight-charts';

interface EquityCurveChartProps {
  /** Account equity over time: starting capital + running cumulative P&L. */
  data: { time: string; value: number }[];
  /** The user's starting capital, shown as the baseline. */
  startingBalance: number;
  /** When true, no closed trades exist yet — show an empty state. */
  empty?: boolean;
}

/**
 * Account equity curve — the dashboard's primary performance chart.
 *
 * Plots actual account equity (starting capital + cumulative closed-trade P&L)
 * in account currency, not a normalized % return. The area is gain/loss
 * colored by whether the current equity is above or below the starting
 * balance, so the curve reads as "in profit" / "under water" at a glance.
 *
 * Empty state: when there are no closed trades, the chart shows a centered
 * prompt instead of a flat baseline, so the slot is never a confusing empty
 * panel.
 */
export function EquityCurveChart({
  data,
  startingBalance,
  empty,
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
  }, [data, startingBalance, hasData]);

  const finalEquity = hasData ? data[data.length - 1].value : startingBalance;
  const delta = finalEquity - startingBalance;
  const isGain = delta >= 0;

  return (
    <div className="border-hairline bg-surface rounded-card border w-full overflow-hidden p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-primary text-xs uppercase tracking-wide">
            Account Equity
          </h2>
          <p className="text-secondary mt-1 text-[11px]">
            Starting capital + cumulative closed-trade P&amp;L.
          </p>
        </div>
        <div className="flex items-center gap-6">
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
              Net P&amp;L
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
              ? 'Log a closed trade to build your equity curve.'
              : 'No equity data yet.'}
          </p>
        </div>
      )}
    </div>
  );
}
