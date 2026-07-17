/**
 * Pure trading-statistics functions (Phase 5a).
 *
 * Every function here is side-effect-free: it takes a trades array (or a
 * derived series) and returns a number. Nothing reads the DOM, the clock, or
 * the database. That purity is what makes the hand-verified unit test in
 * stats.test.ts meaningful — the formulas are pinned to known answers, so a
 * future refactor that breaks the math fails CI instead of silently corrupting
 * the dashboard.
 *
 * INPUT CONTRACT
 * --------------
 * Functions take `StatTrade` — the minimal subset of `TradeRow` (lib/trades.ts)
 * needed to compute stats: a signed P&L, an optional R-multiple, an optional
 * entry timestamp, and a status. The dashboard maps its full `TradeRow[]`
 * into this shape; passing the superset directly also works because TS checks
 * structurally. Only CLOSED trades with a non-null P&L count toward the stats
 * — an open trade has no realized result and including it would be noise.
 *
 * CONVENTIONS
 * -----------
 * - P&L is a signed account-currency amount; sign drives gain/loss.
 * - R-multiple is signed (positive = win in R terms).
 * - Sharpe/Sortino are annualized from a DAILY P&L series (√252), the standard
 *   convention for daily-return ratios. Risk-free rate is treated as 0.
 * - Max drawdown is computed on the cumulative-P&L equity curve and reported
 *   as a positive percentage (a 20% drop → 20), or 0 when there is no drop.
 */
/** Minimal trade shape consumed by stat functions (subset of TradeRow). */
export interface StatTrade {
  /**
   * Signed realized P&L in account currency. Callers should pass NET P&L
   * (gross − commission − swap − fees) so every stat reflects true realized
   * result; use `computeNetPnl` to derive it from the raw trade columns.
   * Null = not yet realized.
   */
  pnl: number | null;
  /** Signed R-multiple. Null when entry/stop/exit are incomplete. */
  rMultiple?: number | null;
  /** ISO entry timestamp. Null trades land on an "unknown day" bucket. */
  entryTime?: string | null;
  /** Only 'closed' trades contribute to realized stats. */
  status?: string;
  /** Per-trade carrying costs. Optional: present when the caller wants the
   *  raw components available alongside the (already-net) `pnl`. */
  commission?: number | null;
  swap?: number | null;
  fees?: number | null;
  /** Ticker / symbol name (e.g. AAPL, XAUUSD) for allocation analysis. */
  instrument?: string | null;
}

/**
 * Derive net P&L from a trade's gross P&L and its carrying costs.
 * Net = gross − commission − swap − fees. Costs are treated as 0 when null.
 * Returns null only when gross P&L is null (the trade isn't realized yet) —
 * null costs on a realized trade still yield a (gross) number, never null.
 *
 * This is the single place the net-P&L formula lives, so the form preview, the
 * trade list, the detail page, and the stats layer all agree.
 */
export function computeNetPnl(
  grossPnl: number | null,
  commission: number | null,
  swap: number | null,
  fees: number | null,
): number | null {
  if (grossPnl == null) return null;
  const costs =
    (commission ?? 0) + (swap ?? 0) + (fees ?? 0);
  return grossPnl - costs;
}

/** Number of trading days per year — the annualization factor for daily Sharpe/Sortino. */
const TRADING_DAYS_PER_YEAR = 252;

/**
 * The closed trades with a realized P&L — the population every other function
 * operates on. Open trades and trades with null P&L are excluded everywhere;
 * centralizing the filter keeps each stat function honest about its input.
 */
export function closedPnlTrades(
  trades: ReadonlyArray<StatTrade>,
): { pnl: number }[] {
  return trades
    .filter(
      (t): t is StatTrade & { pnl: number } =>
        t.status !== 'open' && t.pnl != null,
    )
    .map((t) => ({ pnl: t.pnl }));
}

// =============================================================================
// Count-based stats
// =============================================================================

