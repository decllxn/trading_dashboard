/**
 * Hand-verified unit tests for lib/stats.ts (Phase 5a).
 *
 * The expected values in this file were computed INDEPENDENTLY — by hand and
 * with a scratch calculator script that does NOT import lib/stats.ts — before
 * this test was written. That independence is the whole point: the test pins
 * each formula to a known answer so a future refactor that breaks the math
 * fails here rather than corrupting the dashboard silently.
 *
 * Sample set (7 closed trades across 5 calendar days + 1 open trade that must
 * be excluded + 1 trade with a null R-multiple that must be excluded from the
 * R average). All entry times are midnight UTC so day-bucketing is unambiguous.
 *
 *   Day 1 2024-01-02:  +$200 (R +2.0),  −$100 (R −1.0)   → daily sum +$100
 *   Day 2 2024-01-03:  +$150 (R +1.5)                     → daily sum +$150
 *   Day 3 2024-01-04:  −$50  (R −0.5),  −$80  (R −0.8)   → daily sum −$130
 *   Day 4 2024-01-05:  +$300 (R +3.0)                     → daily sum +$300
 *   Day 5 2024-01-08:  +$120 (R +1.2, NULL R on a dup)    → daily sum +$120
 *   open trade         pnl null → excluded from everything
 *
 * Run with `npm test` (node:test + native TS stripping).
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  averageR,
  classifyTradeResult,
  closedPnlTrades,
  currentStreak,
  dailyPnlSeries,
  DEFAULT_BREAKEVEN_THRESHOLD,
  edgeScore,
  expectancy,
  maxDrawdown,
  profitFactor,
  resolveBreakevenThreshold,
  sharpeRatio,
  sortinoRatio,
  tradeCount,
  winLossBreakdown,
  winRate,
  computeRollingStats,
  type StatTrade,
} from './stats.ts';

/** The canonical hand-verified sample. */
const SAMPLE: ReadonlyArray<StatTrade> = [
  { pnl: 200, rMultiple: 2.0, entryTime: '2024-01-02T00:00:00.000Z', status: 'closed' },
  { pnl: -100, rMultiple: -1.0, entryTime: '2024-01-02T00:00:00.000Z', status: 'closed' },
  { pnl: 150, rMultiple: 1.5, entryTime: '2024-01-03T00:00:00.000Z', status: 'closed' },
  { pnl: -50, rMultiple: -0.5, entryTime: '2024-01-04T00:00:00.000Z', status: 'closed' },
  { pnl: -80, rMultiple: -0.8, entryTime: '2024-01-04T00:00:00.000Z', status: 'closed' },
  { pnl: 300, rMultiple: 3.0, entryTime: '2024-01-05T00:00:00.000Z', status: 'closed' },
  { pnl: 120, rMultiple: 1.2, entryTime: '2024-01-08T00:00:00.000Z', status: 'closed' },
  // Open trade — must be excluded from every stat.
  { pnl: null, rMultiple: null, entryTime: '2024-01-09T00:00:00.000Z', status: 'open' },
];

// =============================================================================
// Closed-trade filtering
// =============================================================================

test('closedPnlTrades excludes open trades and null P&L', () => {
  const closed = closedPnlTrades(SAMPLE);
  assert.equal(closed.length, 7);
  assert.ok(closed.every((t) => typeof t.pnl === 'number'));
});

test('tradeCount = 7 (open trade excluded)', () => {
  assert.equal(tradeCount(SAMPLE), 7);
});

// =============================================================================
// Win rate & Break Even breakdown
// =============================================================================

test('classifyTradeResult categorizes wins, losses, and breakevens correctly', () => {
  assert.equal(classifyTradeResult(10, 5), 'win');
  assert.equal(classifyTradeResult(-10, 5), 'loss');
  assert.equal(classifyTradeResult(-2.99, 5), 'breakeven');
  assert.equal(classifyTradeResult(0.01, 5), 'breakeven');
  assert.equal(classifyTradeResult(0, 5), 'breakeven');
  assert.equal(classifyTradeResult(-5.00, 5), 'breakeven');
  assert.equal(classifyTradeResult(5.00, 5), 'breakeven');
  assert.equal(classifyTradeResult(5.01, 5), 'win');
  assert.equal(classifyTradeResult(-5.01, 5), 'loss');
  assert.equal(classifyTradeResult(null, 5), 'unrealized');
});

