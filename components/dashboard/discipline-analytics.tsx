'use client';

import React from 'react';
import {
  Shield,
  TrendingUp,
  Calendar,
  Clock,
  Award,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Activity,
  Flame,
  Target,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AnalyticsTrade {
  id?: string;
  status?: string;
  pnl?: number | null;
  rMultiple?: number | null;
  entryTime?: string | null;
  exitTime?: string | null;
  instrument?: string | null;
  direction?: string | null;
  pretradeChecklist?: Array<{ id: string; text: string; category: string; checked: boolean }>;
}

interface DisciplineAnalyticsProps {
  trades: ReadonlyArray<AnalyticsTrade>;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function DisciplineAnalytics({ trades }: DisciplineAnalyticsProps) {
  const closed = trades.filter((t) => t.status === 'closed' && t.pnl !== null);

  // 1. Hold Time Analysis
  let winDurationSum = 0;
  let winCount = 0;
  let lossDurationSum = 0;
  let lossCount = 0;
  let maxDuration = 0;

  for (const t of closed) {
    if (!t.entryTime || !t.exitTime) continue;
    const entry = new Date(t.entryTime).getTime();
    const exit = new Date(t.exitTime).getTime();
    const duration = exit - entry;
    if (duration <= 0) continue;

    if (duration > maxDuration) {
      maxDuration = duration;
    }

    const pnl = t.pnl ?? 0;
    if (pnl > 0) {
      winDurationSum += duration;
      winCount++;
    } else if (pnl < 0) {
      lossDurationSum += duration;
      lossCount++;
    }
  }

  const avgWinDuration = winCount > 0 ? winDurationSum / winCount : 0;
  const avgLossDuration = lossCount > 0 ? lossDurationSum / lossCount : 0;
  const holdTimeRatio = avgLossDuration > 0 ? avgWinDuration / avgLossDuration : null;

  // 2. Realized R-Multiple Profile
  let winRSum = 0;
  let winRCount = 0;
  let lossRSum = 0;
  let lossRCount = 0;

  for (const t of closed) {
    const r = t.rMultiple;
    if (r == null) continue;
    const pnl = t.pnl ?? 0;
    if (pnl > 0) {
      winRSum += r;
      winRCount++;
    } else if (pnl < 0) {
      lossRSum += r;
      lossRCount++;
    }
  }

  const avgWinR = winRCount > 0 ? winRSum / winRCount : 0;
  const avgLossR = lossRCount > 0 ? lossRSum / lossRCount : 0;
  const rRatio = avgLossR !== 0 ? avgWinR / Math.abs(avgLossR) : null;

  // 3. Rule Compliance Rate
  let tradesWithChecklist = 0;
  let totalRulesCleared = 0;
  let totalRulesEvaluated = 0;

  for (const t of trades) {
    if (t.pretradeChecklist && t.pretradeChecklist.length > 0) {
      tradesWithChecklist++;
      const cleared = t.pretradeChecklist.filter((r) => r.checked).length;
      totalRulesCleared += cleared;
      totalRulesEvaluated += t.pretradeChecklist.length;
    }
  }

  const complianceRate =
    totalRulesEvaluated > 0 ? Math.round((totalRulesCleared / totalRulesEvaluated) * 100) : null;

  // 4. Session Breakdown (London, NY, Asia, Late NY)
  const sessionStats = {
    London: { count: 0, wins: 0, pnl: 0 },
    'New York': { count: 0, wins: 0, pnl: 0 },
    Asia: { count: 0, wins: 0, pnl: 0 },
    'Late NY': { count: 0, wins: 0, pnl: 0 },
  };

  for (const t of closed) {
    if (!t.entryTime) continue;
    const utcHour = new Date(t.entryTime).getUTCHours();
    let sessionName: keyof typeof sessionStats = 'London';
    if (utcHour >= 22 || utcHour < 6) {
      sessionName = 'Asia';
    } else if (utcHour >= 6 && utcHour < 12) {
      sessionName = 'London';
    } else if (utcHour >= 12 && utcHour < 20) {
      sessionName = 'New York';
    } else {
      sessionName = 'Late NY';
    }

    const pnl = t.pnl ?? 0;
    sessionStats[sessionName].count++;
    sessionStats[sessionName].pnl += pnl;
    if (pnl > 0) sessionStats[sessionName].wins++;
  }

  // Find best performing session
  let bestSession = 'London';
  let maxSessionPnl = -Infinity;
  for (const [sess, stat] of Object.entries(sessionStats)) {
    if (stat.count > 0 && stat.pnl > maxSessionPnl) {
      maxSessionPnl = stat.pnl;
      bestSession = sess;
    }
  }

  // 5. Weekday Analytics (Monday - Friday)
  const weekdayStats: Record<number, { pnl: number; count: number; wins: number }> = {
    1: { pnl: 0, count: 0, wins: 0 },
    2: { pnl: 0, count: 0, wins: 0 },
    3: { pnl: 0, count: 0, wins: 0 },
    4: { pnl: 0, count: 0, wins: 0 },
    5: { pnl: 0, count: 0, wins: 0 },
  };

  for (const t of closed) {
    if (!t.entryTime) continue;
    const day = new Date(t.entryTime).getDay();
    if (day >= 1 && day <= 5) {
      const pnl = t.pnl ?? 0;
      weekdayStats[day].pnl += pnl;
      weekdayStats[day].count++;
      if (pnl > 0) weekdayStats[day].wins++;
    }
  }

  // Calculate Overall Discipline Score (0–100)
  let disciplineScore = 75; // baseline
  if (holdTimeRatio !== null) {
    disciplineScore += holdTimeRatio >= 1.0 ? 10 : -10;
  }
  if (rRatio !== null) {
    disciplineScore += rRatio >= 1.5 ? 10 : -5;
  }
  if (complianceRate !== null) {
    disciplineScore += complianceRate >= 80 ? 10 : -5;
  }
  if (sessionStats.Asia.count > 0) {
    disciplineScore -= 10; // Asia violation penalty
  }
  disciplineScore = Math.max(0, Math.min(100, disciplineScore));

  return (
    <div className="border-hairline bg-surface rounded-card border p-4 sm:p-5 flex flex-col gap-5 w-full">
      {/* Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline/60 pb-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-accent-signal" />
          <h2 className="font-display text-primary text-xs uppercase tracking-wide">
            Behavioral Consistency &amp; Discipline Analytics
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-tertiary text-[10px] uppercase font-display">Discipline Index</span>
          <span
            className={cn(
              'num text-xs font-mono font-bold px-2 py-0.5 rounded border',
              disciplineScore >= 80
                ? 'border-gain/40 bg-gain/10 text-gain'
                : disciplineScore >= 60
                ? 'border-accent-signal/40 bg-accent-signal/10 text-accent-signal'
                : 'border-loss/40 bg-loss/10 text-loss'
            )}
          >
            {disciplineScore} / 100
          </span>
        </div>
      </div>

      {/* TOP TELEMETRY STRIP (4 KPI CARDS) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Hold Time Ratio */}
        <div className="border-hairline bg-[#14171C]/50 rounded-card border p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-[9px] uppercase tracking-wider font-display mb-1">
            <span>Hold Ratio</span>
            <Clock size={12} className="text-accent-signal" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="num text-primary text-lg font-bold">
              {holdTimeRatio !== null ? `${holdTimeRatio.toFixed(2)}x` : '—'}
            </span>
            {holdTimeRatio !== null && (
              <span className={cn('text-[9px] font-semibold truncate', holdTimeRatio >= 1.0 ? 'text-gain' : 'text-accent-alert')}>
                {holdTimeRatio >= 1.0 ? 'Cutting Losses' : 'Holding Losers'}
              </span>
            )}
          </div>
          <span className="text-tertiary text-[9px] mt-1.5 font-mono">
            Win: {formatDuration(avgWinDuration)} | Loss: {formatDuration(avgLossDuration)}
          </span>
        </div>

        {/* KPI 2: Realized R:R Ratio */}
        <div className="border-hairline bg-[#14171C]/50 rounded-card border p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-[9px] uppercase tracking-wider font-display mb-1">
            <span>Realized R:R</span>
            <TrendingUp size={12} className="text-accent-signal" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="num text-primary text-lg font-bold">
              {rRatio !== null ? `${rRatio.toFixed(2)}:1` : '—'}
            </span>
            {rRatio !== null && (
              <span className={cn('text-[9px] font-semibold truncate', rRatio >= 1.5 ? 'text-gain' : 'text-accent-alert')}>
                {rRatio >= 1.5 ? 'Healthy' : 'Tight Expectancy'}
              </span>
            )}
          </div>
          <span className="text-tertiary text-[9px] mt-1.5 font-mono">
            Avg Win: +{avgWinR.toFixed(1)}R | Avg Loss: {avgLossR.toFixed(1)}R
          </span>
        </div>

        {/* KPI 3: Rule Compliance */}
        <div className="border-hairline bg-[#14171C]/50 rounded-card border p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-[9px] uppercase tracking-wider font-display mb-1">
            <span>Rule Compliance</span>
            <CheckCircle2 size={12} className="text-accent-signal" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="num text-primary text-lg font-bold">
              {complianceRate !== null ? `${complianceRate}%` : '—'}
            </span>
            <span className="text-tertiary text-[9px]">
              {tradesWithChecklist} trades tracked
            </span>
          </div>
          <span className="text-tertiary text-[9px] mt-1.5 font-mono">
            {totalRulesCleared} / {totalRulesEvaluated} Checklist Items Cleared
          </span>
        </div>

        {/* KPI 4: Best Trading Session */}
        <div className="border-hairline bg-[#14171C]/50 rounded-card border p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-tertiary text-[9px] uppercase tracking-wider font-display mb-1">
            <span>Primary Session Edge</span>
            <Globe size={12} className="text-accent-signal" />
          </div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-primary text-base font-bold uppercase truncate font-display">
              {closed.length > 0 ? bestSession : '—'}
            </span>
          </div>
          <span className="text-tertiary text-[9px] mt-1.5 font-mono">
            {sessionStats[bestSession as keyof typeof sessionStats]?.count || 0} Trades | Net: ${maxSessionPnl > -Infinity ? maxSessionPnl.toFixed(2) : '0.00'}
          </span>
        </div>
      </div>

      {/* ROW 2: SESSION DISTRIBUTION & HOLD DURATION (2-COLUMN GRID) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Section 1: Session Execution Distribution */}
        <div className="border-hairline bg-[#14171C]/40 rounded-card border p-3.5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
            <div className="flex items-center gap-1.5">
              <Globe size={12} className="text-accent-signal" />
              <span className="text-tertiary text-[10px] uppercase tracking-wider font-display font-semibold">
                Session Performance
              </span>
            </div>
            {sessionStats.Asia.count > 0 ? (
              <span className="text-[9px] font-mono text-loss font-semibold flex items-center gap-1 bg-loss/10 border border-loss/20 px-1.5 py-0.5 rounded">
                <AlertTriangle size={10} /> {sessionStats.Asia.count} Asia Trades
              </span>
            ) : (
              <span className="text-[9px] font-mono text-gain font-semibold">
                ✓ No Asia Trades
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {(['London', 'New York', 'Asia', 'Late NY'] as const).map((sess) => {
              const stat = sessionStats[sess];
              const winRate = stat.count > 0 ? Math.round((stat.wins / stat.count) * 100) : 0;
              return (
                <div key={sess} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-secondary font-medium">{sess}</span>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-tertiary">{stat.count} trades</span>
                      <span className={cn('font-semibold', stat.pnl > 0 ? 'text-gain' : stat.pnl < 0 ? 'text-loss' : 'text-tertiary')}>
                        {stat.pnl >= 0 ? '+' : ''}${stat.pnl.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-base border border-hairline">
                    <div
                      style={{ width: `${Math.min(100, winRate)}%` }}
                      className={cn(
                        'h-full transition-all rounded-full',
                        stat.pnl > 0 ? 'bg-accent-signal' : stat.pnl < 0 ? 'bg-loss' : 'bg-tertiary/40'
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Hold Time Breakdown & Max Hold */}
        <div className="border-hairline bg-[#14171C]/40 rounded-card border p-3.5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
            <div className="flex items-center gap-1.5">
              <Clock size={12} className="text-accent-signal" />
              <span className="text-tertiary text-[10px] uppercase tracking-wider font-display font-semibold">
                Hold Duration Metrics
              </span>
            </div>
            <span className="text-tertiary text-[9px] font-mono">
              Max: {formatDuration(maxDuration)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border-hairline bg-surface rounded-card border p-2.5 text-center">
              <span className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                Avg Winner Duration
              </span>
              <span className="num text-gain font-mono font-bold text-sm block">
                {formatDuration(avgWinDuration)}
              </span>
            </div>
            <div className="border-hairline bg-surface rounded-card border p-2.5 text-center">
              <span className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                Avg Loser Duration
              </span>
              <span className="num text-loss font-mono font-bold text-sm block">
                {formatDuration(avgLossDuration)}
              </span>
            </div>
          </div>

          <div className="border-t border-hairline/60 pt-2 text-[10px] text-tertiary leading-relaxed">
            {holdTimeRatio !== null ? (
              holdTimeRatio >= 1.0 ? (
                <p className="text-gain flex items-center gap-1">
                  <CheckCircle2 size={11} className="shrink-0" />
                  Winners are held <span className="font-bold">{holdTimeRatio.toFixed(1)}x</span> longer than losers. Excellent exit discipline.
                </p>
              ) : (
                <p className="text-accent-alert flex items-center gap-1">
                  <AlertTriangle size={11} className="shrink-0" />
                  Losers are held longer than winners. Consider tightening stop-loss discipline.
                </p>
              )
            ) : (
              <p>Log trades with entry and exit timestamps to unlock hold duration profiling.</p>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: FULL-WIDTH NET P&L BY WEEKDAY TABLE */}
      <div className="border-hairline bg-[#14171C]/40 rounded-card border p-4 flex flex-col space-y-3 w-full">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-2.5">
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-accent-signal" />
            <span className="text-tertiary text-[10px] uppercase tracking-wider font-display font-semibold">
              Net Performance &amp; Consistency by Weekday
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-tertiary">
              Best Day:{' '}
              <span className="text-gain font-semibold">
                {(() => {
                  let bestDay = 'Tuesday';
                  let maxPnl = -Infinity;
                  for (const d of [1, 2, 3, 4, 5]) {
                    if (weekdayStats[d].pnl > maxPnl && weekdayStats[d].count > 0) {
                      maxPnl = weekdayStats[d].pnl;
                      bestDay = WEEKDAYS[d];
                    }
                  }
                  return maxPnl > -Infinity ? `${bestDay} (+$${maxPnl.toFixed(2)})` : '—';
                })()}
              </span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse text-xs min-w-[500px]">
            <thead>
              <tr className="border-b border-hairline/60 text-[9px] text-tertiary uppercase tracking-wider font-display">
                <th className="pb-2 font-semibold">Trading Day</th>
                <th className="pb-2 font-semibold text-center">Trades Logged</th>
                <th className="pb-2 font-semibold text-center">Win Rate %</th>
                <th className="pb-2 font-semibold text-right">Net P&amp;L</th>
                <th className="pb-2 font-semibold text-right w-36">Distribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/40">
              {[1, 2, 3, 4, 5].map((dayIdx) => {
                const stats = weekdayStats[dayIdx];
                const winPct = stats.count > 0 ? Math.round((stats.wins / stats.count) * 100) : 0;
                return (
                  <tr key={dayIdx} className="hover:bg-surface-raised/60 transition-colors duration-150">
                    <td className="py-2.5 text-primary font-medium text-xs">
                      {WEEKDAYS[dayIdx]}
                    </td>
                    <td className="py-2.5 text-center num text-tertiary font-mono">
                      {stats.count}
                    </td>
                    <td className="py-2.5 text-center num text-secondary font-mono">
                      {stats.count > 0 ? (
                        <span className={cn('px-1.5 py-0.5 rounded border border-hairline text-[10px]', winPct >= 50 ? 'text-gain bg-gain/5' : 'text-loss bg-loss/5')}>
                          {winPct}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className={cn(
                        'py-2.5 text-right num font-mono font-bold text-xs',
                        stats.pnl > 0 ? 'text-gain' : stats.pnl < 0 ? 'text-loss' : 'text-secondary'
                      )}
                    >
                      {stats.pnl !== 0
                        ? `${stats.pnl > 0 ? '+' : ''}$${stats.pnl.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : '$0.00'}
                    </td>
                    <td className="py-2.5 pl-4 text-right">
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-base border border-hairline ml-auto">
                        <div
                          style={{ width: `${Math.min(100, Math.max(5, winPct))}%` }}
                          className={cn(
                            'h-full transition-all rounded-full',
                            stats.pnl > 0 ? 'bg-gain' : stats.pnl < 0 ? 'bg-loss' : 'bg-tertiary/30'
                          )}
                        />
                      </div>
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
