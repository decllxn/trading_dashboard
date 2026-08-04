'use client';

import React, { useState } from 'react';
import { Target, CheckCircle2, Lock, BookOpen, Calculator, Sparkles, TrendingUp, ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVELS, resolveActiveLevel, type Level } from '@/lib/levels';

interface GamificationContainerProps {
  currentBalance: number;
  startingBalance: number;
  totalClosedNetPnl: number;
  highestAchievedLevel?: number;
}

const INITIAL_CHECKLIST = [
  { id: 1, text: "Stop loss and position sizes are pre-calculated before entry.", checked: false },
  { id: 2, text: "I am risking exactly 10% of the active level base ($15 to $100k+).", checked: false },
  { id: 3, text: "I am trading a proven setup that matches my rule checklist.", checked: false },
  { id: 4, text: "I will not adjust or widen my stop loss mid-trade.", checked: false },
  { id: 5, text: "My mental state is neutral (no revenge trading, impatience, or greed).", checked: false },
];

export function GamificationContainer({
  currentBalance,
  startingBalance,
  totalClosedNetPnl,
  highestAchievedLevel = 0,
}: GamificationContainerProps) {
  // Simulator State (allows user to see projection)
  const [simulatedBalance, setSimulatedBalance] = useState<number | null>(null);
  const activeBalance = simulatedBalance !== null ? simulatedBalance : currentBalance;

  // Active level calculation with 5R demotion buffer & sticky high-water mark
  const resolved = resolveActiveLevel(
    activeBalance,
    simulatedBalance !== null ? 0 : highestAchievedLevel
  );
  const activeLevelIdx = resolved.activeLevelIdx;
  const activeLevel = resolved.activeLevel;
  const nextLevel = resolved.nextLevel;
  const demotionFloor = resolved.demotionFloor;

  // Level progress calculation
  let levelProgress = 0;
  let gapToNext = 0;
  if (nextLevel) {
    const range = nextLevel.target - activeLevel.target;
    const currentProgress = activeBalance - activeLevel.target;
    levelProgress = Math.max(0, Math.min(100, (currentProgress / range) * 100));
    gapToNext = nextLevel.target - activeBalance;
  } else {
    levelProgress = 100;
  }

  // Psychology checklists
  const [checklist, setChecklist] = useState(INITIAL_CHECKLIST);

  const toggleCheck = (id: number) => {
    setChecklist(
      checklist.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  // Projection Calculations
  const [simWinRate, setSimWinRate] = useState<number>(50); // 50%
  const [simRR, setSimRR] = useState<number>(2); // 2R
  const [simTrades, setSimTrades] = useState<number>(20);

  // Expected growth simulation: P(win)*Risk*RR + P(loss)*(-Risk)
  const expectedValuePerTrade = (simWinRate / 100) * simRR - (1 - simWinRate / 100);
  const projectedBalance = activeBalance * Math.pow(1 + 0.1 * expectedValuePerTrade, simTrades);

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div>
        <h1 className="font-display text-primary text-xl">Rank Progression</h1>
        <p className="text-secondary mt-1 text-sm">
          Scale your manual trading account from $150 to $1,000,000 using disciplined, size-doubling risk stages.
        </p>
      </div>

      {/* Hero Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border-hairline bg-surface rounded-card border p-4 flex flex-col justify-between">
          <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
            Current Balance
          </span>
          <span className={cn("num text-lg font-semibold block mt-1", totalClosedNetPnl >= 0 ? "text-gain" : "text-loss")}>
            ${activeBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="border-hairline bg-surface rounded-card border p-4 flex flex-col justify-between">
          <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
            Current Rank
          </span>
          <span className="font-display text-primary text-sm font-semibold block mt-2">
            Lv. {activeLevel.level} — {activeLevel.rank}
          </span>
        </div>

        <div className="border-hairline bg-surface rounded-card border p-4 flex flex-col justify-between">
          <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
            Stage Risk Size
          </span>
          <span className="num text-primary text-lg font-semibold block mt-1">
            ${activeLevel.risk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="border-hairline bg-surface rounded-card border p-4 flex flex-col justify-between">
          <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
            Next Milestone Target
          </span>
          {nextLevel ? (
            <span className="num text-primary text-lg font-semibold block mt-1">
              ${nextLevel.target.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          ) : (
            <span className="num text-accent-signal text-lg font-semibold block mt-1">
              MILLION REACHED
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="border-hairline bg-surface rounded-card border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-secondary text-xs font-semibold">
            Stage Graduation Progress
          </span>
          {nextLevel ? (
            <span className="num text-secondary text-xs">
              Need ${gapToNext.toLocaleString('en-US', { minimumFractionDigits: 2 })} to reach Lv. {nextLevel.level}
            </span>
          ) : (
            <span className="text-accent-signal text-xs">
              You are at the maximum level!
            </span>
          )}
        </div>
        <div className="h-2 w-full bg-surface-raised border border-hairline rounded-sm overflow-hidden">
          <div 
            className="h-full bg-accent-signal transition-all duration-300"
            style={{ width: `${levelProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 flex-wrap gap-1">
          <span className="num text-tertiary text-[10px]">
            Stage Base: ${activeLevel.target.toLocaleString('en-US')}
          </span>
          <span className="num text-tertiary text-[10px]">
            {levelProgress.toFixed(1)}% Completed
          </span>
          {activeLevelIdx > 0 && (
            <span className="num text-accent-alert/80 text-[10px] flex items-center gap-1" title="Demotion only occurs if your balance drops 5R below stage target">
              <ShieldAlert size={10} className="text-accent-alert" />
              Demotion Floor: ${demotionFloor.toLocaleString('en-US')} (5R Buffer)
            </span>
          )}
          {nextLevel && (
            <span className="num text-tertiary text-[10px]">
              Next Base: ${nextLevel.target.toLocaleString('en-US')}
            </span>
          )}
        </div>
      </div>

      {/* Two Column Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left Column: Milestones Timeline */}
        <div className="space-y-4">
          <h2 className="font-display text-primary text-xs uppercase tracking-wider mb-2">
            Account Level Milestones
          </h2>

          <div className="space-y-3">
            {LEVELS.map((lvl) => {
              const isCompleted = activeLevelIdx > lvl.level;
              const isActive = activeLevelIdx === lvl.level;
              const isLocked = activeLevelIdx < lvl.level;

              return (
                <div 
                  key={lvl.level}
                  className={cn(
                    "border-hairline rounded-card border p-4 transition-colors duration-150 relative",
                    isActive ? "bg-surface border-accent-signal" : "bg-surface/50",
                    isLocked && "opacity-45"
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-sm bg-surface-raised border border-hairline">
                        {isCompleted && (
                          <CheckCircle2 size={14} className="text-accent-signal" />
                        )}
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-accent-signal animate-pulse" />
                        )}
                        {isLocked && (
                          <Lock size={12} className="text-tertiary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-primary text-sm font-semibold">
                            Lv. {lvl.level} — {lvl.rank}
                          </span>
                          {isActive && (
                            <span className="bg-accent-signal/15 text-accent-signal border border-accent-signal/30 text-[9px] px-1.5 py-0.5 rounded-sm font-mono font-semibold uppercase tracking-wider">
                              Active Stage
                            </span>
                          )}
                        </div>
                        <span className="text-tertiary block text-[10px] mt-0.5">
                          Focus: {lvl.focus}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 self-start sm:self-center">
                      <div className="text-right">
                        <span className="text-tertiary block text-[8px] uppercase tracking-wider">
                          Target Balance
                        </span>
                        <span className="num text-primary text-xs font-semibold">
                          ${lvl.target.toLocaleString('en-US')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-tertiary block text-[8px] uppercase tracking-wider">
                          Risk per Trade
                        </span>
                        <span className="num text-primary text-xs font-semibold">
                          ${lvl.risk.toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-secondary mt-2 text-xs leading-relaxed max-w-2xl">
                    {lvl.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Console Panels */}
        <div className="space-y-6">
          {/* Active Level Rules Checklist */}
          <div className="border-hairline bg-surface rounded-card border p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={14} className="text-accent-signal" />
              <h2 className="font-display text-primary text-xs uppercase tracking-wider">
                Pre-Flight Discipline Check
              </h2>
            </div>
            <p className="text-secondary text-[11px] mb-4">
              Tick off these rules before executing any manual trade on level <span className="num text-primary font-semibold">Lv. {activeLevel.level}</span>.
            </p>

            <div className="space-y-3">
              {checklist.map((item) => (
                <label 
                  key={item.id}
                  className="flex items-start gap-3 cursor-pointer group text-xs text-secondary hover:text-primary transition-colors duration-150"
                >
                  <input 
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleCheck(item.id)}
                    className="mt-0.5 border-hairline rounded bg-surface-raised text-accent-signal focus:ring-0 focus:ring-offset-0 focus-visible:ring-accent-signal focus-visible:outline-none w-3.5 h-3.5 cursor-pointer accent-accent-signal"
                  />
                  <span className={cn("leading-relaxed", item.checked && "line-through text-tertiary")}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-hairline/60 flex items-center justify-between text-[10px] text-tertiary">
              <span>Status Check</span>
              <span className={cn("font-semibold font-mono", checklist.every(c => c.checked) ? "text-gain" : "text-accent-alert")}>
                {checklist.filter(c => c.checked).length} / {checklist.length} CLEARED
              </span>
            </div>
          </div>

          {/* Balance Sandbox Simulator */}
          <div className="border-hairline bg-surface rounded-card border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator size={14} className="text-accent-signal" />
              <h2 className="font-display text-primary text-xs uppercase tracking-wider">
                Stage Sandbox & Simulator
              </h2>
            </div>
            <p className="text-secondary text-[11px] mb-4">
              Enter any hypothetical balance to check requirements, ranks, and sizing.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-tertiary text-[10px] uppercase tracking-wider block mb-1">
                  Simulated Account Equity
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary font-mono text-xs">$</span>
                  <input 
                    type="number"
                    value={simulatedBalance !== null ? simulatedBalance : ''}
                    placeholder={currentBalance.toFixed(0)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSimulatedBalance(v === '' ? null : Number(v));
                    }}
                    className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-2 pl-7 pr-3 focus:outline-none focus:border-accent-signal focus:ring-0"
                  />
                </div>
              </div>

              {simulatedBalance !== null && (
                <button
                  type="button"
                  onClick={() => setSimulatedBalance(null)}
                  className="w-full border border-hairline hover:bg-surface-raised text-secondary hover:text-primary font-mono text-[10px] py-1.5 rounded-card transition-colors duration-150 cursor-pointer"
                >
                  Reset to Actual Balance
                </button>
              )}
            </div>
          </div>

          {/* Mathematical Path Simulator */}
          <div className="border-hairline bg-surface rounded-card border p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-accent-signal" />
              <h2 className="font-display text-primary text-xs uppercase tracking-wider">
                Compounding Projection
              </h2>
            </div>
            <p className="text-secondary text-[11px] mb-4">
              Project compounding returns starting from active balance based on system metrics.
            </p>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                    Win Rate (%)
                  </label>
                  <input 
                    type="number"
                    value={simWinRate}
                    onChange={(e) => setSimWinRate(Number(e.target.value))}
                    className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0"
                  />
                </div>
                <div>
                  <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                    Reward (R)
                  </label>
                  <input 
                    type="number"
                    value={simRR}
                    onChange={(e) => setSimRR(Number(e.target.value))}
                    className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0"
                  />
                </div>
              </div>

              <div>
                <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                  Number of Trades
                </label>
                <input 
                  type="number"
                  value={simTrades}
                  onChange={(e) => setSimTrades(Number(e.target.value))}
                  className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0"
                />
              </div>

              <div className="mt-4 pt-3 border-t border-hairline/60 space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-tertiary">Expected Value / Trade</span>
                  <span className="num text-primary font-semibold">
                    {expectedValuePerTrade.toFixed(2)} R
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-tertiary">Projected End Balance</span>
                  <span className="num text-gain font-semibold">
                    ${projectedBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
