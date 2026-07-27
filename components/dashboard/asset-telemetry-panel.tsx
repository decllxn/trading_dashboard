'use client';

import { useMemo, useState } from 'react';
import {
  winRate,
  winLossBreakdown,
  profitFactor,
  expectancy,
  averageR,
  maxDrawdown,
  DEFAULT_BREAKEVEN_THRESHOLD,
  type StatTrade,
} from '@/lib/stats';
import { cn } from '@/lib/utils';
import { Filter, Search, ArrowUpRight, ArrowDownRight, Clock, ShieldAlert } from 'lucide-react';

interface AssetTelemetryPanelProps {
  trades: ReadonlyArray<StatTrade>;
  breakevenThreshold?: number;
  selectedAsset?: string;
  onSelectAsset?: (asset: string) => void;
}

interface AssetMetrics {
  instrument: string;
  totalTrades: number;
  closedTradesCount: number;
  openTradesCount: number;
  allocPct: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRateVal: number;
  winCount: number;
  lossCount: number;
  beCount: number;
  profitFactorVal: number | null;
  expectancyVal: number | null;
  avgRVal: number | null;
  maxDrawdownVal: number;
  avgDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  bestTradePnl: number | null;
  worstTradePnl: number | null;
  longTradesCount: number;
  shortTradesCount: number;
  longWinRate: number;
  shortWinRate: number;
  longNetPnl: number;
  shortNetPnl: number;
  totalCarryingCosts: number;
}

