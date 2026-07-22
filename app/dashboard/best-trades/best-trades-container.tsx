'use client';

import React, { useState } from 'react';
import { BestTradeForm } from '@/components/best-trades/best-trade-form';
import { BestTradesList, type BestTradeItem } from '@/components/best-trades/best-trades-list';
import { Button } from '@/components/button';
import { Trophy, X } from 'lucide-react';

import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

interface TradeOption {
  id: string;
  instrument: string;
  entryTime: string | null;
  pnl: string | null;
  rMultiple: string | null;
}

interface BestTradesContainerProps {
  bestTradesList: ReadonlyArray<BestTradeItem>;
  tradesList: ReadonlyArray<TradeOption>;
}

export function BestTradesContainer({ bestTradesList, tradesList }: BestTradesContainerProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  useBodyScrollLock(isFormOpen);

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-row items-center justify-between border-b border-hairline/60 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary uppercase tracking-wide flex items-center gap-2">
            <Trophy className="h-6 w-6 text-accent-signal shrink-0" />
            Best Trades of the Week
          </h1>
          <p className="text-secondary text-xs mt-1">
            Build your private playbook of high-quality model setups, executions, and technical case studies.
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>Log Setup</Button>
      </div>

      {/* Main List */}
      <BestTradesList items={bestTradesList} />

      {/* Form Modal Dialog */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-2xl border border-hairline bg-surface rounded-card max-h-[85vh] flex flex-col overflow-hidden relative shadow-none">
            {/* Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-hairline bg-surface px-4 py-3 sm:px-6 shrink-0">
              <div>
                <h3 className="font-display text-base text-primary uppercase tracking-wide">
                  Log Best Weekly Setup
                </h3>
                <p className="text-secondary text-[11px] mt-0.5">
                  Record a high-performance setup with screenshots, PD array details, and notes.
                </p>
              </div>

              <button
                onClick={() => setIsFormOpen(false)}
                aria-label="Close form modal"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-secondary hover:text-primary rounded-card border border-hairline bg-base cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar">
              <BestTradeForm 
                tradesList={tradesList} 
                onSuccess={() => setIsFormOpen(false)}
                onCancel={() => setIsFormOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
