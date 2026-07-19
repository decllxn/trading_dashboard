'use client';

import React, { useState, useEffect } from 'react';
import { Target, AlertTriangle, Clock, Calendar, CheckSquare, RefreshCw, ShieldAlert, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLiveTrade } from '@/app/dashboard/trades/actions';

// We project a simple interface from the parent trades.
interface ChecklistTrade {
  id?: string;
  pnl?: number | null;
  rMultiple?: number | null;
  entryTime?: string | null;
  exitTime?: string | null;
  status?: string;
}

interface DisciplineChecklistProps {
  trades: ReadonlyArray<ChecklistTrade>;
}

interface ChecklistItem {
  id: string;
  category: 'setup' | 'liquidity' | 'caveat';
  text: string;
  checked: boolean;
}

const DEFAULT_ITEMS: ChecklistItem[] = [
  // Setup Rules
  { id: 'daily-fvg', category: 'setup', text: 'Daily FVG / OB / SMT Liquidity Sweep formed', checked: false },
  { id: 'daily-aesthetic', category: 'setup', text: 'Daily chart OB/FVG looks aesthetically pleasing', checked: false },
  { id: 'low-fvg', category: 'setup', text: '1hr / 30min FVG or Order Block confirmation', checked: false },
  { id: 'entry-aesthetic', category: 'setup', text: 'Entry timeframe chart looks aesthetically pleasing', checked: false },
  
  // Liquidity Rules
  { id: 'engineered-liq', category: 'liquidity', text: 'Engineered Liquidity identified (Relative Equal or Exact Highs/Lows)', checked: false },
  { id: 'futures-conf', category: 'liquidity', text: 'Futures Correlation verified (USDCAD confirmed by 6C1! futures)', checked: false },
  
  // Caveats & News
  { id: 'news-check', category: 'caveat', text: 'High-Impact News checked (NFP, CPI, rate decisions)', checked: false },
  { id: 'trump-tweets', category: 'caveat', text: 'Check for potential geopolitical/social media volatility (Trump tweets)', checked: false },
  { id: 'session-check', category: 'caveat', text: 'Trading session verified (No Asia, London onwards only)', checked: false },
];