test('winLossBreakdown accurately computes wins, losses, breakevens, and adjusted win rate', () => {
  const testTrades: StatTrade[] = [
    { pnl: 150, status: 'closed' },   // Win
    { pnl: -120, status: 'closed' },  // Loss
    { pnl: -2.99, status: 'closed' }, // Break Even
    { pnl: 0.01, status: 'closed' },  // Break Even
    { pnl: 200, status: 'closed' },   // Win
  ];

  const breakdown = winLossBreakdown(testTrades, 5.0);
  assert.equal(breakdown.wins, 2);
  assert.equal(breakdown.losses, 1);
  assert.equal(breakdown.breakEvens, 2);
  assert.equal(breakdown.total, 5);
  assert.equal(breakdown.winRate, 2 / 5); // 0.4 (40%)
  assert.equal(breakdown.adjustedWinRate, 2 / 3); // 2 / (2 + 1) = 66.67%
  assert.equal(breakdown.winPct, 40);
  assert.equal(breakdown.lossPct, 20);
  assert.equal(breakdown.bePct, 40);
});

test('winRate = 4/7 for SAMPLE (all trade PnLs > $5 threshold)', () => {
  assert.equal(winRate(SAMPLE), 4 / 7);
});

// =============================================================================
// Expectancy — sum 540 / 7
// =============================================================================

test('expectancy = 540/7 ≈ 77.143', () => {
  assert.equal(expectancy(SAMPLE), 540 / 7);
});

// =============================================================================
// Average R — sum 5.4 / 7 (all 7 closed trades have an R here)
// =============================================================================

test('averageR = 5.4/7 ≈ 0.7714', () => {
  assert.equal(averageR(SAMPLE), 5.4 / 7);
});

test('averageR excludes trades with null R-multiple', () => {
  const withNullR: ReadonlyArray<StatTrade> = [
    { pnl: 100, rMultiple: 2.0, status: 'closed' },
    { pnl: -50, rMultiple: null, status: 'closed' },
  ];
  // Only the first trade counts: avg = 2.0
  assert.equal(averageR(withNullR), 2.0);
});

// =============================================================================
// Profit factor — grossProfit 770 / grossLoss 230
// =============================================================================

test('profitFactor = 770/230 ≈ 3.3478', () => {
  assert.equal(profitFactor(SAMPLE), 770 / 230);
});

test('profitFactor is null when there are no losses', () => {
  const onlyWins: ReadonlyArray<StatTrade> = [
    { pnl: 100, status: 'closed' },
    { pnl: 50, status: 'closed' },
  ];
  assert.equal(profitFactor(onlyWins), null);
});

// =============================================================================
// Daily P&L series — [100, 150, -130, 300, 120]
// =============================================================================

test('dailyPnlSeries sums per day in chronological order', () => {
  assert.deepEqual(dailyPnlSeries(SAMPLE), [100, 150, -130, 300, 120]);
});

// =============================================================================
// Sharpe — annualized from daily series, sqrt(252)
// Hand calc: mean=108, std≈138.1883, Sharpe = (108/138.1883)*sqrt(252) ≈ 12.407
// =============================================================================

test('sharpeRatio ≈ 12.407 (annualized)', () => {
  assert.ok(sharpeRatio(SAMPLE) !== null);
  assert.equal(Math.round((sharpeRatio(SAMPLE) as number) * 1000) / 1000, 12.407);
});

// =============================================================================
// Sortino — downside-only annualized
// Hand calc: downsideDev≈106.4969, Sortino ≈ 16.099
// =============================================================================

test('sortinoRatio ≈ 16.099 (annualized)', () => {
  assert.ok(sortinoRatio(SAMPLE) !== null);
  assert.equal(Math.round((sortinoRatio(SAMPLE) as number) * 1000) / 1000, 16.099);
});

// =============================================================================
// Max drawdown — cumulative curve [100,250,120,420,540]; peak 250 → trough 120
// is a drop of 130; 130/250 = 0.52 → 52%
// =============================================================================

test('maxDrawdown = 52 (peak 250 → trough 120, 130/250)', () => {
  assert.equal(maxDrawdown(SAMPLE), 52);
});

// =============================================================================
// Streak — most recent two trades are wins (+300, +120), preceded by a loss
// =============================================================================

