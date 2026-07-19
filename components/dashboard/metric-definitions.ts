/**
 * Metric definitions surfaced in the info modal when a user clicks a stat card.
 *
 * Each entry contains the human-readable name, a concise plain-English
 * definition, the formula (using the notation from lib/stats.ts), and a
 * worked numerical example. The `key` field maps to the stat card's identity
 * so the modal knows which definition to show.
 */
export interface MetricDefinition {
  key: MetricKey;
  name: string;
  definition: string;
  formula: string;
  example: string;
}

export type MetricKey =
  | 'winRate'
  | 'expectancy'
  | 'profitFactor'
  | 'maxDrawdown'
  | 'streak'
  | 'sharpe'
  | 'sortino'
  | 'avgR';

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: 'winRate',
    name: 'Win Rate',
    definition:
      'The proportion of closed trades that ended with a positive P&L. A win rate above 50% means more trades win than lose, but it says nothing about the size of those wins and losses.',
    formula: 'Win Rate = Winning Trades / Total Closed Trades',
    example:
      'You close 20 trades. 13 are profitable, 7 are not.\nWin Rate = 13 / 20 = 0.65 = 65.0%',
  },
  {
    key: 'expectancy',
    name: 'Expectancy',
    definition:
      'The average net P&L per closed trade, in account currency. This is what you statistically "expect" to make on your next trade given your historical performance. Positive expectancy is the minimum requirement for a viable system.',
    formula: 'Expectancy = Sum of All Net P&L / Total Closed Trades',
    example:
      'Over 10 trades your net P&L values are: +$120, \u2212$45, +$80, \u2212$30, +$200, \u2212$60, +$55, +$90, \u2212$40, +$110.\nSum = +$480\nExpectancy = $480 / 10 = +$48.00 per trade',
  },
  {
    key: 'profitFactor',
    name: 'Profit Factor',
    definition:
      'The ratio of total gross profit to total gross loss (both as positive magnitudes). A profit factor above 1.0 means the system is net profitable; above 2.0 is generally considered strong. Undefined (shown as "\u2014") when there are no losing trades.',
    formula: 'Profit Factor = Gross Profit / |Gross Loss|',
    example:
      'Your winning trades sum to +$1,200 in profit.\nYour losing trades sum to \u2212$600 in losses.\nProfit Factor = $1,200 / $600 = 2.00',
  },
  {
    key: 'maxDrawdown',
    name: 'Max Drawdown',
    definition:
      'The largest peak-to-trough decline on your cumulative P&L equity curve, expressed as a positive percentage. It measures the worst losing streak you would have experienced, and is a key risk metric.',
    formula:
      'Max Drawdown = max over all time of ((Peak \u2212 Trough) / Peak) \u00d7 100\n\nWhere Peak is the running maximum of cumulative P&L and Trough is the lowest point after that peak.',
    example:
      'Your cumulative P&L peaks at +$5,000, then dips to +$3,500 before recovering.\nDrawdown = ($5,000 \u2212 $3,500) / $5,000 \u00d7 100 = 30.0%',
  },
  {
    key: 'streak',
    name: 'Streak',
    definition:
      'The current consecutive run of winning or losing trades. A positive streak (e.g. +3 W) means 3 wins in a row; a negative streak (e.g. \u22122 L) means 2 losses in a row. Resets when the direction changes or a trade breaks even.',
    formula:
      'Starting from the most recent trade, count backward while all trades share the same sign (win or loss). The count is signed: positive for wins, negative for losses.',
    example:
      'Your last 5 trades by P&L: +$50, +$30, +$80, \u2212$20, +$45.\nReading from most recent: +$45 (win), then \u2212$20 (loss) breaks the run.\nStreak = +1 W (only the most recent trade is a win before the streak broke).',
  },
  {
    key: 'sharpe',
    name: 'Sharpe Ratio',
    definition:
      'A risk-adjusted return measure that divides average daily P&L by its standard deviation, then annualizes. Higher is better: it means more return per unit of total volatility. Requires at least 2 trading days. Risk-free rate is treated as 0.',
    formula:
      'Sharpe = (Mean Daily P&L / Std Dev of Daily P&L) \u00d7 \u221a252\n\nWhere 252 is the standard number of trading days per year.',
    example:
      'Over 5 trading days, daily P&L is: +$100, \u2212$30, +$60, +$40, \u2212$10.\nMean = $32.00\nStd Dev = $46.04\nSharpe = (32 / 46.04) \u00d7 \u221a252 = 0.695 \u00d7 15.87 = 11.03',
  },
  {
    key: 'sortino',
    name: 'Sortino Ratio',
    definition:
      'Like Sharpe, but only penalizes downside volatility (days below the mean). This rewards strategies with large upside swings while punishing inconsistent losses. Higher is better. Requires at least 2 trading days with some downside.',
    formula:
      'Sortino = (Mean Daily P&L / Downside Deviation) \u00d7 \u221a252\n\nDownside Deviation = \u221a(mean of squared deviations for days below the mean)',
    example:
      'Over 5 trading days, daily P&L is: +$100, \u2212$30, +$60, +$40, \u2212$10.\nMean = $32.00\nOnly \u2212$30 and \u2212$10 are below the mean.\nDownside Dev = \u221a(((32\u2212(\u221230))\u00b2 + (32\u2212(\u221210))\u00b2) / 5) = \u221a((62\u00b2 + 42\u00b2)/5) = \u221a(1,528.8) = 39.10\nSortino = (32 / 39.10) \u00d7 15.87 = 12.99',
  },
  {
    key: 'avgR',
    name: 'Average R-Multiple',
    definition:
      'The mean R-multiple across all closed trades that have a computed R. R-multiple measures each trade\'s outcome relative to its initial risk (1R = the distance from entry to stop-loss). A positive average R means you make more per unit of risk than you lose.',
    formula:
      'Avg R = Sum of R-Multiples / Count of Trades with R\n\nR-Multiple per trade = (Exit \u2212 Entry) / (Entry \u2212 Stop) for longs.',
    example:
      'Your last 4 trades have R-multiples: +2.1R, \u22120.8R, +1.5R, \u22121.0R.\nSum = +1.8R\nAvg R = 1.8 / 4 = +0.45R',
  },
];

export function getMetricDefinition(key: MetricKey): MetricDefinition | undefined {
  return METRIC_DEFINITIONS.find((d) => d.key === key);
}
