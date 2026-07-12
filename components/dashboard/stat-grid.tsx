import { cn } from '@/lib/utils';

interface StatGridProps {
  winRate: number;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  streak: number;
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
 * - Win rate: a ratio, not P&L → neutral color, rendered as a percentage.
 * - Expectancy: an average dollar P&L per trade → gain/loss colored by sign.
 * - Profit factor: a ratio ≥ 0 → neutral; "—" when undefined (no losses).
 * - Max drawdown: reported as a positive percentage → neutral (it's a risk
 *   magnitude, not a signed P&L value, so gain/loss coloring would be
 *   misleading — a big drawdown isn't a "loss" in the P&L sense).
 * - Streak: a count, signed by direction → the sign uses accent-signal for
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
  empty,
}: StatGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Win rate" value={empty ? null : `${(winRate * 100).toFixed(1)}%`} />
      <StatCard
        label="Expectancy"
        value={empty || expectancy == null ? null : formatSignedCurrency(expectancy)}
        valueClass={expectancy == null || expectancy === 0 ? undefined : expectancy > 0 ? 'text-gain' : 'text-loss'}
      />
      <StatCard
        label="Profit factor"
        value={empty || profitFactor == null ? null : profitFactor.toFixed(2)}
      />
      <StatCard label="Max drawdown" value={empty ? null : `${maxDrawdown.toFixed(1)}%`} />
      <StatCard
        label="Streak"
        value={empty ? null : formatStreak(streak)}
        valueClass={streak > 0 ? 'text-accent-signal' : streak < 0 ? 'text-loss' : undefined}
      />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | null;
  valueClass?: string;
}

function StatCard({ label, value, valueClass }: StatCardProps) {
  return (
    <div className="border-hairline bg-surface rounded-card border px-4 py-3">
      <p className="text-tertiary text-[10px] uppercase tracking-wide">{label}</p>
      <p className={cn('num text-primary mt-2 text-lg', valueClass)}>
        {value ?? '—'}
      </p>
    </div>
  );
}

/** Format a signed currency value, e.g. +$77.14, −$30.00. */
function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Format the streak: positive → "+N W" (wins), negative → "−N L" (losses),
 * zero → "0". Single-letter suffix keeps the cell narrow in the grid.
 */
function formatStreak(streak: number): string {
  if (streak === 0) return '0';
  if (streak > 0) return `+${streak} W`;
  return `${streak} L`;
}
