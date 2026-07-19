'use client';

import React, { useState } from 'react';
import { BestTradeForm } from '@/components/best-trades/best-trade-form';
import { BestTradesList, type BestTradeItem } from '@/components/best-trades/best-trades-list';
import { Button } from '@/components/button';
import { Trophy, X } from 'lucide-react';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl border border-hairline bg-surface rounded-card p-5 relative max-h-[90vh] overflow-y-auto no-scrollbar">
            {/* Close Button */}
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute right-4 top-4 text-secondary hover:text-primary p-1 rounded-sm border border-hairline bg-base cursor-pointer z-10"
            >
              <X size={14} />
            </button>

            <h3 className="font-display text-base text-primary uppercase tracking-wide mb-1">
              Log Best Weekly Setup
            </h3>
            <p className="text-secondary text-xs mb-5">
              Record a high-performance setup with screenshots, PD array details, and notes.
            </p>

            <BestTradeForm 
              tradesList={tradesList} 
              onSuccess={() => setIsFormOpen(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