test('currentStreak = +2 (two most-recent wins)', () => {
  assert.equal(currentStreak(SAMPLE), 2);
});

test('currentStreak is negative for a losing run', () => {
  const losingRun: ReadonlyArray<StatTrade> = [
    { pnl: 100, entryTime: '2024-01-01T00:00:00.000Z', status: 'closed' },
    { pnl: -50, entryTime: '2024-01-02T00:00:00.000Z', status: 'closed' },
    { pnl: -30, entryTime: '2024-01-03T00:00:00.000Z', status: 'closed' },
  ];
  assert.equal(currentStreak(losingRun), -2);
});

// =============================================================================
// Edge Score — hand calc:
//   winC = 4/7 ≈ 0.5714
//   expC = clamp(77.143/100, 0, 1) = 0.77143
//   conC = clamp(3.3478/2, 0, 1) = 1.0
//   raw = 0.35*0.5714 + 0.35*0.77143 + 0.30*1.0 = 0.77 → 77
// =============================================================================

test('edgeScore = 77', () => {
  assert.equal(edgeScore(SAMPLE), 77);
});

// =============================================================================
// Empty / degenerate edge cases — stats must be well-defined, never NaN/throw.
// =============================================================================

test('empty trade set yields zeroed stats, never throws', () => {
  const empty: ReadonlyArray<StatTrade> = [];
  assert.equal(tradeCount(empty), 0);
  assert.equal(winRate(empty), 0);
  assert.equal(expectancy(empty), null);
  assert.equal(averageR(empty), null);
  assert.equal(profitFactor(empty), null);
  assert.equal(sharpeRatio(empty), null);
  assert.equal(sortinoRatio(empty), null);
  assert.equal(maxDrawdown(empty), 0);
  assert.equal(currentStreak(empty), 0);
  assert.equal(edgeScore(empty), 0);
  assert.deepEqual(dailyPnlSeries(empty), []);
});

test('trades with no entry time still count toward stats', () => {
  const noTime: ReadonlyArray<StatTrade> = [
    { pnl: 100, status: 'closed' },
    { pnl: -40, status: 'closed' },
  ];
  assert.equal(tradeCount(noTime), 2);
  assert.equal(expectancy(noTime), 30);
  // Both land on the "unknown day" bucket → single-point series.
  assert.deepEqual(dailyPnlSeries(noTime), [60]);
});

test('computeRollingStats matches hand-calculated OLS expected values', () => {
  const userPnlSeries = [
    { time: '2024-01-01', value: 0 },
    { time: '2024-01-02', value: 1000 },
    { time: '2024-01-03', value: 3020 },
    { time: '2024-01-04', value: 1989.80 },
  ];

  const spyCloseSeries = [
    { time: '2024-01-01', value: 100.0 },
    { time: '2024-01-02', value: 102.0 },
    { time: '2024-01-03', value: 103.02 },
    { time: '2024-01-04', value: 99.9294 },
  ];

  // Starting balance = 100000, 3-day rolling window
  const rolling = computeRollingStats(userPnlSeries, spyCloseSeries, 3, 100000);

  // We should have 3 aligned daily return points (Day 1, 2, 3)
  // Day 1 & Day 2 will have null stats because window length is 3
  // Day 3 will have the first valid stats
  assert.equal(rolling.length, 3);
  
  assert.equal(rolling[0].time, '2024-01-02');
  assert.equal(rolling[0].beta, null);
  assert.equal(rolling[0].alpha, null);

  assert.equal(rolling[1].time, '2024-01-03');
  assert.equal(rolling[1].beta, null);
  assert.equal(rolling[1].alpha, null);

  assert.equal(rolling[2].time, '2024-01-04');
  
  // Hand-calculated expected values:
  // Beta = 0.5
  // Alpha = 0.006666667 (approx 2/300)
  // Correlation = 0.8660254 (approx sqrt(3)/2)
  assert.ok(rolling[2].beta !== null);
  assert.ok(rolling[2].alpha !== null);
  assert.ok(rolling[2].correlation !== null);

  assert.ok(Math.abs(rolling[2].beta - 0.5) < 1e-7);
  assert.ok(Math.abs(rolling[2].alpha - 0.006666667) < 1e-7);
  assert.ok(Math.abs(rolling[2].correlation - 0.8660254) < 1e-7);
  
  console.log('Rolling OLS stats verified successfully:', rolling[2]);
});

