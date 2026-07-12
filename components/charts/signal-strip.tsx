'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';

interface SignalStripProps {
  data: { time: string; value: number }[];
}

export function SignalStrip({ data }: SignalStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const finalValue = data.length > 0 ? data[data.length - 1].value : 0;
    const isGain = finalValue >= 0;
    const lineColor = data.length > 0 ? (isGain ? '#34D399' : '#F87171') : '#565D68';
    const topColor = data.length > 0 ? (isGain ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)') : 'rgba(86, 93, 104, 0.2)';
    const bottomColor = 'rgba(0, 0, 0, 0)';

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        visible: false,
      },
      timeScale: {
        visible: false,
      },
      crosshair: {
        mode: 2, // No crosshair
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    if (data.length > 0) {
      series.setData(data);
    } else {
      series.setData([
        { time: '2024-01-01', value: 0 },
        { time: '2024-01-02', value: 0 },
      ]);
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
  }, [data]);

  return <div ref={containerRef} className="h-full w-full" />;
}
