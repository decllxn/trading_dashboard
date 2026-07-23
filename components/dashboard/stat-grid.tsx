'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { MetricKey } from './metric-definitions';
import { MetricInfoModal, useMetricInfoModal } from './metric-info-modal';
import type { WinLossBreakdown } from '@/lib/stats';

interface StatGridProps {
  winRate: number;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  streak: number;
  winLossBreakdown?: WinLossBreakdown;
  /** When true the user has no closed trades — render an empty state. */
  empty?: boolean;
}

/**
 * Stat grid — the five core performance metrics below the Edge Score gauge.
 *
 * Each card is a hairline-bordered surface (no shadow per the design system),
 * with a tertiary uppercase label and the value in IBM Plex Mono via `.num`.
 * Values that are inherently signed (expectancy, streak) take their color from
 * the sign — but ONLY when they represent a real directional P&L quantity.
 *
 * Clicking any card opens a modal with the metric's definition, formula, and
 * a worked example.
 *
 * - Win rate: a ratio, not P&L -> neutral color, rendered as a percentage.
 * - Expectancy: an average dollar P&L per trade -> gain/loss colored by sign.
 * - Profit factor: a ratio >= 0 -> neutral; "\u2014" when undefined (no losses).
 * - Max drawdown: reported as a positive percentage -> neutral (it's a risk
 *   magnitude, not a signed P&L value, so gain/loss coloring would be
 *   misleading — a big drawdown isn't a "loss" in the P&L sense).
 * - Streak: a count, signed by direction -> the sign uses accent-signal for
 *   wins and loss for losing streaks, since a losing streak is the only
 *   place "loss" legitimately attaches to a non-dollar value (it directly
 *   describes losing trades).
 *
 * Design rule honored: gain/loss are reserved for real P&L; the streak's loss
 * color is the narrow exception because a losing streak literally counts
 * losing trades.
 */
export function StatGrid({
  winRate,
  expectancy,
  profitFactor,
  maxDrawdown,
  streak,
  winLossBreakdown,
  empty,
}: StatGridProps) {
  const { activeMetric, openMetric, closeMetric } = useMetricInfoModal();

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <FlippingWinRateCard
          winRate={winRate}
          winLossBreakdown={winLossBreakdown}
          empty={empty}
          onClick={() => openMetric('winRate')}
        />
        <StatCard
          label="Expectancy"
          value={empty || expectancy == null ? null : formatSignedCurrency(expectancy)}
          valueClass={expectancy == null || expectancy === 0 ? undefined : expectancy > 0 ? 'text-gain' : 'text-loss'}
          onClick={() => openMetric('expectancy')}
        />
        <StatCard
          label="Profit factor"
          value={empty || profitFactor == null ? null : profitFactor.toFixed(2)}
          onClick={() => openMetric('profitFactor')}
        />
        <StatCard
          label="Max drawdown"
          value={empty ? null : `${maxDrawdown.toFixed(1)}%`}
          onClick={() => openMetric('maxDrawdown')}
        />
        <StatCard
          label="Streak"
          value={empty ? null : formatStreak(streak)}
          valueClass={streak > 0 ? 'text-accent-signal' : streak < 0 ? 'text-loss' : undefined}
          onClick={() => openMetric('streak')}
        />
      </div>

      <MetricInfoModal
        metricKey={activeMetric}
        winLossBreakdown={winLossBreakdown}
        onClose={closeMetric}
      />
    </>
  );
}

