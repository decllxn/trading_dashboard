import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  averageR,
  currentStreak,
  edgeScore,
  computeEdgeScoreDetails,
  expectancy,
  maxDrawdown,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  tradeCount,
  winRate,
  winLossBreakdown,
  resolveBreakevenThreshold,
  cumulativePnlSeries,
  equitySeries,
  STARTING_BALANCE_DEFAULT,
  rMultipleDistribution,
  computeRollingStats,
  computeNetPnl,
} from '@/lib/stats';
import { EdgeScoreGauge } from '@/components/dashboard/edge-score-gauge';
import { DisciplineChecklist } from '@/components/dashboard/discipline-checklist';
import { DisciplineAnalytics } from '@/components/dashboard/discipline-analytics';
import { StatGrid } from '@/components/dashboard/stat-grid';
import { RiskStatGrid } from '@/components/dashboard/risk-stat-grid';
import { TradingCalendar } from '@/components/dashboard/trading-calendar';
import { EquityCurveChart } from '@/components/charts/equity-curve-chart';
import { EquityComparisonChart } from '@/components/charts/equity-comparison-chart';
import { RMultipleHistogram } from '@/components/charts/r-multiple-histogram';
import { HourlyPnlChart } from '@/components/charts/hourly-pnl-chart';
import { AssetAllocationSection } from '@/components/dashboard/asset-allocation-section';
import { MoodChart } from '@/components/charts/mood-chart';
import { getMarketData } from '@/lib/market-data';
import type { StatTrade } from '@/lib/stats';

export const dynamic = 'force-dynamic';

/**
 * Dashboard home (Phase 5a).
 *
 * Fetches the signed-in user's trades server-side, projects them into the
 * minimal `StatTrade` shape the pure stats functions consume, and renders the
 * Edge Score gauge + stat grid. Every number on the page is the output of a
 * lib/stats.ts function — the same functions pinned by the hand-verified unit
 * tests, so the dashboard's numbers are correct by construction.
 *
 * Only closed trades with a realized P&L contribute (the stats layer filters;
 * the projection here just hands over the raw columns). Decimal columns come
 * back as strings from Postgres numeric and are coerced to number | null.
 */
