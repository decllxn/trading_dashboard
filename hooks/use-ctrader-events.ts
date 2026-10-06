'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface CTraderEvent {
  type: string;
  data?: any;
  timestamp?: number;
}

export function useCTraderEvents() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<CTraderEvent | null>(null);
  const [latestBalance, setLatestBalance] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Clean up existing
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const es = new EventSource('/api/ctrader/events');
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onmessage = (e) => {
        try {
          if (!e.data || e.data.startsWith(':')) return;
          const parsed = JSON.parse(e.data);
          setLastEvent(parsed);

          if (parsed.type === 'balance:updated' && parsed.data?.balance != null) {
            setLatestBalance(parsed.data.balance);
            router.refresh();
          }

          if (parsed.type === 'trade:execution') {
            router.refresh();
          }
        } catch {
          // ignore heartbeats/non-json
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        // Reconnect after 5 seconds
        setTimeout(connect, 5000);
      };
    } catch (err) {
      console.warn('Failed to initialize cTrader EventSource:', err);
    }
  }, [router]);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    lastEvent,
    latestBalance,
  };
}