function FlippingWinRateCard({
  winRate,
  winLossBreakdown,
  empty,
  onClick,
}: {
  winRate: number;
  winLossBreakdown?: WinLossBreakdown;
  empty?: boolean;
  onClick: () => void;
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const hasBreakEvens = !!(winLossBreakdown && winLossBreakdown.breakEvens > 0);

  useEffect(() => {
    if (empty || !hasBreakEvens) return;
    if (isHovered) return;

    const timer = setInterval(() => {
      setIsFlipped((prev: boolean) => !prev);
    }, 4500);

    return () => clearInterval(timer);
  }, [empty, hasBreakEvens, isHovered]);

  const stdValue = empty ? null : `${(winRate * 100).toFixed(1)}%`;
  const adjWinRate = winLossBreakdown ? winLossBreakdown.adjustedWinRate : winRate;
  const adjValue = empty ? null : `${(adjWinRate * 100).toFixed(1)}%`;

  const stdSubtext = empty || !winLossBreakdown
    ? undefined
    : `${winLossBreakdown.wins}W · ${winLossBreakdown.losses}L · ${winLossBreakdown.breakEvens}BE`;

  const adjSubtext = empty || !winLossBreakdown
    ? undefined
    : `Excludes ${winLossBreakdown.breakEvens} BE (${winLossBreakdown.wins}/${winLossBreakdown.wins + winLossBreakdown.losses})`;

  // If there are no break-even trades or empty state, render standard card
  if (empty || !hasBreakEvens) {
    return (
      <StatCard
        label="Win rate"
        value={stdValue}
        subtext={stdSubtext}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      className="relative min-h-[78px] w-full [perspective:1000px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full h-full min-h-[78px] rounded-card text-left transition-transform duration-700 [transform-style:preserve-3d] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-signal relative',
          isFlipped && '[transform:rotateY(180deg)]'
        )}
      >
        {/* Front Face (Standard Win Rate) */}
        <div className="absolute inset-0 p-3.5 sm:p-4 flex flex-col justify-between border-hairline bg-surface rounded-card border hover:bg-surface-raised transition-colors [backface-visibility:hidden] [-webkit-backface-visibility:hidden]">
          <div className="flex items-center justify-between">
            <p className="text-tertiary text-[10px] uppercase tracking-wide">Win rate (STD)</p>
            <span className="num text-[9px] text-tertiary font-mono bg-surface-raised border border-hairline px-1.5 py-0.5 rounded-sm">
              STD
            </span>
          </div>
          <p className="num text-primary mt-1 text-lg font-semibold">{stdValue ?? '—'}</p>
          {stdSubtext ? (
            <p className="num text-tertiary mt-1 text-[11px] font-normal tracking-tight truncate">
              {stdSubtext}
            </p>
          ) : null}
        </div>

        {/* Back Face (Adjusted Win Rate) */}
        <div className="absolute inset-0 p-3.5 sm:p-4 flex flex-col justify-between border border-accent-signal/40 bg-surface rounded-card hover:bg-surface-raised transition-colors [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="flex items-center justify-between">
            <p className="text-accent-signal text-[10px] uppercase tracking-wide font-medium">Win rate (ADJ)</p>
            <span className="num text-[9px] text-accent-signal font-mono bg-accent-signal/10 border border-accent-signal/30 px-1.5 py-0.5 rounded-sm">
              ADJ
            </span>
          </div>
          <p className="num text-accent-signal mt-1 text-lg font-bold">{adjValue ?? '—'}</p>
          {adjSubtext ? (
            <p className="num text-tertiary mt-1 text-[11px] font-normal tracking-tight truncate">
              {adjSubtext}
            </p>
          ) : null}
        </div>
      </button>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | null;
  subtext?: string;
  valueClass?: string;
  onClick: () => void;
}

function StatCard({ label, value, subtext, valueClass, onClick }: StatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-hairline bg-surface rounded-card border px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-signal cursor-pointer min-h-[78px] flex flex-col justify-between"
    >
      <p className="text-tertiary text-[10px] uppercase tracking-wide">{label}</p>
      <p className={cn('num text-primary mt-1.5 text-lg', valueClass)}>
        {value ?? '\u2014'}
      </p>
      {subtext ? (
        <p className="num text-tertiary mt-1 text-[11px] font-normal tracking-tight">
          {subtext}
        </p>
      ) : null}
    </button>
  );
}

/** Format a signed currency value, e.g. +$77.14, \u2212$30.00. */
function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Format the streak: positive -> "+N W" (wins), negative -> "\u2212N L" (losses),
 * zero -> "0". Single-letter suffix keeps the cell narrow in the grid.
 */
function formatStreak(streak: number): string {
  if (streak === 0) return '0';
  if (streak > 0) return `+${streak} W`;
  return `${streak} L`;
}
