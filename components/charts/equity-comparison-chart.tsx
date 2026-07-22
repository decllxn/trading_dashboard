'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, AreaSeries, LineSeries } from 'lightweight-charts';
import { Maximize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface EquityComparisonChartProps {
  userReturnSeries: { time: string; value: number }[]; // normalized % return
  spyReturnSeries: { time: string; value: number }[];  // normalized % return
  currentStats: {
    alpha: number | null;
    beta: number | null;
    correlation: number | null;
  } | null;
}

export function EquityComparisonChart({
  userReturnSeries,
  spyReturnSeries,
  currentStats,
}: EquityComparisonChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart following design system tokens
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8B93A1', // var(--secondary)
        fontFamily: 'var(--font-mono), ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#242931' }, // var(--hairline)
        horzLines: { color: '#242931' }, // var(--hairline)
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      crosshair: {
        vertLine: {
          color: '#565D68', // var(--tertiary)
          width: 1,
          style: 3,
        },
        horzLine: {
          color: '#565D68',
          width: 1,
          style: 3,
        },
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

    // User Equity Curve Area Series (% return)
    const userFinal = userReturnSeries.length > 0 ? userReturnSeries[userReturnSeries.length - 1].value : 0;
    const isGain = userFinal >= 0;
    
    const userLineColor = isGain ? '#34D399' : '#F87171'; // gain / loss ONLY for performance
    const userTopColor = isGain ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)';
    const userBottomColor = 'rgba(0, 0, 0, 0)';

    const userSeries = chart.addSeries(AreaSeries, {
      lineColor: userLineColor,
      topColor: userTopColor,
      bottomColor: userBottomColor,
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(2)}%`,
      },
      title: 'Your Equity',
    });

    if (userReturnSeries.length > 0) {
      userSeries.setData(userReturnSeries);
    }

    // SPY Benchmark Line Series (% return)
    const spySeries = chart.addSeries(LineSeries, {
      color: '#8B93A1', // Secondary text grey for neutral benchmark
      lineWidth: 1,
      lineStyle: 2, // Dashed line style
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(2)}%`,
      },
      title: 'SPY Benchmark',
    });

    if (spyReturnSeries.length > 0) {
      spySeries.setData(spyReturnSeries);
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

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
  }, [userReturnSeries, spyReturnSeries]);

  const hasStats = currentStats !== null;

  return (
    <div className="border-hairline bg-surface rounded-card border w-full overflow-hidden p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="font-display text-primary text-xs uppercase tracking-wide">
              Equity Curve vs SPY Buy & Hold
            </h2>
            <p className="text-secondary mt-1 text-[11px]">
              Comparison normalized to % return from initial capital.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="text-tertiary hover:text-accent-signal transition-colors duration-150 p-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-signal rounded-sm cursor-pointer"
            aria-label="Enlarge chart"
          >
            <Maximize2 size={13} strokeWidth={1.75} />
          </button>
        </div>

        {/* Small Stat Row */}
        <div className="flex flex-wrap items-center gap-6 sm:border-l sm:border-hairline/60 sm:pl-6">
          <div>
            <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
              Alpha (Daily)
            </span>
            <span className="num text-primary text-xs font-semibold">
              {hasStats && currentStats.alpha !== null
                ? (currentStats.alpha > 0 ? '+' : '') + currentStats.alpha.toFixed(4)
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
              Beta
            </span>
            <span className="num text-primary text-xs font-semibold">
              {hasStats && currentStats.beta !== null
                ? currentStats.beta.toFixed(3)
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
              Correlation
            </span>
            <span className="num text-primary text-xs font-semibold">
              {hasStats && currentStats.correlation !== null
                ? currentStats.correlation.toFixed(3)
                : '—'}
            </span>
          </div>
        </div>
      </div>

      <div 
        ref={chartContainerRef} 
        className="h-[250px] w-full"
      />

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Equity Curve vs SPY Buy & Hold (Enlarged)</DialogTitle>
            <DialogDescription>
              Performance comparison normalized to % return since inception.
            </DialogDescription>
          </DialogHeader>

          {/* Large Stat Cards Grid */}
          <div className="grid grid-cols-3 gap-3 my-4">
            <div className="border-hairline bg-base rounded-card border px-4 py-3">
              <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display mb-1">
                Alpha (Daily)
              </span>
              <span className="num text-primary text-base font-semibold">
                {hasStats && currentStats.alpha !== null
                  ? (currentStats.alpha > 0 ? '+' : '') + currentStats.alpha.toFixed(4)
                  : '—'}
              </span>
              <span className="text-tertiary block text-[9px] mt-1">
                Daily excess return generated relative to the benchmark.
              </span>
            </div>
            <div className="border-hairline bg-base rounded-card border px-4 py-3">
              <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display mb-1">
                Beta
              </span>
              <span className="num text-primary text-base font-semibold">
                {hasStats && currentStats.beta !== null
                  ? currentStats.beta.toFixed(3)
                  : '—'}
              </span>
              <span className="text-tertiary block text-[9px] mt-1">
                Relative volatility factor against benchmark moves (1.0 = equal).
              </span>
            </div>
            <div className="border-hairline bg-base rounded-card border px-4 py-3">
              <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display mb-1">
                Correlation
              </span>
              <span className="num text-primary text-base font-semibold">
                {hasStats && currentStats.correlation !== null
                  ? currentStats.correlation.toFixed(3)
                  : '—'}
              </span>
              <span className="text-tertiary block text-[9px] mt-1">
                Directional linear dependency score between curves (-1 to +1).
              </span>
            </div>
          </div>

          <div className="border-hairline bg-base rounded-card border p-4">
            <EnlargedChart 
              userReturnSeries={userReturnSeries} 
              spyReturnSeries={spyReturnSeries} 
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface EnlargedChartProps {
  userReturnSeries: { time: string; value: number }[];
  spyReturnSeries: { time: string; value: number }[];
}

function EnlargedChart({ userReturnSeries, spyReturnSeries }: EnlargedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
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
        timeVisible: true,
      },
      crosshair: {
        vertLine: {
          color: '#565D68',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: '#565D68',
          width: 1,
          style: 3,
        },
      },
    });

    const userFinal = userReturnSeries.length > 0 ? userReturnSeries[userReturnSeries.length - 1].value : 0;
    const isGain = userFinal >= 0;
    
    const userLineColor = isGain ? '#34D399' : '#F87171';
    const userTopColor = isGain ? 'rgba(52, 211, 153, 0.1)' : 'rgba(248, 113, 113, 0.1)';
    const userBottomColor = 'rgba(0, 0, 0, 0)';

    const userSeries = chart.addSeries(AreaSeries, {
      lineColor: userLineColor,
      topColor: userTopColor,
      bottomColor: userBottomColor,
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(2)}%`,
      },
      title: 'Your Equity',
    });

    if (userReturnSeries.length > 0) {
      userSeries.setData(userReturnSeries);
    }

    const spySeries = chart.addSeries(LineSeries, {
      color: '#8B93A1',
      lineWidth: 1,
      lineStyle: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(2)}%`,
      },
      title: 'SPY Benchmark',
    });

    if (spyReturnSeries.length > 0) {
      spySeries.setData(spyReturnSeries);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [userReturnSeries, spyReturnSeries]);

  return <div ref={containerRef} className="h-[400px] w-full" />;
}
