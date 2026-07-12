'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickSeries,
} from 'lightweight-charts';
import type { Trade } from '@/db/schema';
import type { ChartAnnotation } from '@/db/schema';
import { saveTradeAnnotations } from '@/app/dashboard/trades/actions';

interface TradeChartProps {
  trade: Trade;
  initialAnnotations: ChartAnnotation[];
  sessionsEnabled: boolean;
}

export function TradeChart({ trade, initialAnnotations, sessionsEnabled }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [annotations, setAnnotations] = useState<ChartAnnotation[]>(initialAnnotations);
  const [drawingMode, setDrawingMode] = useState<'none' | 'fvg' | 'ob'>('none');

  // Drawing state
  const drawingState = useRef<{
    time1: number | null;
    price1: number | null;
  }>({ time1: null, price1: null });

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#565D68',
        fontFamily: 'var(--font-sans)',
      },
      grid: {
        vertLines: { color: '#242931' },
        horzLines: { color: '#242931' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#242931',
      },
      rightPriceScale: {
        borderColor: '#242931',
      },
      crosshair: {
        vertLine: { color: '#565D68', labelBackgroundColor: '#14171C' },
        horzLine: { color: '#565D68', labelBackgroundColor: '#14171C' },
      },
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34D399',
      downColor: '#F87171',
      borderVisible: false,
      wickUpColor: '#34D399',
      wickDownColor: '#F87171',
    });
    seriesRef.current = series;

    // Generate mock OHLC data around trade entry
    const baseTime = trade.entryTime ? new Date(trade.entryTime).getTime() : Date.now();
    const basePrice = trade.entryPrice ? Number(trade.entryPrice) : 100;
    
    const mockData = [];
    let currentPrice = basePrice;
    
    // Generate 100 candles before and 100 candles after
    const stepMs = 15 * 60 * 1000; // 15m
    let startTime = baseTime - 100 * stepMs;
    
    for (let i = 0; i < 200; i++) {
      const time = Math.floor((startTime + i * stepMs) / 1000) as Time;
      const volatility = currentPrice * 0.002;
      const open = currentPrice;
      const high = open + Math.random() * volatility;
      const low = open - Math.random() * volatility;
      const close = low + Math.random() * (high - low);
      
      mockData.push({ time, open, high, low, close });
      currentPrice = close;
    }
    
    series.setData(mockData);

    if (trade.entryPrice) {
      series.createPriceLine({
        price: Number(trade.entryPrice),
        color: '#4FD1C5',
        lineWidth: 1,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: 'Entry',
      });
    }
    if (trade.exitPrice) {
      const isGain = trade.pnl ? Number(trade.pnl) >= 0 : Number(trade.exitPrice) >= Number(trade.entryPrice);
      series.createPriceLine({
        price: Number(trade.exitPrice),
        color: isGain ? '#34D399' : '#F87171',
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Exit',
      });
    }

    // Stop and Target Lines
    if (trade.stopPrice) {
      series.createPriceLine({
        price: Number(trade.stopPrice),
        color: '#F87171',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'SL',
      });
    }
    if (trade.targetPrice) {
      series.createPriceLine({
        price: Number(trade.targetPrice),
        color: '#34D399',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'TP',
      });
    }

    // Handle Resize
    const handleResize = () => {
      chart.applyOptions({ width: containerRef.current?.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    // Drawing Tool Interaction
    const clickHandler = (param: any) => {
      if (!param.point || !param.time) return;
      if (drawingMode === 'none') return;

      const time = param.time as number;
      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      if (drawingState.current.time1 === null) {
        drawingState.current = { time1: time, price1: price };
      } else {
        const newAnnotation: ChartAnnotation = {
          id: Math.random().toString(36).substring(7),
          type: drawingMode,
          time1: drawingState.current.time1,
          price1: drawingState.current.price1!,
          time2: time,
          price2: price,
        };
        const updated = [...annotations, newAnnotation];
        setAnnotations(updated);
        saveTradeAnnotations(trade.id, updated);

        // Reset
        drawingState.current = { time1: null, price1: null };
        setDrawingMode('none');
      }
    };
    chart.subscribeClick(clickHandler);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeClick(clickHandler);
      chart.remove();
    };
  }, [trade, drawingMode, annotations]);

  // Sync annotations rendering via HTML overlay since simple Canvas primitive API takes extra boilerplate.
  // Using requestAnimationFrame to sync positions continuously.
  const overlayRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    let animationFrame: number;
    const updateOverlays = () => {
      if (!chartRef.current || !seriesRef.current || !overlayRef.current) return;
      const chart = chartRef.current;
      const series = seriesRef.current;
      
      const rects = overlayRef.current.children;
      for (let i = 0; i < annotations.length; i++) {
        const anno = annotations[i];
        const el = rects[i] as HTMLElement;
        if (!el) continue;

        const x1 = chart.timeScale().timeToCoordinate(anno.time1 as Time);
        const x2 = chart.timeScale().timeToCoordinate(anno.time2 as Time);
        const y1 = series.priceToCoordinate(anno.price1);
        const y2 = series.priceToCoordinate(anno.price2);

        if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);
          const top = Math.min(y1, y2);
          const bottom = Math.max(y1, y2);
          
          el.style.left = `${left}px`;
          el.style.top = `${top}px`;
          el.style.width = `${Math.max(1, right - left)}px`;
          el.style.height = `${Math.max(1, bottom - top)}px`;
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      }
      animationFrame = requestAnimationFrame(updateOverlays);
    };
    
    updateOverlays();
    return () => cancelAnimationFrame(animationFrame);
  }, [annotations]);

  // Session Shading (HTML Overlay)
  useEffect(() => {
    if (!sessionsEnabled || !overlayRef.current || !chartRef.current) return;
    let animationFrame: number;
    // We would render dynamic session bands here based on time scale visible range
    // For simplicity, we just leave the frame loop running if we were to compute session rects
  }, [sessionsEnabled]);

  const handleDeleteAnnotation = (id: string) => {
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    saveTradeAnnotations(trade.id, updated);
  };

  return (
    <div className="relative h-full w-full bg-base flex flex-col border-hairline border rounded-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-hairline bg-surface">
        <button
          onClick={() => setDrawingMode(drawingMode === 'fvg' ? 'none' : 'fvg')}
          className={`px-3 py-1.5 text-xs rounded-card transition-colors ${
            drawingMode === 'fvg' ? 'bg-accent-signal text-base' : 'text-secondary hover:text-primary hover:bg-surface-raised'
          }`}
        >
          Draw FVG
        </button>
        <button
          onClick={() => setDrawingMode(drawingMode === 'ob' ? 'none' : 'ob')}
          className={`px-3 py-1.5 text-xs rounded-card transition-colors ${
            drawingMode === 'ob' ? 'bg-accent-signal text-base' : 'text-secondary hover:text-primary hover:bg-surface-raised'
          }`}
        >
          Draw OB
        </button>
        {drawingMode !== 'none' && (
          <span className="text-[10px] text-tertiary ml-2">Click chart twice to draw</span>
        )}
      </div>

      <div className="relative flex-1" ref={containerRef}>
        <div ref={overlayRef} className="absolute inset-0 pointer-events-none overflow-hidden z-10">
          {annotations.map((anno) => (
            <div
              key={anno.id}
              className={`absolute pointer-events-auto cursor-pointer border ${
                anno.type === 'fvg' ? 'bg-gain/20 border-gain/50' : 'bg-loss/20 border-loss/50'
              }`}
              onDoubleClick={() => handleDeleteAnnotation(anno.id)}
              title="Double click to delete"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
