'use client';

import React from 'react';
import { Shield, TrendingUp, Calendar, Clock, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalyticsTrade {
  status?: string;
  pnl?: number | null;
  rMultiple?: number | null;
  entryTime?: string | null;
  exitTime?: string | null;
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

  for (const t of closed) {
    if (!t.entryTime || !t.exitTime) continue;
    const entry = new Date(t.entryTime).getTime();
    const exit = new Date(t.exitTime).getTime();
    const duration = exit - entry;
    if (duration <= 0) continue;

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

  // 3. Performance by Weekday (Monday - Friday)
  const weekdayStats: Record<number, { pnl: number; count: number }> = {
    1: { pnl: 0, count: 0 },
    2: { pnl: 0, count: 0 },
    3: { pnl: 0, count: 0 },
    4: { pnl: 0, count: 0 },
    5: { pnl: 0, count: 0 }
  };

  for (const t of closed) {
    if (!t.entryTime) continue;
    const day = new Date(t.entryTime).getDay();
    if (day >= 1 && day <= 5) {
      weekdayStats[day].pnl += t.pnl ?? 0;
      weekdayStats[day].count++;
    }
  }

  return (
    <div className="border-hairline bg-surface rounded-card border p-4 flex flex-col gap-6 h-full">
      <div className="flex items-center gap-2 border-b border-hairline/60 pb-2">
        <Shield size={14} className="text-accent-signal" />
        <h2 className="font-display text-primary text-xs uppercase tracking-wide">
          Behavioral Consistency & Discipline Analytics
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Card Column: Hold Times & R-Multiples */}
        <div className="space-y-4">
          {/* Hold Time Analytics */}
          <div className="border-hairline bg-[#14171C]/40 border rounded-card p-3 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={12} className="text-accent-signal" />
              <span className="text-tertiary text-[9px] uppercase tracking-wider font-display">
                Hold Time Ratio (Wins vs Losses)
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="num text-primary text-lg font-semibold">
                {holdTimeRatio !== null ? `${holdTimeRatio.toFixed(2)}x` : '—'}
              </span>
              {holdTimeRatio !== null && (
                <span className={cn("text-[10px] font-semibold", holdTimeRatio >= 1.0 ? "text-gain" : "text-accent-alert")}>
                  {holdTimeRatio >= 1.0 ? 'Discipline: CUTTING LOSSES' : 'Warning: HOLDING LOSERS'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3 pt-2.5 border-t border-hairline/60 text-[10px] text-tertiary">
              <div>
                <span>Avg Winner Hold</span>
                <span className="num text-primary block font-mono font-semibold mt-0.5">
                  {formatDuration(avgWinDuration)}
                </span>
              </div>
              <div>
                <span>Avg Loser Hold</span>
                <span className="num text-primary block font-mono font-semibold mt-0.5">
                  {formatDuration(avgLossDuration)}
                </span>
              </div>
            </div>
          </div>

          {/* R-Multiple Ratio Profile */}
          <div className="border-hairline bg-[#14171C]/40 border rounded-card p-3 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp size={12} className="text-accent-signal" />
              <span className="text-tertiary text-[9px] uppercase tracking-wider font-display">
                Realized Risk-to-Reward Ratio
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="num text-primary text-lg font-semibold">
                {rRatio !== null ? `${rRatio.toFixed(2)}:1` : '—'}
              </span>
              {rRatio !== null && (
                <span className={cn("text-[10px] font-semibold", rRatio >= 1.5 ? "text-gain" : "text-accent-alert")}>
                  {rRatio >= 1.5 ? 'Expectancy Profile: HEALTHY' : 'Expectancy Profile: CONGESTED'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3 pt-2.5 border-t border-hairline/60 text-[10px] text-tertiary">
              <div>
                <span>Avg Win R-Mult</span>
                <span className="num text-gain block font-mono font-semibold mt-0.5">
                  {avgWinR > 0 ? `+${avgWinR.toFixed(2)}R` : '0.00R'}
                </span>
              </div>
              <div>
                <span>Avg Loss R-Mult</span>
                <span className="num text-loss block font-mono font-semibold mt-0.5">
                  {avgLossR < 0 ? `${avgLossR.toFixed(2)}R` : '0.00R'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Table Column: Weekday Analytics */}
        <div className="border-hairline bg-[#14171C]/40 border rounded-card p-3 flex flex-col">
          <div className="flex items-center gap-1.5 mb-3">
            <Calendar size={12} className="text-accent-signal" />
            <span className="text-tertiary text-[9px] uppercase tracking-wider font-display">
              Net Performance by Weekday
            </span>
          </div>

          <div className="flex-1 overflow-hidden">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-hairline/60 text-[9px] text-tertiary uppercase tracking-wider font-display">
                  <th className="pb-1.5 font-semibold">Day</th>
                  <th className="pb-1.5 font-semibold text-right">Trades</th>
                  <th className="pb-1.5 font-semibold text-right">Net P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/40">
                {[1, 2, 3, 4, 5].map((dayIdx) => {
                  const stats = weekdayStats[dayIdx];
                  return (
                    <tr key={dayIdx} className="hover:bg-surface-raised transition-colors duration-150">
                      <td className="py-2 text-secondary font-medium">
                        {WEEKDAYS[dayIdx]}
                      </td>
                      <td className="py-2 text-right num text-tertiary font-mono">
                        {stats.count}
                      </td>
                      <td className={cn(
                        "py-2 text-right num font-mono font-semibold",
                        stats.pnl > 0 ? "text-gain" : stats.pnl < 0 ? "text-loss" : "text-secondary"
                      )}>
                        {stats.pnl !== 0 
                          ? `${stats.pnl > 0 ? '+' : ''}${stats.pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '$0.00'
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
