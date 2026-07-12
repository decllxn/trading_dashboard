'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, AreaSeries } from 'lightweight-charts';

interface EquityCurveChartProps {
  data: { time: string; value: number }[];
}

export function EquityCurveChart({ data }: EquityCurveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#E8EAED', // var(--primary)
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
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

    const finalValue = data.length > 0 ? data[data.length - 1].value : 0;
    const isGain = finalValue >= 0;
    
    const lineColor = isGain ? '#34D399' : '#F87171';
    const topColor = isGain ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)';
    const bottomColor = 'rgba(0, 0, 0, 0)';

    const newSeries = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    if (data.length > 0) {
      newSeries.setData(data);
    }
    
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = newSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

  return (
    <div className="border-hairline bg-surface rounded-card border w-full overflow-hidden p-4">
      <h2 className="font-display text-primary mb-4 text-xs uppercase tracking-wide">
        Equity Curve
      </h2>
      <div 
        ref={chartContainerRef} 
        className="h-[250px] w-full"
      />
    </div>
  );
}