/** Total count of trades that count toward stats (closed with realized P&L). */
export function tradeCount(trades: ReadonlyArray<StatTrade>): number {
  return closedPnlTrades(trades).length;
}

/**
 * Win rate as a fraction in [0, 1]. wins / closed. Returns 0 for an empty set
 * (the dashboard renders "—" for empty, but the number is well-defined).
 */
export function winRate(trades: ReadonlyArray<StatTrade>): number {
  const closed = closedPnlTrades(trades);
  if (closed.length === 0) return 0;
  const wins = closed.filter((t) => t.pnl > 0).length;
  return wins / closed.length;
}

/**
 * Current consecutive-win-or-loss streak, signed: positive for a winning
 * streak (e.g. +3 = three wins in a row), negative for a losing streak
 * (−2 = two losses in a row), 0 when the most recent trade broke even or
 * there are no trades. Trades are ordered by entry time ascending so the
 * "current" streak is the most recent run.
 */
export function currentStreak(trades: ReadonlyArray<StatTrade>): number {
  const closed = closedPnlTrades(trades);
  if (closed.length === 0) return 0;

  // Pair each realized P&L with its entry time to order chronologically.
  const timed = trades
    .filter((t) => t.status !== 'open' && t.pnl != null)
    .map((t) => ({ pnl: t.pnl as number, ms: parseTime(t.entryTime) }))
    .sort((a, b) => a.ms - b.ms);

  // Walk backward from the most recent, counting while the sign holds.
  const last = timed[timed.length - 1];
  if (last.pnl === 0) return 0;
  const sign = last.pnl > 0 ? 1 : -1;
  let streak = 0;
  for (let i = timed.length - 1; i >= 0; i--) {
    const pnl = timed[i].pnl;
    if (pnl === 0) break;
    if ((pnl > 0 ? 1 : -1) === sign) streak++;
    else break;
  }
  return sign * streak;
}

// =============================================================================
// Mean / ratio stats
// =============================================================================

/**
 * Expectancy: the average P&L per trade in account currency. The single most
 * important stat — it's what you expect to make on the next trade. Null for an
 * empty set so the UI can show "—".
 */
export function expectancy(trades: ReadonlyArray<StatTrade>): number | null {
  const closed = closedPnlTrades(trades);
  if (closed.length === 0) return null;
  const sum = closed.reduce((acc, t) => acc + t.pnl, 0);
  return sum / closed.length;
}

/**
 * Average R-multiple across trades that have one. Trades without a computable R
 * (missing entry/stop/exit) are excluded from the average, not counted as 0.
 */
export function averageR(trades: ReadonlyArray<StatTrade>): number | null {
  const rs = trades
    .filter((t) => t.status !== 'open' && t.rMultiple != null)
    .map((t) => t.rMultiple as number);
  if (rs.length === 0) return null;
  return rs.reduce((acc, r) => acc + r, 0) / rs.length;
}

/**
 * Profit factor: gross profit / gross loss (both magnitudes). ≥1 means
 * profitable; 2+ is strong. Returns null when there are no losses (division by
 * zero) — in that case the system is "infinitely" profitable, which we
 * represent as null and let the UI render distinctly. Also null for an empty
 * set.
 */
export function profitFactor(trades: ReadonlyArray<StatTrade>): number | null {
  const closed = closedPnlTrades(trades);
  if (closed.length === 0) return null;
  const grossProfit = closed
    .filter((t) => t.pnl > 0)
    .reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(
    closed.filter((t) => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0),
  );
  if (grossLoss === 0) return null;
  return grossProfit / grossLoss;
}

// =============================================================================
// Daily-P&L-series stats: Sharpe, Sortino, max drawdown
// =============================================================================

/**
 * Build a daily P&L series: one number per calendar day with at least one
 * closed trade, summing all realized P&L booked on that day. Days are keyed by
 * the entry timestamp's UTC date (YYYY-MM-DD) so the series is stable across
 * viewer timezones. Trades with no entry time are summed into a single
 * "unknown-day" point prepended to the series so their P&L isn't lost.
 */
