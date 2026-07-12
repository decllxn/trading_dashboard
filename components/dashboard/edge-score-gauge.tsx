import { cn } from '@/lib/utils';

interface EdgeScoreGaugeProps {
  /** Score in [0, 100]. Values outside the range are clamped for the arc. */
  score: number;
  /**
   * When true, the user has no closed trades yet — render an empty state
   * instead of a misleading 0 arc (a 0 score from real losses looks the same
   * as "no data" otherwise).
   */
  empty?: boolean;
}

/**
 * Edge Score radial gauge — the dashboard hero element.
 *
 * A 270° arc (gap at the bottom, instrument-panel style) where the filled
 * portion represents the score out of 100. The arc is the ONE place the
 * design system permits accent-signal to carry visual weight (it's the
 * signature "glow" element), with the score number rendered large in Space
 * Grotesk at the center. Hairline track behind, no drop shadows.
 *
 * Geometry: the arc is drawn with two SVG circle strokes and a `pathLength`
 * normalization trick — setting `pathLength={100}` lets the stroke-dasharray
 * map 1:1 to the score percentage regardless of the arc's actual length, so
 * the math reads as "dash = score, gap = 100 − score."
 */
export function EdgeScoreGauge({ score, empty }: EdgeScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <div className="border-hairline bg-surface flex flex-col items-center rounded-card border px-6 py-8">
      <p className="text-tertiary mb-6 text-[10px] uppercase tracking-wide">
        Edge Score
      </p>
      <div className="relative h-44 w-44">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full -rotate-135"
          aria-label={`Edge Score ${empty ? 'not available' : `${clamped} of 100`}`}
          role="img"
        >
          {/* 270° arc track (hairline). The rotation above puts the gap at
              the bottom; the arc spans 75% of the circle (270/360). */}
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
          {/* Filled arc: dash = score% of the 75-unit visible arc. dashArray
              is expressed in pathLength units (100), so 0.75*score fills the
              right fraction of the visible track. */}
          {empty ? null : (
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              pathLength={100}
              className="stroke-accent-signal transition-[stroke-dasharray] duration-150"
              strokeDasharray={`${(clamped * 75) / 100} ${100 - (clamped * 75) / 100}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              'num font-display text-4xl',
              empty ? 'text-tertiary' : 'text-primary',
            )}
          >
            {empty ? '—' : clamped}
          </span>
          <span className="text-tertiary text-[10px] uppercase tracking-wide">
            / 100
          </span>
        </div>
      </div>
      <p className="text-secondary mt-6 max-w-xs text-center text-xs">
        {empty
          ? 'Log a closed trade to compute your Edge Score.'
          : 'Composite of win rate, expectancy, and consistency.'}
      </p>
    </div>
  );
}
