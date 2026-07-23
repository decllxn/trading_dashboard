'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { MetricKey } from './metric-definitions';
import { getMetricDefinition } from './metric-definitions';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import type { WinLossBreakdown } from '@/lib/stats';

interface MetricInfoModalProps {
  metricKey: MetricKey | null;
  winLossBreakdown?: WinLossBreakdown;
  onClose: () => void;
}

/**
 * Modal that displays the definition, formula, and a worked example for a
 * performance metric. Opened when the user clicks a stat card on the dashboard.
 *
 * Content is pulled from the static `METRIC_DEFINITIONS` registry. The modal
 * renders formula and example text in IBM Plex Mono (`.num`) with preserved
 * whitespace so multi-line formulas and examples align correctly.
 */
export function MetricInfoModal({ metricKey, winLossBreakdown, onClose }: MetricInfoModalProps) {
  useBodyScrollLock(metricKey !== null);
  const definition = metricKey ? getMetricDefinition(metricKey) : undefined;

  return (
    <Dialog open={metricKey !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {definition ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-display text-primary">
                {definition.name}
              </DialogTitle>
              <DialogDescription className="text-secondary text-xs sm:text-sm leading-relaxed mt-1">
                {definition.definition}
              </DialogDescription>
            </DialogHeader>

            {metricKey === 'winRate' && winLossBreakdown && winLossBreakdown.total > 0 ? (
              <div className="mt-4 border-hairline rounded-card border bg-surface-raised/40 p-3.5 sm:p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-tertiary text-[10px] sm:text-xs uppercase tracking-wide font-medium">
                      Live Trade Breakdown
                    </span>
                    <span className="px-1.5 py-0.5 rounded border border-hairline bg-surface text-[10px] font-mono text-tertiary">
                      Cutoff: ±${winLossBreakdown.threshold.toFixed(2)}
                    </span>
                  </div>
                  <span className="num text-tertiary text-xs font-mono">
                    {winLossBreakdown.total} Closed Trades
                  </span>
                </div>

                {/* Visual Distribution Bar */}
                <div className="space-y-1.5">
                  <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-base border border-hairline p-0.5">
                    {winLossBreakdown.winPct > 0 ? (
                      <div
                        style={{ width: `${winLossBreakdown.winPct}%` }}
                        className="bg-accent-signal rounded-l-full transition-all"
                        title={`Wins: ${winLossBreakdown.wins} (${winLossBreakdown.winPct.toFixed(1)}%)`}
                      />
                    ) : null}
                    {winLossBreakdown.bePct > 0 ? (
                      <div
                        style={{ width: `${winLossBreakdown.bePct}%` }}
                        className="bg-tertiary/50 transition-all"
                        title={`Break Evens: ${winLossBreakdown.breakEvens} (${winLossBreakdown.bePct.toFixed(1)}%)`}
                      />
                    ) : null}
                    {winLossBreakdown.lossPct > 0 ? (
                      <div
                        style={{ width: `${winLossBreakdown.lossPct}%` }}
                        className="bg-loss rounded-r-full transition-all"
                        title={`Losses: ${winLossBreakdown.losses} (${winLossBreakdown.lossPct.toFixed(1)}%)`}
                      />
                    ) : null}
                  </div>
                </div>

                {/* Count Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-card border border-gain/30 bg-gain/5 p-2.5 text-center">
                    <p className="text-[10px] sm:text-xs text-gain uppercase tracking-wider font-semibold">Wins</p>
                    <p className="num text-gain font-bold text-base sm:text-lg mt-0.5">{winLossBreakdown.wins}</p>
                    <p className="num text-gain/80 text-[10px] sm:text-xs">{winLossBreakdown.winPct.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-card border border-hairline bg-surface p-2.5 text-center">
                    <p className="text-[10px] sm:text-xs text-tertiary uppercase tracking-wider font-semibold">Break Evens</p>
                    <p className="num text-primary font-bold text-base sm:text-lg mt-0.5">{winLossBreakdown.breakEvens}</p>
                    <p className="num text-tertiary text-[10px] sm:text-xs">{winLossBreakdown.bePct.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-card border border-loss/30 bg-loss/5 p-2.5 text-center">
                    <p className="text-[10px] sm:text-xs text-loss uppercase tracking-wider font-semibold">Losses</p>
                    <p className="num text-loss font-bold text-base sm:text-lg mt-0.5">{winLossBreakdown.losses}</p>
                    <p className="num text-loss/80 text-[10px] sm:text-xs">{winLossBreakdown.lossPct.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Rates comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-hairline/60">
                  <div className="rounded-card border border-hairline bg-surface p-3">
                    <p className="text-tertiary text-[10px] uppercase tracking-wide font-medium">Standard Win Rate</p>
                    <p className="num text-primary font-bold text-lg mt-0.5">
                      {(winLossBreakdown.winRate * 100).toFixed(1)}%
                    </p>
                    <p className="text-tertiary text-[11px] mt-0.5">
                      Wins / Total Trades ({winLossBreakdown.wins}/{winLossBreakdown.total})
                    </p>
                  </div>
                  <div className="rounded-card border border-accent-signal/30 bg-accent-signal/5 p-3">
                    <p className="text-accent-signal text-[10px] uppercase tracking-wide font-medium">Adjusted Win Rate</p>
                    <p className="num text-accent-signal font-bold text-lg mt-0.5">
                      {(winLossBreakdown.adjustedWinRate * 100).toFixed(1)}%
                    </p>
                    <p className="text-tertiary text-[11px] mt-0.5">
                      Wins / Decisive Trades ({winLossBreakdown.wins}/{winLossBreakdown.wins + winLossBreakdown.losses})
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-tertiary mb-2 text-[10px] sm:text-xs uppercase tracking-wide font-medium">
                  Formula
                </h3>
                <div className="border-hairline rounded-card border bg-base px-4 py-3 overflow-x-auto">
                  <pre className="num text-primary whitespace-pre-wrap text-xs leading-relaxed">
                    {definition.formula}
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-tertiary mb-2 text-[10px] sm:text-xs uppercase tracking-wide font-medium">
                  Example
                </h3>
                <div className="border-hairline rounded-card border bg-base px-4 py-3 overflow-x-auto">
                  <pre className="num text-secondary whitespace-pre-wrap text-xs leading-relaxed">
                    {definition.example}
                  </pre>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook that manages the open/close state for metric info modals. Returns the
 * currently-selected metric key (null = closed) and a setter to open/close.
 */
export function useMetricInfoModal() {
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);

  return {
    activeMetric,
    openMetric: (key: MetricKey) => setActiveMetric(key),
    closeMetric: () => setActiveMetric(null),
  } as const;
}