export function DisciplineChecklist({ trades }: DisciplineChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [mounted, setMounted] = useState(false);

  // Quick trade entry form state
  const [inst, setInst] = useState('');
  const [dir, setDir] = useState<'long' | 'short'>('long');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [size, setSize] = useState('');

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // Load from local storage
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('trading_dashboard_checklist');
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch {
        setItems(DEFAULT_ITEMS);
      }
    } else {
      setItems(DEFAULT_ITEMS);
    }
  }, []);

  const toggleItem = (id: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    setItems(updated);
    localStorage.setItem('trading_dashboard_checklist', JSON.stringify(updated));
  };

  const resetChecklist = () => {
    const reset = items.map(item => ({ ...item, checked: false }));
    setItems(reset);
    localStorage.setItem('trading_dashboard_checklist', JSON.stringify(reset));
  };

  // --- Rule 1: Not more than 2 trades in the same day ---
  const todayStr = new Date().toISOString().split('T')[0];
  const tradesToday = trades.filter((t) => {
    if (!t.entryTime) return false;
    const entryDate = t.entryTime.split('T')[0];
    return entryDate === todayStr;
  }).length;

  const isDailyLimitHit = tradesToday >= 2;

  // --- Rule 2: 4 consecutive losing trades or -4 R -> 2 weeks break ---
  const closed = [...trades]
    .filter((t) => t.status === 'closed' && t.pnl !== null)
    .sort((a, b) => {
      const aTime = a.exitTime || a.entryTime || '';
      const bTime = b.exitTime || b.entryTime || '';
      return bTime.localeCompare(aTime); // descending (most recent first)
    });

  const last4 = closed.slice(0, 4);
  const consecutiveLosses = last4.length === 4 && last4.every((t) => (t.pnl ?? 0) < 0);
  const sumR = last4.reduce((sum, t) => sum + (t.rMultiple ?? 0), 0);
  const isDrawdownLimitHit = last4.length === 4 && (consecutiveLosses || sumR <= -4);

  // --- Session Check (Time of Day) ---
  const [utcTime, setUtcTime] = useState<Date | null>(null);

  useEffect(() => {
    setUtcTime(new Date());
    const interval = setInterval(() => {
      setUtcTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  let activeSession = 'Unknown';
  let isAsiaSession = false;
  let sessionWarning = '';

  if (utcTime) {
    const utcHour = utcTime.getUTCHours();
    // Asia: 22:00 to 06:00 UTC
    if (utcHour >= 22 || utcHour < 6) {
      activeSession = 'Asia';
      isAsiaSession = true;
      sessionWarning = 'Asia Session Active. Restriction: Do not trade Asia (London/NY only).';
    } else if (utcHour >= 6 && utcHour < 12) {
      activeSession = 'London';
    } else if (utcHour >= 12 && utcHour < 20) {
      activeSession = 'New York';
    } else {
      activeSession = 'Late NY / Close';
    }
  }

  // --- No News Monday check ---
  const isMonday = new Date().getDay() === 1;

  const allCleared = items.length > 0 && items.every((i) => i.checked);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allCleared) return;
    if (!inst.trim()) {
      setFormError('Instrument required');
      return;
    }
    const parsedEntry = Number(entryPrice);
    const parsedSize = Number(size);
    if (isNaN(parsedEntry) || parsedEntry <= 0) {
      setFormError('Valid Entry Price required');
      return;
    }
    if (isNaN(parsedSize) || parsedSize <= 0) {
      setFormError('Valid Size required');
      return;
    }

    setLoading(true);
    setFormError(null);
    setFormSuccess(false);

    try {
      const res = await createLiveTrade({
        instrument: inst,
        direction: dir,
        entryPrice: parsedEntry,
        stopPrice: stopPrice ? Number(stopPrice) : null,
        targetPrice: targetPrice ? Number(targetPrice) : null,
        size: parsedSize,
      });

      if (res.error) {
        setFormError(res.error);
      } else {
        setFormSuccess(true);
        // Clear form
        setInst('');
        setEntryPrice('');
        setStopPrice('');
        setTargetPrice('');
        setSize('');
        // Reset checklist to encourage new pre-trade check
        resetChecklist();
      }
    } catch (err: any) {
      setFormError(err.message || 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return null; // Prevent hydration flash
  }

  return (
    <div className="border-hairline bg-surface rounded-card border w-full p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-hairline/60 pb-2">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-accent-signal" />
          <h2 className="font-display text-primary text-xs uppercase tracking-wide">
            Pre-Trade & Risk Rules
          </h2>
        </div>
        <button
          type="button"
          onClick={resetChecklist}
          className="text-tertiary hover:text-accent-signal transition-colors duration-150 p-1 rounded-sm focus:outline-none cursor-pointer"
          title="Reset checklist"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* AUTOMATED ALERTS / RULE GUARDS */}
      <div className="space-y-2">
        {/* Drawdown Freeze Alert */}
        {isDrawdownLimitHit && (
          <div className="border-hairline bg-[#1D171C] rounded-card border px-3 py-2 flex items-start gap-2.5">
            <ShieldAlert size={14} className="text-loss shrink-0 mt-0.5" />
            <div>
              <span className="font-display text-primary text-[11px] font-semibold block uppercase tracking-wide">
                Drawdown Freeze Active
              </span>
              <p className="text-secondary text-[10px] mt-0.5 leading-relaxed">
                4 consecutive losses or &le; -4R drawdown reached in your last 4 trades. 
                <span className="text-loss font-semibold block mt-0.5">Take a mandatory 2-week break.</span>
              </p>
            </div>
          </div>
        )}

        {/* Daily Trade Limit Alert */}
        {isDailyLimitHit ? (
          <div className="border-hairline bg-[#1D171C] rounded-card border px-3 py-2 flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-loss shrink-0 mt-0.5" />
            <div>
              <span className="font-display text-primary text-[11px] font-semibold block uppercase tracking-wide">
                Daily Limit Reached
              </span>
              <p className="text-secondary text-[10px] mt-0.5">
                Maximum of 2 trades per day. Restrict entries until tomorrow.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px] px-1 text-tertiary">
            <span>Daily trades taken</span>
            <span className="num text-primary font-semibold font-mono">
              {tradesToday} / 2
            </span>
          </div>
        )}

        {/* Time of Day / Asia Session warning */}
        {isAsiaSession && (
          <div className="border-hairline bg-[#1D1C17] rounded-card border px-3 py-2 flex items-start gap-2.5">
            <Clock size={14} className="text-accent-alert shrink-0 mt-0.5" />
            <div>
              <span className="font-display text-primary text-[11px] font-semibold block uppercase tracking-wide">
                Asia Session Warning
              </span>
              <p className="text-secondary text-[10px] mt-0.5">
                No trades in Asia session. Wait for London (06:00 UTC) onwards.
              </p>
            </div>
          </div>
        )}

        {/* No News Monday Alert */}
        {isMonday && (
          <div className="border-hairline bg-[#1D1C17] rounded-card border px-3 py-2 flex items-start gap-2.5">
            <Calendar size={14} className="text-accent-alert shrink-0 mt-0.5" />
            <div>
              <span className="font-display text-primary text-[11px] font-semibold block uppercase tracking-wide">
                No News Monday Guard
              </span>
              <p className="text-secondary text-[10px] mt-0.5">
                Ensure no major red-folder news is scheduled for today. Expect lower Monday volume.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* PRE-FLIGHT CHECKLIST ITEMS */}
      <div className="space-y-3">
        {/* Setup Section */}
        <div>
          <span className="text-tertiary text-[9px] uppercase tracking-wider font-display block mb-1.5">
            1. Higher Timeframe Setup
          </span>
          <div className="space-y-2">
            {items.filter(i => i.category === 'setup').map((item) => (
              <label 
                key={item.id}
                className="flex items-start gap-2.5 cursor-pointer group text-xs text-secondary hover:text-primary transition-colors duration-150"
              >
                <input 
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                  className="mt-0.5 border-hairline rounded bg-surface-raised text-accent-signal focus:ring-0 focus:ring-offset-0 focus-visible:ring-accent-signal focus-visible:outline-none w-3.5 h-3.5 cursor-pointer accent-accent-signal shrink-0"
                />
                <span className={cn("leading-relaxed", item.checked && "line-through text-tertiary")}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Liquidity Section */}
        <div>
          <span className="text-tertiary text-[9px] uppercase tracking-wider font-display block mb-1.5">
            2. Liquidity & Confirmation
          </span>
          <div className="space-y-2">
            {items.filter(i => i.category === 'liquidity').map((item) => (
              <label 
                key={item.id}
                className="flex items-start gap-2.5 cursor-pointer group text-xs text-secondary hover:text-primary transition-colors duration-150"
              >
                <input 
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                  className="mt-0.5 border-hairline rounded bg-surface-raised text-accent-signal focus:ring-0 focus:ring-offset-0 focus-visible:ring-accent-signal focus-visible:outline-none w-3.5 h-3.5 cursor-pointer accent-accent-signal shrink-0"
                />
                <span className={cn("leading-relaxed", item.checked && "line-through text-tertiary")}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Caveats Section */}
        <div>
          <span className="text-tertiary text-[9px] uppercase tracking-wider font-display block mb-1.5">
            3. Risk Caveats & Sessions
          </span>
          <div className="space-y-2">
            {items.filter(i => i.category === 'caveat').map((item) => (
              <label 
                key={item.id}
                className="flex items-start gap-2.5 cursor-pointer group text-xs text-secondary hover:text-primary transition-colors duration-150"
              >
                <input 
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                  className="mt-0.5 border-hairline rounded bg-surface-raised text-accent-signal focus:ring-0 focus:ring-offset-0 focus-visible:ring-accent-signal focus-visible:outline-none w-3.5 h-3.5 cursor-pointer accent-accent-signal shrink-0"
                />
                <span className={cn("leading-relaxed", item.checked && "line-through text-tertiary")}>
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* METRIC READOUT / SESSION INDICATOR */}
      <div className="border-t border-hairline/60 pt-3 flex items-center justify-between text-[9px] text-tertiary font-display">
        <span>Active Session: <span className="text-accent-signal uppercase tracking-wider">{activeSession}</span></span>
        <span className={cn("font-semibold", allCleared ? "text-gain" : "text-accent-alert")}>
          {items.filter(i => i.checked).length} / {items.length} CLEARED
        </span>
      </div>

      {/* QUICK POSITION LOGGING */}
      <div className="border-t border-hairline/60 pt-4 mt-2">
        <div className="flex items-center gap-2 mb-3">
          <Play size={12} className={cn(allCleared ? "text-accent-signal" : "text-tertiary")} />
          <h3 className="font-display text-primary text-xs uppercase tracking-wide">
            Log Live Position
          </h3>
        </div>

        {!allCleared ? (
          <div className="border-hairline bg-[#14171C]/50 rounded-card border px-3 py-4 text-center">
            <p className="text-tertiary text-[10px] leading-relaxed">
              Complete the pre-trade checklist above to unlock quick position entry.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {formError && (
              <p className="text-loss text-[10px] bg-loss/5 border border-loss/20 px-2 py-1 rounded-card num">
                {formError}
              </p>
            )}
            {formSuccess && (
              <p className="text-gain text-[10px] bg-gain/5 border border-gain/20 px-2 py-1 rounded-card">
                Position logged! Checklist reset for next execution.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                  Instrument
                </label>
                <input
                  type="text"
                  required
                  value={inst}
                  onChange={(e) => setInst(e.target.value)}
                  placeholder="USDCAD"
                  className="w-full bg-surface-raised border border-hairline text-primary text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0 uppercase placeholder-tertiary"
                />
              </div>

              <div>
                <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                  Direction
                </label>
                <div className="grid grid-cols-2 border border-hairline rounded-card overflow-hidden bg-surface-raised h-[28px] items-center">
                  <button
                    type="button"
                    onClick={() => setDir('long')}
                    className={cn(
                      "text-[10px] font-semibold h-full transition-colors",
                      dir === 'long' ? "bg-accent-signal text-[#0B0D10]" : "text-secondary hover:text-primary"
                    )}
                  >
                    LONG
                  </button>
                  <button
                    type="button"
                    onClick={() => setDir('short')}
                    className={cn(
                      "text-[10px] font-semibold h-full transition-colors",
                      dir === 'short' ? "bg-accent-signal text-[#0B0D10]" : "text-secondary hover:text-primary"
                    )}
                  >
                    SHORT
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                  Entry Price
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="1.3542"
                  className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0 placeholder-tertiary"
                />
              </div>

              <div>
                <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                  Size (Lots/Units)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="1.50"
                  className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0 placeholder-tertiary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                  Stop Loss
                </label>
                <input
                  type="number"
                  step="any"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  placeholder="1.3522"
                  className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0 placeholder-tertiary"
                />
              </div>

              <div>
                <label className="text-tertiary text-[9px] uppercase tracking-wider block mb-1">
                  Take Profit
                </label>
                <input
                  type="number"
                  step="any"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="1.3592"
                  className="w-full bg-surface-raised border border-hairline text-primary font-mono text-xs rounded-card py-1.5 px-2 focus:outline-none focus:border-accent-signal focus:ring-0 placeholder-tertiary"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-signal hover:bg-accent-signal/90 text-[#0B0D10] text-xs font-semibold py-2 rounded-card transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-[#0B0D10]/20 border-t-[#0B0D10] animate-spin" />
                  LOGGING ENTRY...
                </>
              ) : (
                'EXECUTE & LOG LIVE TRADE'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
