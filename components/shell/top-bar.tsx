'use client';

import React from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import { AccountMenu } from './account-menu';

interface Level {
  level: number;
  rank: string;
  target: number;
}

const LEVELS: Level[] = [
  { level: 0, rank: "Novice Cadet", target: 150 },
  { level: 1, rank: "Market Apprentice", target: 300 },
  { level: 2, rank: "Risk Practitioner", target: 600 },
  { level: 3, rank: "Discipline Enforcer", target: 1200 },
  { level: 4, rank: "Trend Navigator", target: 2400 },
  { level: 5, rank: "Capital Guardian", target: 4800 },
  { level: 6, rank: "Edge Specialist", target: 9600 },
  { level: 7, rank: "Sovereign Trader", target: 19200 },
  { level: 8, rank: "Tactical Veteran", target: 38400 },
  { level: 9, rank: "Market Operator", target: 76800 },
  { level: 10, rank: "Portfolio Architect", target: 153600 },
  { level: 11, rank: "Apex Strategist", target: 307200 },
  { level: 12, rank: "Macro Voyager", target: 614400 },
  { level: 13, rank: "Market Legend", target: 1000000 }
];

function Selector({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="text-secondary hover:text-primary flex items-center gap-1 rounded-card px-2 py-1 text-xs transition-colors duration-150"
    >
      <span className="num">{label}</span>
      <ChevronDown size={12} strokeWidth={1.75} />
    </button>
  );
}

interface TopBarProps {
  email: string;
  activeBrokerName?: string | null;
  currentBalance?: number;
}

export function TopBar({ email, activeBrokerName, currentBalance }: TopBarProps) {
  // Rank calculations
  const balance = currentBalance ?? 150;
  let activeLevelIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (balance >= LEVELS[i].target) {
      activeLevelIdx = i;
    } else {
      break;
    }
  }

  const currentLevel = LEVELS[activeLevelIdx];
  const nextLevel = activeLevelIdx < LEVELS.length - 1 ? LEVELS[activeLevelIdx + 1] : null;

  let progressPct = 100;
  if (nextLevel) {
    const range = nextLevel.target - currentLevel.target;
    const progress = balance - currentLevel.target;
    progressPct = Math.min(Math.max((progress / range) * 100, 0), 100);
  }

  return (
    <header className="border-hairline bg-base flex h-14 items-center justify-between border-b px-4 sm:px-6">
      <div className="flex items-center gap-6">
        <span className="font-display text-primary text-sm">
          Trading Dashboard
        </span>
      </div>

      {/* Rank Progression */}
      {currentBalance !== undefined && (
        <div className="hidden lg:flex items-center gap-4 border border-hairline/60 rounded-card px-3 py-1 bg-surface/40 text-[11px] h-8">
          <div className="flex items-center gap-1.5 text-secondary">
            <Trophy size={11} className="text-accent-signal" />
            <span className="font-display text-[9px] uppercase tracking-wider text-tertiary">Rank:</span>
            <span className="font-display text-primary font-semibold uppercase tracking-wider">{currentLevel.rank}</span>
          </div>

          <span className="border-hairline h-3 border-l" />

          {nextLevel ? (
            <div className="flex items-center gap-2.5">
              <span className="num text-secondary font-mono text-[10px]">
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-tertiary font-sans mx-1">/</span>
                <span className="text-tertiary">${nextLevel.target.toLocaleString('en-US')}</span>
              </span>
              <div 
                className="w-24 bg-[#242931] h-1 rounded-[2px] overflow-hidden" 
                title={`${progressPct.toFixed(1)}% to next level`}
              >
                <div 
                  className="bg-accent-signal h-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-gain font-semibold uppercase tracking-wider font-display text-[10px]">
              MARKET LEGEND
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-4">
        {/* Static placeholder selectors */}
        <div className="hidden items-center gap-4 md:flex">
          <Selector label={activeBrokerName || "Paper · Alpaca"} />
          <span className="border-hairline h-4 border-l" />
          <Selector label="1M" />
          <span className="border-hairline h-4 border-l" />
        </div>
        <AccountMenu email={email} />
      </div>
    </header>
  );
}