export function dailyPnlSeries(trades: ReadonlyArray<StatTrade>): number[] {
  const closed = trades.filter(
    (t): t is StatTrade & { pnl: number } =>
      t.status !== 'open' && t.pnl != null,
  );
  if (closed.length === 0) return [];

  const buckets = new Map<string, number>();
  let unknownDay = 0;
  for (const t of closed) {
    const day = dayKey(t.entryTime);
    if (day === null) {
      unknownDay += t.pnl;
    } else {
      buckets.set(day, (buckets.get(day) ?? 0) + t.pnl);
    }
  }

  const days = [...buckets.keys()].sort();
  const series: number[] = [];
  if (unknownDay !== 0) series.push(unknownDay); // prepend so order is stable
  for (const day of days) series.push(buckets.get(day)!);
  return series;
}

/**
 * Sharpe ratio annualized from the daily P&L series, risk-free rate 0.
 * Sharpe = mean(daily) / std(daily) * √252.
 *
 * Treating P&L dollars (not returns) as the daily input is deliberate for a
 * trading journal: it measures the stability of dollar P&L, which is what the
 * trader experiences. Returns null when there are fewer than 2 days (std is
 * undefined) or std is 0 (no volatility → ratio is undefined).
 */
export function sharpeRatio(trades: ReadonlyArray<StatTrade>): number | null {
  const series = dailyPnlSeries(trades);
  if (series.length < 2) return null;
  const mean = avg(series);
  const sd = stdDev(series, mean);
  if (sd === 0) return null;
  return (mean / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Sortino ratio annualized from the daily P&L series, risk-free rate 0.
 * Sortino = mean(daily) / downsideDeviation(daily) * √252, where the downside
 * deviation uses only days with P&L below the mean (penalizing "bad" volatility
 * only). This is the downside-sensitive counterpart to Sharpe. Null when there
 * is no downside variance (no losing days) or fewer than 2 days.
 */
export function sortinoRatio(trades: ReadonlyArray<StatTrade>): number | null {
  const series = dailyPnlSeries(trades);
  if (series.length < 2) return null;
  const mean = avg(series);
  const dd = downsideDeviation(series, mean);
  if (dd === 0) return null;
  return (mean / dd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Maximum drawdown on the cumulative-P&L equity curve, returned as a POSITIVE
 * percentage (a 20% drop → 20). Walks the running peak; the deepest peak-to-
 * trough drop across the series is the answer. Returns 0 when there's no drop
 * or no trades.
 *
 * Denominator convention: each drop is measured as trough/peak − 1 only when
 * the peak is above 0. Because the curve starts at 0 and cumulative P&L can be
 * negative early, a pure percentage would be undefined (dividing by a peak of
 * 0). We therefore measure the drawdown from the running peak of cumulative
 * P&L in PERCENTAGE terms relative to that peak when positive, and fall back
 * to the absolute dollar drop when the peak is ≤ 0 — reporting whichever is
 * the larger adverse move as a single comparable number. This keeps the stat
 * meaningful during a losing streak that begins before any profit.
 */
export function maxDrawdown(trades: ReadonlyArray<StatTrade>): number {
  const series = dailyPnlSeries(trades);
  if (series.length === 0) return 0;

  let cumulative = 0;
  let peak = 0;
  let maxDd = 0;
  for (const pnl of series) {
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    const drop = peak - cumulative; // ≥ 0
    if (drop > 0) {
      const pct = peak > 0 ? (drop / peak) * 100 : drop;
      if (pct > maxDd) maxDd = pct;
    }
  }
  return maxDd;
}

// =============================================================================
// Edge Score — composite 0–100 gauge value (the dashboard hero metric).
// =============================================================================
//
// The Edge Score collapses three dimensions into one number a trader can read
// at a glance: "is this system's edge real, and how strong is it?" It is NOT a
// forecast — it's a quality score on past performance. The three inputs are
// chosen to be independent (a high win rate alone shouldn't inflate the score
// if expectancy is poor, and vice versa), and each is normalized to [0, 1]
// before weighting so no dimension dominates by virtue of its raw units.
//
// FORMULA
//   edgeScore = 100 * (
//     0.35 * winComponent +
//     0.35 * expectancyComponent +
//     0.30 * consistencyComponent
//   )
//
// COMPONENTS (each normalized to [0, 1])
//   winComponent       = winRate
//     A pure win rate is already in [0, 1] — 50% → 0.5. No transformation.
//
//   expectancyComponent = clamp(expectancy / 100, 0, 1) for P&L in dollars,
//                         where $0 → 0 and $100+ per trade → 1. The $100
//                         anchor is a tunable; it represents "a dollar of
//                         average edge per trade is strong for a retail
//                         account." For R-multiple expectancy (unitless), the
//                         caller can pass a scaled series instead.
//
//   consistencyComponent = clamp(profitFactor / 2, 0, 1)
//     Profit factor of 0 → 0, 1.0 (breakeven) → 0.5, 2.0+ → 1. Profit factor
//     rewards systems that keep losses small relative to wins, independent of
//     win rate — the dimension win rate can't see.
//
// WEIGHTING rationale: win rate and expectancy are weighted equally (0.35
// each) because neither is sufficient alone (a 90% win rate with a negative
// expectancy is a losing system). Consistency (profit factor) gets 0.30 as the
// risk-adjusted dimension that rewards quality of wins vs losses.
//
// EDGE CASES: when there are no closed trades, or a component is undefined
// (e.g. profit factor is null because there were no losses), the missing
// component contributes 0 and the others' weights are NOT renormalized — a
// partial record should score low, not get a free pass. This makes an empty or
// one-sided history visibly low-scoring rather than deceptively high.

/** Bounds-clamp helper, used to normalize components to [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Expectancy anchor: $100/trade average counts as a "full" edge. Tunable. */
const EXPECTANCY_ANCHOR_USD = 100;

/**
 * Compute the Edge Score (0–100). See the formula block above for the full
 * derivation and the reasoning behind each component's normalization and
 * weight. Returns 0 for an empty trade set.
 */
export function edgeScore(trades: ReadonlyArray<StatTrade>): number {
  const closed = closedPnlTrades(trades);
  if (closed.length === 0) return 0;

  const win = winRate(trades); // already [0, 1]
  const exp = expectancy(trades) ?? 0; // dollars, may be negative
  const pf = profitFactor(trades); // null when no losses

  const winComponent = win;
  const expectancyComponent = clamp01(exp / EXPECTANCY_ANCHOR_USD);
  const consistencyComponent = pf == null ? 0 : clamp01(pf / 2);

  const score =
    0.35 * winComponent +
    0.35 * expectancyComponent +
    0.30 * consistencyComponent;

  return Math.round(score * 100);
}

// =============================================================================
// Small numeric helpers (population statistics — not sample, deliberately).
// =============================================================================

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Population standard deviation. Using population (÷n) rather than sample
 * (÷(n−1)) because the daily series IS the full population of observed days,
 * not a sample drawn from a larger one. This is the convention for
 * historical Sharpe on an observed return series.
 */
function stdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Downside deviation for Sortino: root-mean-square of (mean − x) over days
 * where x < mean only (downside moves). Days at/above the mean contribute 0.
 */
function downsideDeviation(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const sumSq = values.reduce((acc, v) => {
    const diff = mean - v; // positive only when v is below mean
    return acc + (diff > 0 ? diff * diff : 0);
  }, 0);
  return Math.sqrt(sumSq / values.length);
}

/** Parse an entry time to a numeric ms value for sorting; null/unknown → +∞. */
function parseTime(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** Day bucket key from an ISO timestamp ("YYYY-MM-DD" in UTC), or null. */
function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build a cumulative P&L series for lightweight-charts: one point per day.
 * Returns { time: 'YYYY-MM-DD', value: number }[] where time is the date string
 * and value is the running total up to that day.
 */
export function cumulativePnlSeries(trades: ReadonlyArray<StatTrade>): { time: string; value: number }[] {
  const closed = trades.filter(
    (t): t is StatTrade & { pnl: number } =>
      t.status !== 'open' && t.pnl != null,
  );
  if (closed.length === 0) return [];

  const buckets = new Map<string, number>();
  let unknownDay = 0;
  for (const t of closed) {
    const day = dayKey(t.entryTime);
    if (day === null) {
      unknownDay += t.pnl;
    } else {
      buckets.set(day, (buckets.get(day) ?? 0) + t.pnl);
    }
  }

  const days = [...buckets.keys()].sort();
  const series: { time: string; value: number }[] = [];
  let cumulative = unknownDay;
  for (const day of days) {
    cumulative += buckets.get(day)!;
    series.push({ time: day, value: cumulative });
  }
  return series;
}

/**
 * Default starting capital (account currency) used when a user hasn't set one
 * in Settings. Kept in lib/stats so every caller shares one source of truth.
 */
export const STARTING_BALANCE_DEFAULT = 150;

/**
 * Account equity curve: starting capital + running cumulative closed-trade P&L,
 * one point per day. This is the curve the dashboard's equity chart plots — it
 * represents actual account equity over time, not raw P&L from zero.
 *
 * `startingBalance` is the user's configured starting capital (from
 * user_settings); null falls back to STARTING_BALANCE_DEFAULT.
 */
/**
 * Resolve a stored starting-balance string (from user_settings, nullable) to
 * the numeric value the UI/stats should use, falling back to the app default
 * when unset or unparseable.
 */
export function resolveStartingBalance(stored: string | null): number {
  if (stored == null) return STARTING_BALANCE_DEFAULT;
  const n = Number(stored);
  return Number.isFinite(n) ? n : STARTING_BALANCE_DEFAULT;
}

export function equitySeries(
  trades: ReadonlyArray<StatTrade>,
  startingBalance: number | null,
): { time: string; value: number }[] {
  const base = startingBalance ?? STARTING_BALANCE_DEFAULT;
  const pnl = cumulativePnlSeries(trades);
  return pnl.map((pt) => ({ time: pt.time, value: base + pt.value }));
}

/**
 * Computes a histogram distribution of R-multiples for all closed trades with a
 * valid rMultiple. Trades are grouped into buckets of `step` size.
 * Returns a continuous series from the minimum to maximum observed bucket.
 */
export function rMultipleDistribution(
  trades: ReadonlyArray<StatTrade>,
  step = 0.5,
): { bucket: number; label: string; count: number; isGain: boolean }[] {
  const rs = trades
    .filter((t) => t.status !== 'open' && t.rMultiple != null)
    .map((t) => t.rMultiple as number);

  if (rs.length === 0) return [];

  const minR = Math.min(...rs);
  const maxR = Math.max(...rs);

  const startBucket = Math.floor(minR / step) * step;
  const endBucket = Math.ceil(maxR / step) * step;

  const buckets = new Map<number, number>();

  for (let b = startBucket; b <= endBucket + 0.0001; b += step) {
    const roundedBucket = Math.round(b / step) * step;
    buckets.set(roundedBucket, 0);
  }

  for (const r of rs) {
    const bucket = Math.floor(r / step) * step;
    const roundedBucket = Math.round(bucket / step) * step;
    buckets.set(roundedBucket, (buckets.get(roundedBucket) ?? 0) + 1);
  }

  const distribution: { bucket: number; label: string; count: number; isGain: boolean }[] = [];
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (const b of sortedKeys) {
    distribution.push({
      bucket: b,
      label: `${b > 0 ? '+' : ''}${b.toFixed(1)}R`,
      count: buckets.get(b)!,
      isGain: b >= 0,
    });
  }

  return distribution;
}

export interface RollingStatPoint {
  time: string;
  alpha: number | null;
  beta: number | null;
  correlation: number | null;
}

/**
 * Computes rolling alpha, beta, and correlation of the user's daily returns
 * against SPY daily returns.
 * 
 * Standard OLS Regression:
 *   User_Return = alpha + beta * SPY_Return + epsilon
 * 
 * Default window length: 30 trading days (approx. 1.5 calendar months).
 * Normalization starting capital: $100,000.
 */
export function computeRollingStats(
  userPnlSeries: ReadonlyArray<{ time: string; value: number }>,
  spyCloseSeries: ReadonlyArray<{ time: string; value: number }>,
  windowLength = 30,
  startingBalance = 100000
): RollingStatPoint[] {
  if (userPnlSeries.length === 0 || spyCloseSeries.length < 2) return [];

  // Sort chronologically
  const userSorted = [...userPnlSeries].sort((a, b) => a.time.localeCompare(b.time));
  const spySorted = [...spyCloseSeries].sort((a, b) => a.time.localeCompare(b.time));

  // Align user and SPY returns on SPY trading days
  const alignedPoints: { time: string; userReturn: number; spyReturn: number }[] = [];

  const getPnlAtOrBefore = (dateStr: string) => {
    let bestPnl = 0;
    for (const pt of userSorted) {
      if (pt.time <= dateStr) {
        bestPnl = pt.value;
      } else {
        break;
      }
    }
    return bestPnl;
  };

  for (let i = 1; i < spySorted.length; i++) {
    const prevSpy = spySorted[i - 1];
    const currSpy = spySorted[i];
    const time = currSpy.time;

    const spyReturn = prevSpy.value === 0 ? 0 : (currSpy.value - prevSpy.value) / prevSpy.value;

    const prevUserPnl = getPnlAtOrBefore(prevSpy.time);
    const currUserPnl = getPnlAtOrBefore(currSpy.time);

    const prevUserEquity = startingBalance + prevUserPnl;
    const currUserEquity = startingBalance + currUserPnl;

    const userReturn = prevUserEquity === 0 ? 0 : (currUserEquity - prevUserEquity) / prevUserEquity;

    alignedPoints.push({
      time,
      userReturn,
      spyReturn,
    });
  }

  const result: RollingStatPoint[] = [];

  for (let i = 0; i < alignedPoints.length; i++) {
    const time = alignedPoints[i].time;

    if (i < windowLength - 1) {
      result.push({
        time,
        alpha: null,
        beta: null,
        correlation: null,
      });
      continue;
    }

    const window = alignedPoints.slice(i - windowLength + 1, i + 1);

    let sumUser = 0;
    let sumSpy = 0;
    for (const pt of window) {
      sumUser += pt.userReturn;
      sumSpy += pt.spyReturn;
    }
    const meanUser = sumUser / windowLength;
    const meanSpy = sumSpy / windowLength;

    let num = 0;
    let denSpy = 0;
    let denUser = 0;

    for (const pt of window) {
      const uDiff = pt.userReturn - meanUser;
      const mDiff = pt.spyReturn - meanSpy;

      num += uDiff * mDiff;
      denSpy += mDiff * mDiff;
      denUser += uDiff * uDiff;
    }

    let beta: number | null = null;
    let alpha: number | null = null;
    let correlation: number | null = null;

    if (denSpy > 0) {
      beta = num / denSpy;
      alpha = meanUser - beta * meanSpy;
    }

    if (denSpy > 0 && denUser > 0) {
      correlation = num / Math.sqrt(denUser * denSpy);
    } else if (denUser === 0 && denSpy > 0) {
      correlation = 0;
      beta = 0;
      alpha = meanUser;
    }

    result.push({
      time,
      alpha,
      beta,
      correlation,
    });
  }

  return result;
}
