'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { EdgeScoreDetails } from '@/lib/stats';

interface EdgeScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  details?: EdgeScoreDetails;
  empty?: boolean;
}

export function EdgeScoreModal({ isOpen, onClose, details, empty }: EdgeScoreModalProps) {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl font-display text-primary">
            Edge Score Calculation &amp; Breakdown
          </DialogTitle>
          <DialogDescription className="text-secondary text-xs sm:text-sm leading-relaxed mt-1">
            The Edge Score evaluates the statistical quality of your trading system on a 0–100 scale by combining three independent dimensions.
          </DialogDescription>
        </DialogHeader>

        {details && !empty ? (
          <div className="mt-4 space-y-4">
            {/* Live Comparison Header */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-card border border-hairline bg-surface-raised/50 p-3.5 text-center">
                <p className="text-[10px] text-tertiary uppercase tracking-wider font-semibold">
                  Standard Edge Score
                </p>
                <p className="num text-primary font-bold text-2xl mt-1">
                  {details.score} <span className="text-tertiary text-xs font-normal">/ 100</span>
                </p>
                <p className="text-[10px] text-tertiary mt-0.5">Includes all closed trades</p>
              </div>

              <div className="rounded-card border border-accent-signal/40 bg-accent-signal/5 p-3.5 text-center">
                <p className="text-[10px] text-accent-signal uppercase tracking-wider font-semibold">
                  Adjusted Edge Score
                </p>
                <p className="num text-accent-signal font-bold text-2xl mt-1">
                  {details.adjustedScore} <span className="text-accent-signal/70 text-xs font-normal">/ 100</span>
                </p>
                <p className="text-[10px] text-tertiary mt-0.5">Using Adjusted Win Rate (Excludes BE)</p>
              </div>
            </div>

            {/* Formula Breakdown */}
            <div className="border-hairline bg-surface rounded-card border p-4 space-y-3">
              <span className="text-tertiary text-[10px] uppercase tracking-wide font-medium block">
                Component Weights &amp; Live Contributions
              </span>

              <div className="space-y-3 text-xs">
                {/* Win Rate Component */}
                <div className="border-b border-hairline/60 pb-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">1. Win Component (35% Weight)</span>
                    <span className="num font-mono text-tertiary">
                      Std: {(details.winComponent * 35).toFixed(1)} pts · Adj: {(details.adjustedWinComponent * 35).toFixed(1)} pts
                    </span>
                  </div>
                  <p className="text-tertiary text-[11px] mt-1 leading-relaxed">
                    Evaluates win rate on [0, 1]. Standard win rate ({(details.rawWinRate * 100).toFixed(1)}%) contributes {(details.winComponent * 35).toFixed(1)} pts. Adjusted win rate ({(details.adjustedWinRate * 100).toFixed(1)}%) contributes {(details.adjustedWinComponent * 35).toFixed(1)} pts.
                  </p>
                </div>

                {/* Expectancy Component */}
                <div className="border-b border-hairline/60 pb-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">2. Expectancy Component (35% Weight)</span>
                    <span className="num font-mono text-tertiary">
                      {(details.expectancyComponent * 35).toFixed(1)} pts
                    </span>
                  </div>
                  <p className="text-tertiary text-[11px] mt-1 leading-relaxed">
                    Expectancy of {details.expectancy != null ? `${details.expectancy >= 0 ? '+' : ''}$${details.expectancy.toFixed(2)}` : '—'}/trade normalized against $100 anchor (clamp[exp / $100] = {(details.expectancyComponent * 100).toFixed(1)}%).
                  </p>
                </div>

                {/* Consistency Component */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">3. Consistency / Profit Factor (30% Weight)</span>
                    <span className="num font-mono text-tertiary">
                      {(details.consistencyComponent * 30).toFixed(1)} pts
                    </span>
                  </div>
                  <p className="text-tertiary text-[11px] mt-1 leading-relaxed">
                    Profit Factor of {details.profitFactor != null ? details.profitFactor.toFixed(2) : '—'} normalized against 2.0 anchor (clamp[PF / 2.0] = {(details.consistencyComponent * 100).toFixed(1)}%).
                  </p>
                </div>
              </div>
            </div>

            {/* Exact Formula Code */}
            <div>
              <h3 className="text-tertiary mb-2 text-[10px] sm:text-xs uppercase tracking-wide font-medium">
                Mathematical Formula
              </h3>
              <div className="border-hairline rounded-card border bg-base px-4 py-3 overflow-x-auto">
                <pre className="num text-primary whitespace-pre-wrap text-xs leading-relaxed">
                  {`Edge Score = 100 × (
  0.35 × WinRateComponent +
  0.35 × clamp(Expectancy / $100, 0, 1) +
  0.30 × clamp(ProfitFactor / 2.0, 0, 1)
)`}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 border-hairline rounded-card border bg-surface p-6 text-center">
            <p className="text-secondary text-sm">
              Log closed trades to view your detailed Edge Score breakdown.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
