'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { EdgeScoreDetails } from '@/lib/stats';
import { EdgeScoreModal } from './edge-score-modal';

interface EdgeScoreGaugeProps {
  /** Standard Score in [0, 100]. */
  score: number;
  /** Detailed breakdown object including adjusted score */
  details?: EdgeScoreDetails;
  /** When true, the user has no closed trades yet */
  empty?: boolean;
}

export function EdgeScoreGauge({ score, details, empty }: EdgeScoreGaugeProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const stdScore = details ? details.score : score;
  const adjScore = details ? details.adjustedScore : score;
  const hasDiff = details ? details.score !== details.adjustedScore : false;

  useEffect(() => {
    if (empty || !hasDiff) return;
    if (isHovered) return;

    const timer = setInterval(() => {
      setIsFlipped((prev: boolean) => !prev);
    }, 5500);

    return () => clearInterval(timer);
  }, [empty, hasDiff, isHovered]);

  const renderGaugeArc = (val: number, isAdj: boolean) => {
    const clamped = Math.max(0, Math.min(100, val));
    return (
      <div className="relative h-40 w-40 sm:h-44 sm:w-44 my-2">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full -rotate-135"
          aria-label={`Edge Score ${empty ? 'not available' : `${clamped} of 100`}`}
          role="img"
        >
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            pathLength={100}
            className="stroke-hairline"
            strokeDasharray="75 25"
          />
          {empty ? null : (
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              pathLength={100}
              className={cn(
                'transition-[stroke-dasharray] duration-500',
                isAdj ? 'stroke-accent-signal' : 'stroke-accent-signal/80'
              )}
              strokeDasharray={`${(clamped * 75) / 100} ${100 - (clamped * 75) / 100}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'num font-display text-4xl font-bold',
              empty ? 'text-tertiary' : isAdj ? 'text-accent-signal' : 'text-primary'
            )}
          >
            {empty ? '—' : clamped}
          </span>
          <span className="text-tertiary text-[10px] uppercase tracking-wide">
            / 100
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className="relative w-full h-[310px] [perspective:1000px]"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={cn(
            'w-full h-full rounded-card text-left transition-transform duration-700 [transform-style:preserve-3d] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-signal relative',
            isFlipped && '[transform:rotateY(180deg)]'
          )}
        >
          {/* Front Face (Standard Edge Score) */}
          <div className="absolute inset-0 border-hairline bg-surface flex flex-col items-center justify-between rounded-card border px-6 py-6 hover:bg-surface-raised transition-colors [backface-visibility:hidden] [-webkit-backface-visibility:hidden]">
            <div className="flex items-center justify-between w-full">
              <p className="text-tertiary text-[10px] uppercase tracking-wide">
                Edge Score
              </p>
              <span className="num text-[9px] text-tertiary font-mono bg-surface-raised border border-hairline px-1.5 py-0.5 rounded-sm">
                STD
              </span>
            </div>

            {renderGaugeArc(stdScore, false)}

            <p className="text-secondary max-w-xs text-center text-xs">
              {empty
                ? 'Log a closed trade to compute your Edge Score.'
                : 'Composite of win rate, expectancy, and consistency.'}
            </p>
          </div>

          {/* Back Face (Adjusted Edge Score) */}
          <div className="absolute inset-0 border border-accent-signal/40 bg-surface flex flex-col items-center justify-between rounded-card border px-6 py-6 hover:bg-surface-raised transition-colors [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="flex items-center justify-between w-full">
              <p className="text-accent-signal text-[10px] uppercase tracking-wide font-semibold">
                Edge Score (Adjusted)
              </p>
              <span className="num text-[9px] text-accent-signal font-mono bg-accent-signal/10 border border-accent-signal/30 px-1.5 py-0.5 rounded-sm">
                ADJ
              </span>
            </div>

            {renderGaugeArc(adjScore, true)}

            <p className="text-secondary max-w-xs text-center text-xs">
              Computed using Adjusted Win Rate (excluding BE).
            </p>
          </div>
        </button>
      </div>

      <EdgeScoreModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        details={details}
        empty={empty}
      />
    </>
  );
}
