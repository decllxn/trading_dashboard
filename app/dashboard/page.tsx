import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  averageR,
  currentStreak,
  edgeScore,
  expectancy,
  maxDrawdown,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  tradeCount,
  winRate,
  cumulativePnlSeries,
  rMultipleDistribution,
  computeRollingStats,
} from '@/lib/stats';
import { EdgeScoreGauge } from '@/components/dashboard/edge-score-gauge';
import { StatGrid } from '@/components/dashboard/stat-grid';
import { EquityComparisonChart } from '@/components/charts/equity-comparison-chart';
import { RMultipleHistogram } from '@/components/charts/r-multiple-histogram';
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
      <main className="px-6 py-6">
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

  const { data: rawTrades, error } = await supabase
    .from('trades')
    .select('pnl, r_multiple, entry_time, status')
    .eq('user_id', user.id);

  if (error) {
    return (
      <main className="px-6 py-6">
        <h1 className="font-display text-primary text-xl">Dashboard</h1>
        <div className="border-hairline bg-surface mt-4 rounded-card border px-4 py-3">
          <p className="text-loss text-sm">Couldn&apos;t load trades.</p>
          <p className="num text-tertiary mt-1 text-xs">{error.message}</p>
        </div>
      </main>
    );
  }

  const trades: StatTrade[] = ((rawTrades ?? []) as Array<{
    pnl: string | null;
    r_multiple: string | null;
    entry_time: string | null;
    status: string;
  }>).map((t) => ({
    pnl: toNumber(t.pnl),
    rMultiple: toNumber(t.r_multiple),
    entryTime: t.entry_time,
    status: t.status,
  }));

  const count = tradeCount(trades);
  const empty = count === 0;

  const score = edgeScore(trades);
  const stats = {
    winRate: winRate(trades),
    expectancy: expectancy(trades),
    profitFactor: profitFactor(trades),
    maxDrawdown: maxDrawdown(trades),
    streak: currentStreak(trades),
  };

  // Sharpe / Sortino / average R are computed and surfaced in a secondary
  // panel; the primary stat grid shows the five headline metrics.
  const sharpe = sharpeRatio(trades);
  const sortino = sortinoRatio(trades);
  const avgR = averageR(trades);
  
  const equityData = cumulativePnlSeries(trades);
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
      
      const startingBalance = 100000;
      userReturnSeries = equityData.map(pt => ({
        time: pt.time,
        value: (pt.value / startingBalance) * 100
      }));

      const spyInitial = spyData.length > 0 ? spyData[0].value : 1;
      spyReturnSeries = spyData.map(pt => ({
        time: pt.time,
        value: spyInitial === 0 ? 0 : ((pt.value - spyInitial) / spyInitial) * 100
      }));

      // Default rolling window length is 30 days
      const rollingStats = computeRollingStats(equityData, spyData, 30, startingBalance);
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
    <main className="px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-primary text-xl">Dashboard</h1>
        <p className="text-secondary mt-1 text-sm">
          {empty
            ? 'No closed trades yet.'
            : `${count} closed trade${count === 1 ? '' : 's'} analyzed.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
        <EdgeScoreGauge score={score} empty={empty} />

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
              empty={empty}
            />
          </section>

          <section>
            <h2 className="font-display text-primary mb-3 text-xs uppercase tracking-wide">
              Risk-adjusted
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <SecondaryStat
                label="Sharpe"
                value={empty || sharpe == null ? null : sharpe.toFixed(2)}
              />
              <SecondaryStat
                label="Sortino"
                value={empty || sortino == null ? null : sortino.toFixed(2)}
              />
              <SecondaryStat
                label="Avg R"
                value={empty || avgR == null ? null : formatR(avgR)}
              />
            </div>
          </section>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EquityComparisonChart 
          userReturnSeries={userReturnSeries} 
          spyReturnSeries={spyReturnSeries} 
          currentStats={currentStats} 
        />
        <MoodChart data={moodData} />
      </div>

      <div className="mt-6">
        <RMultipleHistogram data={distributionData} />
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

interface SecondaryStatProps {
  label: string;
  value: string | null;
}

function SecondaryStat({ label, value }: SecondaryStatProps) {
  return (
    <div className="border-hairline bg-surface rounded-card border px-4 py-3">
      <p className="text-tertiary text-[10px] uppercase tracking-wide">{label}</p>
      <p className="num text-primary mt-2 text-lg">{value ?? '—'}</p>
    </div>
  );
}