export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h1 className="font-display text-primary text-xl">Dashboard</h1>
        <p className="text-secondary mt-2 text-sm">
          Supabase is not configured. Add credentials to{' '}
          <code className="num text-accent-signal">.env.local</code>.
        </p>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  let { data: rawTrades, error } = await supabase
    .from('trades')
    .select('id, pnl, commission, swap, fees, r_multiple, entry_time, exit_time, status, instrument, direction, entry_price, exit_price, size, stop_price, target_price, pretrade_checklist')
    .eq('user_id', user.id);

  if (error && error.message?.includes('pretrade_checklist')) {
    const retry = await supabase
      .from('trades')
      .select('id, pnl, commission, swap, fees, r_multiple, entry_time, exit_time, status, instrument, direction, entry_price, exit_price, size, stop_price, target_price')
      .eq('user_id', user.id);

    rawTrades = retry.data as any;
    error = retry.error;
  }

  if (error) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h1 className="font-display text-primary text-xl">Dashboard</h1>
        <div className="border-hairline bg-surface mt-4 rounded-card border px-4 py-3">
          <p className="text-loss text-sm">Couldn&apos;t load trades.</p>
          <p className="num text-tertiary mt-1 text-xs">{error.message}</p>
        </div>
      </main>
    );
  }

  // User's configured starting capital & break even threshold
  const { data: settingsRow } = await supabase
    .from('user_settings')
    .select('starting_balance, breakeven_threshold')
    .eq('user_id', user.id)
    .maybeSingle();
  const startingBalance = settingsRow?.starting_balance
    ? Number(settingsRow.starting_balance)
    : STARTING_BALANCE_DEFAULT;
  const breakevenThreshold = resolveBreakevenThreshold(settingsRow?.breakeven_threshold);

  const trades: StatTrade[] = ((rawTrades ?? []) as Array<{
    id: string;
    pnl: string | null;
    commission: string | null;
    swap: string | null;
    fees: string | null;
    r_multiple: string | null;
    entry_time: string | null;
    exit_time: string | null;
    status: string;
    instrument: string;
    direction: string | null;
    entry_price: string | null;
    exit_price: string | null;
    size: string | null;
    stop_price: string | null;
    target_price: string | null;
  }>).map((t) => {
    const gross = toNumber(t.pnl);
    const commission = toNumber(t.commission);
    const swap = toNumber(t.swap);
    const fees = toNumber(t.fees);
    return {
      id: t.id,
      pnl: computeNetPnl(gross, commission, swap, fees),
      rMultiple: toNumber(t.r_multiple),
      entryTime: t.entry_time,
      exitTime: t.exit_time,
      status: t.status,
      commission,
      swap,
      fees,
      instrument: t.instrument,
      direction: t.direction,
      entryPrice: toNumber(t.entry_price),
      exitPrice: toNumber(t.exit_price),
      size: toNumber(t.size),
      stopPrice: toNumber(t.stop_price),
      targetPrice: toNumber(t.target_price),
      pretradeChecklist: (t as any).pretrade_checklist || [],
    };
  });

  const count = tradeCount(trades);
  const empty = count === 0;

  const breakdown = winLossBreakdown(trades, breakevenThreshold);
  const scoreDetails = computeEdgeScoreDetails(trades, breakevenThreshold);
  const stats = {
    winRate: winRate(trades, breakevenThreshold),
    expectancy: expectancy(trades),
    profitFactor: profitFactor(trades),
    maxDrawdown: maxDrawdown(trades),
    streak: currentStreak(trades, breakevenThreshold),
  };

  // Sharpe / Sortino / average R are computed and surfaced in a secondary
  // panel; the primary stat grid shows the five headline metrics.
  const sharpe = sharpeRatio(trades);
  const sortino = sortinoRatio(trades);
  const avgR = averageR(trades);
  
  const pnlSeries = cumulativePnlSeries(trades);
  // Account equity curve: starting capital + running cumulative P&L.
  const equityData = equitySeries(trades, startingBalance);
  const distributionData = rMultipleDistribution(trades);

  // Find start date from trade history or default to 2024-01-01
  const entryDates = trades.map((t) => t.entryTime).filter((d): d is string => !!d);
  const startDate = entryDates.length > 0 ? entryDates.sort()[0].split('T')[0] : '2024-01-01';

  // Fetch SPY daily closing prices through the cached client
  let spyData: { time: string; value: number }[] = [];
  let userReturnSeries: { time: string; value: number }[] = [];
  let spyReturnSeries: { time: string; value: number }[] = [];
  let currentStats: { alpha: number | null; beta: number | null; correlation: number | null } | null = null;

  if (!empty) {
    try {
      spyData = await getMarketData('SPY', '1D', startDate);
      
      userReturnSeries = pnlSeries.map(pt => ({
        time: pt.time,
        value: startingBalance === 0 ? 0 : (pt.value / startingBalance) * 100
      }));

      const spyInitial = spyData.length > 0 ? spyData[0].value : 1;
      spyReturnSeries = spyData.map(pt => ({
        time: pt.time,
        value: spyInitial === 0 ? 0 : ((pt.value - spyInitial) / spyInitial) * 100
      }));

      // Default rolling window length is 30 days
      const rollingStats = computeRollingStats(pnlSeries, spyData, 30, startingBalance);
      currentStats = rollingStats.length > 0 ? rollingStats[rollingStats.length - 1] : null;
    } catch (err) {
      console.error('Error loading market comparison data:', err);
    }
  }

  // Fetch journal entries for mood over time
  const { data: journals } = await supabase
    .from('journal_entries')
    .select('date, mood')
    .eq('user_id', user.id)
    .not('mood', 'is', null)
    .order('date', { ascending: true });

  const MOOD_VALUES: Record<string, number> = {
    'Disciplined': 4,
    'Hesitant': 3,
    'FOMO': 2,
    'Revenge Trade': 1
  };

  const moodData = (journals || []).map(entry => ({
    date: entry.date,
    mood: entry.mood as string,
    moodValue: MOOD_VALUES[entry.mood as string] || 2
  }));

  return (
    <main className="px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-primary text-xl">Dashboard</h1>
        <p className="text-secondary mt-1 text-sm">
          {empty
            ? 'No closed trades yet.'
            : `${count} closed trade${count === 1 ? '' : 's'} analyzed.`}
        </p>
      </div>

      {/* TOP SECTION: EDGE SCORE GAUGE & STAT GRIDS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr] items-start">
        <div>
          <EdgeScoreGauge score={scoreDetails.score} details={scoreDetails} empty={empty} />
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="font-display text-primary mb-3 text-xs uppercase tracking-wide">
              Performance
            </h2>
            <StatGrid
              winRate={stats.winRate}
              expectancy={stats.expectancy}
              profitFactor={stats.profitFactor}
              maxDrawdown={stats.maxDrawdown}
              streak={stats.streak}
              winLossBreakdown={breakdown}
              empty={empty}
            />
          </section>

          <section>
            <h2 className="font-display text-primary mb-3 text-xs uppercase tracking-wide">
              Risk-adjusted
            </h2>
            <RiskStatGrid
              sharpe={empty || sharpe == null ? null : sharpe.toFixed(2)}
              sortino={empty || sortino == null ? null : sortino.toFixed(2)}
              avgR={empty || avgR == null ? null : formatR(avgR)}
            />
          </section>
        </div>
      </div>

      {/* DISCIPLINE & BEHAVIORAL ANALYTICS SECTION */}
      <div className="mt-6 grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 items-start">
        <div>
          <DisciplineChecklist trades={trades} />
        </div>
        <div>
          <DisciplineAnalytics trades={trades} />
        </div>
      </div>

      <div className="mt-6">
        <EquityCurveChart
          data={equityData}
          startingBalance={startingBalance}
          empty={empty}
        />
      </div>

      <div className="mt-6">
        <TradingCalendar trades={trades} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EquityComparisonChart 
          userReturnSeries={userReturnSeries} 
          spyReturnSeries={spyReturnSeries} 
          currentStats={currentStats} 
        />
        <MoodChart data={moodData} />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HourlyPnlChart trades={trades} />
        <RMultipleHistogram data={distributionData} />
      </div>

      <div className="mt-6">
        <AssetAllocationSection trades={trades} breakevenThreshold={breakevenThreshold} />
      </div>
    </main>
  );
}

/** Postgres numeric → number | null. Safe at retail-trade magnitudes. */
function toNumber(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Format a signed R-multiple, e.g. +0.77R, −1.20R. */
function formatR(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${value.toFixed(2)}R`;
}