export function AssetTelemetryPanel({
  trades,
  breakevenThreshold = DEFAULT_BREAKEVEN_THRESHOLD,
  selectedAsset: externalSelectedAsset,
  onSelectAsset: externalOnSelectAsset,
}: AssetTelemetryPanelProps) {
  const [internalSelectedAsset, setInternalSelectedAsset] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeSelectedAsset = externalSelectedAsset ?? internalSelectedAsset;

  const handleSelectAsset = (asset: string) => {
    if (externalOnSelectAsset) {
      externalOnSelectAsset(asset);
    } else {
      setInternalSelectedAsset(asset);
    }
  };

  // Compute all instrument lists & stats
  const { allAssets, allAssetMetrics, totalPortfolioTrades } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of trades) {
      if (!t.instrument) continue;
      const key = t.instrument.toUpperCase().trim();
      counts[key] = (counts[key] || 0) + 1;
    }

    const sortedAssetKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const totalTrades = trades.length;

    const metricsMap: Record<string, AssetMetrics> = {};

    // Helper to calculate metrics for a subset of trades
    const computeSubMetrics = (instKey: string, subTrades: ReadonlyArray<StatTrade>): AssetMetrics => {
      const closed = subTrades.filter((t) => t.status !== 'open' && t.pnl != null);
      const open = subTrades.filter((t) => t.status === 'open' || t.pnl == null);
      const netPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
      const grossProfit = closed.filter((t) => (t.pnl ?? 0) > 0).reduce((sum, t) => sum + (t.pnl ?? 0), 0);
      const grossLoss = Math.abs(closed.filter((t) => (t.pnl ?? 0) < 0).reduce((sum, t) => sum + (t.pnl ?? 0), 0));

      const wr = winRate(subTrades, breakevenThreshold);
      const breakdown = winLossBreakdown(subTrades, breakevenThreshold);
      const pf = profitFactor(subTrades);
      const exp = expectancy(subTrades);
      const avgR = averageR(subTrades);
      const maxDd = maxDrawdown(subTrades);

      // Duration calculations
      const durations: number[] = [];
      for (const t of closed) {
        if (t.entryTime && t.exitTime) {
          const entryMs = new Date(t.entryTime).getTime();
          const exitMs = new Date(t.exitTime).getTime();
          const diff = exitMs - entryMs;
          if (diff > 0 && !isNaN(diff)) {
            durations.push(diff);
          }
        }
      }

      const avgDurationMs =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null;
      const minDurationMs = durations.length > 0 ? Math.min(...durations) : null;
      const maxDurationMs = durations.length > 0 ? Math.max(...durations) : null;

      const pnls = closed.map((t) => t.pnl as number);
      const bestTradePnl = pnls.length > 0 ? Math.max(...pnls) : null;
      const worstTradePnl = pnls.length > 0 ? Math.min(...pnls) : null;

      // Long / Short stats
      const longs = subTrades.filter((t) => t.direction && ['long', 'buy'].includes(t.direction.toLowerCase()));
      const shorts = subTrades.filter((t) => t.direction && ['short', 'sell'].includes(t.direction.toLowerCase()));
      
      const longClosed = longs.filter((t) => t.status !== 'open' && t.pnl != null);
      const shortClosed = shorts.filter((t) => t.status !== 'open' && t.pnl != null);

      const longNetPnl = longClosed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
      const shortNetPnl = shortClosed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

      const longWinRate = winRate(longs, breakevenThreshold);
      const shortWinRate = winRate(shorts, breakevenThreshold);

      // Carrying costs
      const totalCarryingCosts = subTrades.reduce(
        (sum, t) => sum + (t.commission ?? 0) + (t.swap ?? 0) + (t.fees ?? 0),
        0
      );

      return {
        instrument: instKey,
        totalTrades: subTrades.length,
        closedTradesCount: closed.length,
        openTradesCount: open.length,
        allocPct: totalTrades > 0 ? (subTrades.length / totalTrades) * 100 : 0,
        netPnl,
        grossProfit,
        grossLoss,
        winRateVal: wr,
        winCount: breakdown.wins,
        lossCount: breakdown.losses,
        beCount: breakdown.breakEvens,
        profitFactorVal: pf,
        expectancyVal: exp,
        avgRVal: avgR,
        maxDrawdownVal: maxDd,
        avgDurationMs,
        minDurationMs,
        maxDurationMs,
        bestTradePnl,
        worstTradePnl,
        longTradesCount: longs.length,
        shortTradesCount: shorts.length,
        longWinRate,
        shortWinRate,
        longNetPnl,
        shortNetPnl,
        totalCarryingCosts,
      };
    };

    // Calculate for ALL
    metricsMap['ALL'] = computeSubMetrics('ALL', trades);

    // Calculate for each asset
    for (const key of sortedAssetKeys) {
      const assetTrades = trades.filter(
        (t) => t.instrument?.toUpperCase().trim() === key
      );
      metricsMap[key] = computeSubMetrics(key, assetTrades);
    }

    return {
      allAssets: sortedAssetKeys,
      allAssetMetrics: metricsMap,
      totalPortfolioTrades: totalTrades,
    };
  }, [trades, breakevenThreshold]);

  // Filtered asset tab options for search
  const filteredAssetKeys = useMemo(() => {
    if (!searchQuery.trim()) return allAssets;
    const q = searchQuery.toLowerCase().trim();
    return allAssets.filter((a) => a.toLowerCase().includes(q));
  }, [allAssets, searchQuery]);

  const activeMetrics = allAssetMetrics[activeSelectedAsset] || allAssetMetrics['ALL'];

  if (totalPortfolioTrades === 0) {
    return (
      <div className="border-hairline bg-surface rounded-card border p-4 pt-6">
        <h2 className="font-display text-primary text-xs uppercase tracking-wide mb-2">
          Asset Telemetry
        </h2>
        <p className="text-secondary text-sm">No trades available for telemetry analysis.</p>
      </div>
    );
  }

  return (
    <div className="border-hairline bg-surface rounded-card border p-4 pt-6 space-y-6">
      {/* SECTION HEADER & ASSET FILTER BAR */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-primary text-xs uppercase tracking-wide">
            Asset Telemetry & Performance
          </h2>
          <p className="text-secondary text-[11px] mt-0.5">
            Detailed win rates, expectancy, risk metrics, and trade parameters per asset.
          </p>
        </div>

        {/* Search input for instruments */}
        {allAssets.length > 4 && (
          <div className="relative w-full md:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-tertiary pointer-events-none" />
            <input
              type="text"
              placeholder="Search instrument..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-hairline bg-surface-raised rounded-card border pl-8 pr-3 py-1.5 text-xs text-primary placeholder:text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-signal font-sans"
            />
          </div>
        )}
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-hairline/60">
        <button
          type="button"
          onClick={() => handleSelectAsset('ALL')}
          className={cn(
            'px-3 py-1.5 rounded-card text-xs font-sans whitespace-nowrap transition-colors duration-150 flex items-center gap-2 cursor-pointer',
            activeSelectedAsset === 'ALL'
              ? 'bg-surface-raised text-accent-signal border border-accent-signal/40 font-medium'
              : 'text-secondary hover:text-primary hover:bg-surface-raised/40 border border-transparent'
          )}
        >
          <span>ALL ASSETS</span>
          <span className="num text-[10px] text-tertiary">({totalPortfolioTrades})</span>
        </button>

        {filteredAssetKeys.map((asset) => {
          const metrics = allAssetMetrics[asset];
          const isSelected = activeSelectedAsset === asset;
          return (
            <button
              key={asset}
              type="button"
              onClick={() => handleSelectAsset(asset)}
              className={cn(
                'px-3 py-1.5 rounded-card text-xs font-sans whitespace-nowrap transition-colors duration-150 flex items-center gap-2 cursor-pointer',
                isSelected
                  ? 'bg-surface-raised text-accent-signal border border-accent-signal/40 font-medium'
                  : 'text-secondary hover:text-primary hover:bg-surface-raised/40 border border-transparent'
              )}
            >
              <span className="font-display tracking-tight">{asset}</span>
              <span className="num text-[10px] text-tertiary">({metrics?.totalTrades || 0})</span>
            </button>
          );
        })}
      </div>

      {/* SELECTED ASSET HIGHLIGHT HEADER */}
      <div className="border-hairline bg-surface-raised/50 rounded-card border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-primary text-base sm:text-lg font-bold tracking-wide">
              {activeSelectedAsset === 'ALL' ? 'PORTFOLIO AGGREGATE' : activeSelectedAsset}
            </span>
            <span className="num text-[10px] text-tertiary bg-surface border border-hairline px-2 py-0.5 rounded-card">
              {activeMetrics.totalTrades} trade{activeMetrics.totalTrades === 1 ? '' : 's'} ({activeMetrics.allocPct.toFixed(1)}% portfolio share)
            </span>
          </div>
          <p className="text-secondary text-xs font-sans">
            {activeMetrics.closedTradesCount} closed trades · {activeMetrics.openTradesCount} open trades
          </p>
        </div>

        <div className="flex items-center gap-6 self-start md:self-auto">
          <div>
            <p className="text-tertiary text-[10px] uppercase tracking-wide">Net Realized P&L</p>
            <p className={cn('num text-lg font-semibold', activeMetrics.netPnl > 0 ? 'text-gain' : activeMetrics.netPnl < 0 ? 'text-loss' : 'text-secondary')}>
              {formatSignedCurrency(activeMetrics.netPnl)}
            </p>
          </div>
          <div className="border-hairline border-l pl-6">
            <p className="text-tertiary text-[10px] uppercase tracking-wide">Win Rate</p>
            <p className="num text-primary text-lg font-semibold">
              {(activeMetrics.winRateVal * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* 6-CARD TELEMETRY GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Card 1: Net Realized P&L */}
        <div className="border-hairline bg-surface rounded-card border p-3.5 flex flex-col justify-between">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Net Realized P&L</p>
          <p className={cn('num text-xl font-bold mt-1', activeMetrics.netPnl > 0 ? 'text-gain' : activeMetrics.netPnl < 0 ? 'text-loss' : 'text-secondary')}>
            {formatSignedCurrency(activeMetrics.netPnl)}
          </p>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-hairline/40">
            <span className="text-secondary">Gross Profit: <span className="num text-gain font-medium">{formatCurrency(activeMetrics.grossProfit)}</span></span>
            <span className="text-secondary">Gross Loss: <span className="num text-loss font-medium">{formatCurrency(activeMetrics.grossLoss)}</span></span>
          </div>
        </div>

        {/* Card 2: Win Rate & Outcomes */}
        <div className="border-hairline bg-surface rounded-card border p-3.5 flex flex-col justify-between">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Win Rate & Breakdown</p>
          <p className="num text-primary text-xl font-bold mt-1">
            {(activeMetrics.winRateVal * 100).toFixed(1)}%
          </p>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-hairline/40">
            <span className="text-secondary">Wins: <span className="num text-primary font-medium">{activeMetrics.winCount}</span></span>
            <span className="text-secondary">Losses: <span className="num text-primary font-medium">{activeMetrics.lossCount}</span></span>
            <span className="text-secondary">BE: <span className="num text-primary font-medium">{activeMetrics.beCount}</span></span>
          </div>
        </div>

        {/* Card 3: Profit Factor & Expectancy */}
        <div className="border-hairline bg-surface rounded-card border p-3.5 flex flex-col justify-between">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Profit Factor & Expectancy</p>
          <p className="num text-primary text-xl font-bold mt-1">
            {activeMetrics.profitFactorVal != null ? activeMetrics.profitFactorVal.toFixed(2) : '—'}
          </p>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-hairline/40">
            <span className="text-secondary">Expectancy:</span>
            <span className={cn('num font-semibold', (activeMetrics.expectancyVal ?? 0) > 0 ? 'text-gain' : (activeMetrics.expectancyVal ?? 0) < 0 ? 'text-loss' : 'text-primary')}>
              {activeMetrics.expectancyVal != null ? `${formatSignedCurrency(activeMetrics.expectancyVal)} / trade` : '—'}
            </span>
          </div>
        </div>

        {/* Card 4: Avg R & Max Drawdown */}
        <div className="border-hairline bg-surface rounded-card border p-3.5 flex flex-col justify-between">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Avg R-Multiple & Drawdown</p>
          <p className={cn('num text-xl font-bold mt-1', (activeMetrics.avgRVal ?? 0) > 0 ? 'text-gain' : (activeMetrics.avgRVal ?? 0) < 0 ? 'text-loss' : 'text-primary')}>
            {formatR(activeMetrics.avgRVal)}
          </p>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-hairline/40">
            <span className="text-secondary">Max Drawdown:</span>
            <span className="num text-primary font-semibold">{activeMetrics.maxDrawdownVal.toFixed(1)}%</span>
          </div>
        </div>

        {/* Card 5: Trade Duration */}
        <div className="border-hairline bg-surface rounded-card border p-3.5 flex flex-col justify-between">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Average Holding Time</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="h-4 w-4 text-tertiary" />
            <p className="num text-primary text-xl font-bold">
              {formatDuration(activeMetrics.avgDurationMs)}
            </p>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-hairline/40">
            <span className="text-secondary">Min: <span className="num text-primary">{formatDuration(activeMetrics.minDurationMs)}</span></span>
            <span className="text-secondary">Max: <span className="num text-primary">{formatDuration(activeMetrics.maxDurationMs)}</span></span>
          </div>
        </div>

        {/* Card 6: Best & Worst Trade */}
        <div className="border-hairline bg-surface rounded-card border p-3.5 flex flex-col justify-between">
          <p className="text-tertiary text-[10px] uppercase tracking-wide">Best & Worst Outcome</p>
          <div className="flex items-center justify-between mt-1">
            <div>
              <span className="text-[10px] text-tertiary uppercase">Best:</span>
              <p className="num text-gain font-semibold text-sm">
                {activeMetrics.bestTradePnl != null ? formatSignedCurrency(activeMetrics.bestTradePnl) : '—'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-tertiary uppercase">Worst:</span>
              <p className="num text-loss font-semibold text-sm">
                {activeMetrics.worstTradePnl != null ? formatSignedCurrency(activeMetrics.worstTradePnl) : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-hairline/40">
            <span className="text-secondary">Carrying Costs:</span>
            <span className="num text-primary font-medium">{formatCurrency(activeMetrics.totalCarryingCosts)}</span>
          </div>
        </div>
      </div>

      {/* PROPORTIONAL WIN / LOSS / BE VISUAL BAR */}
      {activeMetrics.closedTradesCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-tertiary font-display uppercase tracking-wide">Outcome Distribution</span>
            <span className="num text-secondary">
              {activeMetrics.winCount}W ({((activeMetrics.winCount / activeMetrics.closedTradesCount) * 100).toFixed(0)}%) ·{' '}
              {activeMetrics.lossCount}L ({((activeMetrics.lossCount / activeMetrics.closedTradesCount) * 100).toFixed(0)}%) ·{' '}
              {activeMetrics.beCount}BE ({((activeMetrics.beCount / activeMetrics.closedTradesCount) * 100).toFixed(0)}%)
            </span>
          </div>
          <div className="h-2 w-full bg-surface-raised rounded-card border border-hairline overflow-hidden flex">
            {activeMetrics.winCount > 0 && (
              <div
                className="bg-gain h-full transition-all duration-300"
                style={{ width: `${(activeMetrics.winCount / activeMetrics.closedTradesCount) * 100}%` }}
                title={`Wins: ${activeMetrics.winCount}`}
              />
            )}
            {activeMetrics.lossCount > 0 && (
              <div
                className="bg-loss h-full transition-all duration-300"
                style={{ width: `${(activeMetrics.lossCount / activeMetrics.closedTradesCount) * 100}%` }}
                title={`Losses: ${activeMetrics.lossCount}`}
              />
            )}
            {activeMetrics.beCount > 0 && (
              <div
                className="bg-tertiary h-full transition-all duration-300"
                style={{ width: `${(activeMetrics.beCount / activeMetrics.closedTradesCount) * 100}%` }}
                title={`Break-Even: ${activeMetrics.beCount}`}
              />
            )}
          </div>
        </div>
      )}

      {/* DIRECTIONAL BREAKDOWN (LONG vs SHORT) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border-hairline bg-surface-raised/30 rounded-card border p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-accent-signal" />
            <div>
              <p className="font-display text-xs text-primary font-medium uppercase">Long Trades</p>
              <p className="num text-[11px] text-tertiary">
                {activeMetrics.longTradesCount} trades · {(activeMetrics.longWinRate * 100).toFixed(1)}% WR
              </p>
            </div>
          </div>
          <p className={cn('num text-sm font-semibold', activeMetrics.longNetPnl > 0 ? 'text-gain' : activeMetrics.longNetPnl < 0 ? 'text-loss' : 'text-secondary')}>
            {formatSignedCurrency(activeMetrics.longNetPnl)}
          </p>
        </div>

        <div className="border-hairline bg-surface-raised/30 rounded-card border p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-accent-alert" />
            <div>
              <p className="font-display text-xs text-primary font-medium uppercase">Short Trades</p>
              <p className="num text-[11px] text-tertiary">
                {activeMetrics.shortTradesCount} trades · {(activeMetrics.shortWinRate * 100).toFixed(1)}% WR
              </p>
            </div>
          </div>
          <p className={cn('num text-sm font-semibold', activeMetrics.shortNetPnl > 0 ? 'text-gain' : activeMetrics.shortNetPnl < 0 ? 'text-loss' : 'text-secondary')}>
            {formatSignedCurrency(activeMetrics.shortNetPnl)}
          </p>
        </div>
      </div>

      {/* COMPREHENSIVE ASSETS TELEMETRY COMPARISON TABLE */}
      <div className="space-y-3 pt-2">
        <h3 className="font-display text-primary text-xs uppercase tracking-wide">
          Asset Comparison Matrix
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-hairline/60">
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 font-normal">
                  Instrument
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Trades
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  % Alloc
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Net P&L
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Win Rate
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Profit Factor
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Expectancy
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Avg Duration
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Long / Short
                </th>
                <th className="text-tertiary text-[9px] uppercase tracking-wider font-display pb-2 text-right font-normal">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {allAssets.map((asset) => {
                const m = allAssetMetrics[asset];
                const isSelected = activeSelectedAsset === asset;
                return (
                  <tr
                    key={asset}
                    onClick={() => handleSelectAsset(asset)}
                    className={cn(
                      'border-b border-hairline/30 last:border-0 transition-colors duration-150 cursor-pointer',
                      isSelected
                        ? 'bg-surface-raised text-accent-signal'
                        : 'hover:bg-surface-raised/40 text-primary'
                    )}
                  >
                    <td className="py-2.5 font-display text-xs font-semibold uppercase tracking-tight">
                      <span className={isSelected ? 'text-accent-signal' : 'text-primary'}>
                        {asset}
                      </span>
                    </td>
                    <td className="num py-2.5 text-right text-xs text-primary font-medium">
                      {m.totalTrades}
                    </td>
                    <td className="num py-2.5 text-right text-xs text-secondary">
                      {m.allocPct.toFixed(1)}%
                    </td>
                    <td className={cn('num py-2.5 text-right text-xs font-semibold', m.netPnl > 0 ? 'text-gain' : m.netPnl < 0 ? 'text-loss' : 'text-secondary')}>
                      {formatSignedCurrency(m.netPnl)}
                    </td>
                    <td className="num py-2.5 text-right text-xs text-primary font-medium">
                      {(m.winRateVal * 100).toFixed(1)}%
                    </td>
                    <td className="num py-2.5 text-right text-xs text-secondary">
                      {m.profitFactorVal != null ? m.profitFactorVal.toFixed(2) : '—'}
                    </td>
                    <td className={cn('num py-2.5 text-right text-xs font-medium', (m.expectancyVal ?? 0) > 0 ? 'text-gain' : (m.expectancyVal ?? 0) < 0 ? 'text-loss' : 'text-secondary')}>
                      {m.expectancyVal != null ? formatSignedCurrency(m.expectancyVal) : '—'}
                    </td>
                    <td className="num py-2.5 text-right text-xs text-secondary">
                      {formatDuration(m.avgDurationMs)}
                    </td>
                    <td className="num py-2.5 text-right text-xs text-tertiary">
                      {m.longTradesCount}L / {m.shortTradesCount}S
                    </td>
                    <td className="py-2.5 text-right text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAsset(asset);
                        }}
                        className="text-accent-signal hover:underline text-[11px] font-sans font-medium"
                      >
                        {isSelected ? 'Selected' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Format currency amount */
function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format signed currency amount with + or - */
function formatSignedCurrency(amount: number): string {
  if (amount === 0) return '$0.00';
  const sign = amount > 0 ? '+' : '−';
  return `${sign}${formatCurrency(amount)}`;
}

/** Format average R multiple */
function formatR(r: number | null): string {
  if (r == null) return '—';
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toFixed(2)}R`;
}

/** Format trade duration in milliseconds */
function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return '—';
  const totalSecs = Math.floor(ms / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const totalMins = Math.floor(totalSecs / 60);
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}
