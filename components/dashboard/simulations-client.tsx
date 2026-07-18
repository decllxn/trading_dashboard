'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { saveSimulation, deleteSimulation } from '@/app/dashboard/simulations/actions';
import { 
  TrendingUp, 
  Trash2, 
  Play, 
  History, 
  Save, 
  Calendar, 
  ChevronRight, 
  Database,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Percent,
  Sliders,
  Scale
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SavedSimulation {
  id: string;
  name: string;
  numSimulations: number;
  numTrades: number;
  riskPerTrade: number;
  ruinThreshold: number;
  mcResult: any;
  sizingResult: any;
  createdAt: string;
}

interface SimulationsClientProps {
  initialRMultiples: number[];
  savedSimulations: SavedSimulation[];
}

export function SimulationsClient({ initialRMultiples, savedSimulations }: SimulationsClientProps) {
  const [tab, setTab] = useState<'run' | 'saved'>('run');
  const [simType, setSimType] = useState<'monte_carlo' | 'streak'>('monte_carlo');

  // Monte Carlo parameters
  const [numSimulations, setNumSimulations] = useState<number>(1000);
  const [numTrades, setNumTrades] = useState<number>(100);
  const [riskPerTrade, setRiskPerTrade] = useState<number>(1.0); // as percentage
  const [ruinThreshold, setRuinThreshold] = useState<number>(50.0); // as percentage

  // Pre-calculate user history profile
  const tradeCount = initialRMultiples.length;
  const avgR = tradeCount > 0 ? initialRMultiples.reduce((a, b) => a + b, 0) / tradeCount : 0;
  const stdR = tradeCount > 0 ? Math.sqrt(initialRMultiples.reduce((acc, r) => acc + (r - avgR) ** 2, 0) / tradeCount) : 0;

  const historicalWins = initialRMultiples.filter(r => r > 0);
  const historicalLosses = initialRMultiples.filter(r => r <= 0);

  const defaultWinRate = tradeCount > 0 ? (historicalWins.length / tradeCount) * 100 : 50.0;
  const defaultAvgWin = historicalWins.length > 0 ? historicalWins.reduce((a, b) => a + b, 0) / historicalWins.length : 2.0;
  const defaultAvgLoss = historicalLosses.length > 0 ? Math.abs(historicalLosses.reduce((a, b) => a + b, 0) / historicalLosses.length) : 1.0;

  // Statistical simulation inputs (with defaults from history)
  const [streakWinRate, setStreakWinRate] = useState<number>(Number(defaultWinRate.toFixed(1)));
  const [streakAvgWin, setStreakAvgWin] = useState<number>(Number(defaultAvgWin.toFixed(2)));
  const [streakAvgLoss, setStreakAvgLoss] = useState<number>(Number(defaultAvgLoss.toFixed(2)));
  const [streakTrades, setStreakTrades] = useState<number>(100);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Results
  const [mcResult, setMcResult] = useState<any | null>(null);
  const [sizingResult, setSizingResult] = useState<any | null>(null);
  const [streakResult, setStreakResult] = useState<any | null>(null);

  // Saving simulation states
  const [saveName, setSaveName] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [localSavedSims, setLocalSavedSims] = useState<SavedSimulation[]>(savedSimulations);
  const [selectedSavedSim, setSelectedSavedSim] = useState<SavedSimulation | null>(null);

  const SIMULATION_SERVICE_URL = process.env.NEXT_PUBLIC_SIMULATION_SERVICE_URL || 'http://localhost:8000';

  const runSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    setSaveName('');

    if (simType === 'monte_carlo') {
      const riskFraction = riskPerTrade / 100.0;
      try {
        // 1. Fetch Monte Carlo results
        const mcRes = await fetch(`${SIMULATION_SERVICE_URL}/simulate/monte-carlo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            historical_r_multiples: initialRMultiples,
            num_simulations: numSimulations,
            num_trades: numTrades,
            risk_per_trade: riskFraction,
            ruin_threshold: ruinThreshold,
            initial_equity: 100.0
          })
        });

        if (!mcRes.ok) throw new Error(`Monte Carlo simulation failed: ${mcRes.statusText}`);
        const mcData = await mcRes.json();

        // 2. Fetch Position Sizing results
        const sizingRes = await fetch(`${SIMULATION_SERVICE_URL}/simulate/position-sizing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            historical_r_multiples: initialRMultiples,
            risk_ranges: [0.005, 0.01, 0.015, 0.02, 0.03, 0.05],
            num_simulations: numSimulations,
            num_trades: numTrades,
            ruin_threshold: ruinThreshold,
            initial_equity: 100.0
          })
        });

        if (!sizingRes.ok) throw new Error(`Position sizing simulation failed: ${sizingRes.statusText}`);
        const sizingData = await sizingRes.json();

        setMcResult(mcData);
        setSizingResult(sizingData.results);
        setStreakResult(null);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'An error occurred during simulation. Make sure the simulation service is running locally on port 8000.');
      } finally {
        setLoading(false);
      }
    } else {
      // Execute Statistical Streak Simulation on Client
      setTimeout(() => {
        try {
          const p = streakWinRate / 100;
          const rw = streakAvgWin;
          const rl = Math.abs(streakAvgLoss);

          // Kelly Sizing
          const b = rl > 0 ? rw / rl : rw;
          const kellyFull = b > 0 ? (p * (b + 1) - 1) / b : 0;
          const kellyFullPct = Math.max(0, kellyFull * 100);

          // Path simulations for streak metrics
          const paths = 5000;
          let lossGe5 = 0;
          let lossGe8 = 0;
          let lossGe10 = 0;
          let lossGe12 = 0;
          let winGe5 = 0;
          let winGe8 = 0;

          let totalMaxLossStreak = 0;
          let totalMaxWinStreak = 0;
          const finalRList: number[] = [];

          for (let s = 0; s < paths; s++) {
            let currentLoss = 0;
            let currentWin = 0;
            let maxLoss = 0;
            let maxWin = 0;
            let finalR = 0;

            for (let t = 0; t < streakTrades; t++) {
              if (Math.random() < p) {
                finalR += rw;
                currentWin++;
                currentLoss = 0;
                if (currentWin > maxWin) maxWin = currentWin;
              } else {
                finalR -= rl;
                currentLoss++;
                currentWin = 0;
                if (currentLoss > maxLoss) maxLoss = currentLoss;
              }
            }
            finalRList.push(finalR);
            totalMaxLossStreak += maxLoss;
            totalMaxWinStreak += maxWin;

            if (maxLoss >= 5) lossGe5++;
            if (maxLoss >= 8) lossGe8++;
            if (maxLoss >= 10) lossGe10++;
            if (maxLoss >= 12) lossGe12++;
            if (maxWin >= 5) winGe5++;
            if (maxWin >= 8) winGe8++;
          }

          finalRList.sort((a, b) => a - b);
          const p10R = finalRList[Math.floor(paths * 0.1)];
          const p50R = finalRList[Math.floor(paths * 0.5)];
          const p90R = finalRList[Math.floor(paths * 0.9)];

          setStreakResult({
            type: 'streak',
            kelly: {
              full: kellyFullPct,
              half: kellyFullPct / 2,
              quarter: kellyFullPct / 4,
            },
            streaks: {
              lossGe5: (lossGe5 / paths) * 100,
              lossGe8: (lossGe8 / paths) * 100,
              lossGe10: (lossGe10 / paths) * 100,
              lossGe12: (lossGe12 / paths) * 100,
              winGe5: (winGe5 / paths) * 100,
              winGe8: (winGe8 / paths) * 100,
              avgMaxLoss: totalMaxLossStreak / paths,
              avgMaxWin: totalMaxWinStreak / paths,
            },
            outcomes: {
              p10R,
              p50R,
              p90R,
            }
          });
          setMcResult(null);
          setSizingResult(null);
        } catch (err: any) {
          setError(err.message || 'Failed to execute statistical calculations.');
        } finally {
          setLoading(false);
        }
      }, 300);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const isStreak = simType === 'streak';
    const activeRes = isStreak ? streakResult : mcResult;
    if (!activeRes || isSaving) return;

    setIsSaving(true);
    const defaultName = isStreak 
      ? `Streak Run (${streakTrades}t, ${streakWinRate}% WR)`
      : `${numTrades} Trades at ${riskPerTrade}% Risk (${new Date().toLocaleDateString()})`;
    const name = saveName.trim() || defaultName;

    try {
      const res = await saveSimulation({
        name,
        numSimulations: isStreak ? 5000 : numSimulations,
        numTrades: isStreak ? streakTrades : numTrades,
        riskPerTrade: isStreak ? 0 : riskPerTrade,
        ruinThreshold: isStreak ? 0 : ruinThreshold,
        mcResult: activeRes,
        sizingResult: isStreak ? {} : sizingResult
      });

      if (res.success) {
        setSaveSuccess(true);
        const newSim: SavedSimulation = {
          id: Math.random().toString(),
          name,
          numSimulations: isStreak ? 5000 : numSimulations,
          numTrades: isStreak ? streakTrades : numTrades,
          riskPerTrade: isStreak ? 0 : riskPerTrade,
          ruinThreshold: isStreak ? 0 : ruinThreshold,
          mcResult: activeRes,
          sizingResult: isStreak ? {} : sizingResult,
          createdAt: new Date().toISOString()
        };
        setLocalSavedSims(prev => [newSim, ...prev]);
      } else {
        alert(res.error || 'Failed to save simulation.');
      }
    } catch (err: any) {
      alert(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSaved = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this saved simulation?')) return;

    try {
      const res = await deleteSimulation(id);
      if (res.success) {
        setLocalSavedSims(prev => prev.filter(s => s.id !== id));
        if (selectedSavedSim?.id === id) {
          setSelectedSavedSim(null);
        }
      } else {
        alert(res.error || 'Failed to delete simulation.');
      }
    } catch (err: any) {
      alert(err.message || 'An unexpected error occurred.');
    }
  };

  const selectSaved = (sim: SavedSimulation) => {
    setSelectedSavedSim(sim);
    if (sim.mcResult?.type === 'streak') {
      setSimType('streak');
      setStreakTrades(sim.numTrades);
    } else {
      setSimType('monte_carlo');
      setNumSimulations(sim.numSimulations);
      setNumTrades(sim.numTrades);
      setRiskPerTrade(sim.riskPerTrade);
      setRuinThreshold(sim.ruinThreshold);
    }
  };

  // Active dataset resolved dynamically based on tab / selection
  const activeMcResult = tab === 'run' ? mcResult : (selectedSavedSim?.mcResult?.type !== 'streak' ? selectedSavedSim?.mcResult : null);
  const activeSizingResult = tab === 'run' ? sizingResult : (selectedSavedSim?.mcResult?.type !== 'streak' ? selectedSavedSim?.sizingResult : null);
  const activeStreakResult = tab === 'run' ? streakResult : (selectedSavedSim?.mcResult?.type === 'streak' ? selectedSavedSim?.mcResult : null);

  // Dynamic simulation insights generator
  const activeInsights = useMemo(() => {
    if (activeMcResult) {
      const ruinProb = activeMcResult.ruin_probability * 100;
      const medianMdd = activeMcResult.max_drawdown_percentiles["50"];
      const p90Mdd = activeMcResult.max_drawdown_percentiles["90"];

      let ruinDesc = "";
      if (ruinProb === 0) {
        ruinDesc = `Risk of ruin is effectively 0.00%. Your position sizing of ${riskPerTrade}% risk per trade is highly sustainable under these historical performance parameters.`;
      } else if (ruinProb < 5) {
        ruinDesc = `Risk of ruin is low at ${ruinProb.toFixed(2)}%. This position size represents a conservative scaling structure.`;
      } else if (ruinProb < 20) {
        ruinDesc = `Moderate risk detected (${ruinProb.toFixed(2)}% ruin probability). You have a visible probability of breaching your ${ruinThreshold}% threshold during extensive drawdowns.`;
      } else {
        ruinDesc = `Danger! Extremely high risk of ruin (${ruinProb.toFixed(2)}%). Under these parameters, account wipes or massive drawdowns are highly probable. Reduce risk per trade immediately.`;
      }

      const mddGap = p90Mdd - medianMdd;
      let mddDesc = `Your median projected drawdown is ${medianMdd.toFixed(1)}%. However, under adverse variance (90th percentile), drawdowns could escalate to ${p90Mdd.toFixed(1)}%.`;
      if (mddGap > 25) {
        mddDesc += " This wide variance suggests significant volatility profile (high standard deviation). High risk of consecutive losses.";
      } else {
        mddDesc += " This clusters cleanly, indicating stable performance distribution.";
      }

      let recommendation = "";
      if (activeSizingResult && activeSizingResult.length > 0) {
        const safeSizes = activeSizingResult.filter((s: any) => s.ruin_probability < 0.01);
        if (safeSizes.length > 0) {
          const optimal = safeSizes[safeSizes.length - 1];
          recommendation = `Sizing recommendation: You can scale risk up to ${optimal.risk_percentage.toFixed(1)}% to target a median ending equity of ${optimal.median_ending_equity.toFixed(1)}% while maintaining a safe risk of ruin (<1.00%).`;
        } else {
          recommendation = `Sizing recommendation: Decrease position risk below 0.50% to maintain account ruin probability under the 1.00% safety threshold.`;
        }
      }

      return { ruinDesc, mddDesc, recommendation };
    } else if (activeStreakResult) {
      const avgMaxLoss = activeStreakResult.streaks.avgMaxLoss;
      const lossGe8 = activeStreakResult.streaks.lossGe8;
      const kelly = activeStreakResult.kelly;

      const ruinDesc = `In a series of ${tab === 'run' ? streakTrades : selectedSavedSim?.numTrades} trades, you are expected to hit a maximum consecutive loss streak of ${avgMaxLoss.toFixed(1)} trades. You have a ${lossGe8.toFixed(1)}% chance of experiencing 8 consecutive losses.`;
      const mddDesc = `Kelly Criterion calculations suggest a maximum mathematical leverage of ${kelly.full.toFixed(1)}% to maximize the geometric growth of your equity.`;
      const recommendation = `Sizing recommendation: To protect against variance and psychology, we advise trading at Half-Kelly (${kelly.half.toFixed(1)}%) or Quarter-Kelly (${kelly.quarter.toFixed(1)}%) risk parameters.`;

      return { ruinDesc, mddDesc, recommendation };
    }
    return null;
  }, [activeMcResult, activeSizingResult, activeStreakResult, riskPerTrade, ruinThreshold, streakTrades, tab, selectedSavedSim]);

  // Data for the streak chart
  const streakChartData = useMemo(() => {
    if (!activeStreakResult) return [];
    return [
      { name: '5+ Losses', probability: activeStreakResult.streaks.lossGe5 },
      { name: '8+ Losses', probability: activeStreakResult.streaks.lossGe8 },
      { name: '10+ Losses', probability: activeStreakResult.streaks.lossGe10 },
      { name: '12+ Losses', probability: activeStreakResult.streaks.lossGe12 },
    ];
  }, [activeStreakResult]);

  return (
    <div className="space-y-6">
      {/* Switcher Tab bar */}
      <div className="flex border-b border-hairline/60">
        <button
          onClick={() => setTab('run')}
          className={cn(
            "px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer",
            tab === 'run' 
              ? "border-accent-signal text-accent-signal" 
              : "border-transparent text-secondary hover:text-primary"
          )}
        >
          <Play size={13} />
          Execute Projection
        </button>
        <button
          onClick={() => setTab('saved')}
          className={cn(
            "px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer",
            tab === 'saved' 
              ? "border-accent-signal text-accent-signal" 
              : "border-transparent text-secondary hover:text-primary"
          )}
        >
          <History size={13} />
          Saved Scenarios ({localSavedSims.length})
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Left Side Column */}
        {tab === 'run' ? (
          /* Run Mode: Settings + Profile */
          <div className="space-y-4">
            <div className="border-hairline bg-surface rounded-card border p-4 space-y-4">
              <div>
                <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                  Simulator Type
                </label>
                <div className="grid grid-cols-2 gap-1 bg-base p-0.5 rounded-card border border-hairline">
                  <button
                    onClick={() => setSimType('monte_carlo')}
                    className={cn(
                      "py-1 text-[10px] font-semibold uppercase rounded-card transition-colors cursor-pointer",
                      simType === 'monte_carlo' ? "bg-surface border border-hairline text-accent-signal" : "text-secondary hover:text-primary"
                    )}
                  >
                    Monte Carlo
                  </button>
                  <button
                    onClick={() => setSimType('streak')}
                    className={cn(
                      "py-1 text-[10px] font-semibold uppercase rounded-card transition-colors cursor-pointer",
                      simType === 'streak' ? "bg-surface border border-hairline text-accent-signal" : "text-secondary hover:text-primary"
                    )}
                  >
                    Streak Sizing
                  </button>
                </div>
              </div>

              {simType === 'monte_carlo' ? (
                /* Monte Carlo inputs */
                <form onSubmit={runSimulation} className="space-y-4 pt-2">
                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Number of Simulations
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      value={numSimulations}
                      onChange={(e) => setNumSimulations(Number(e.target.value))}
                      className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Number of Trades Projected
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="500"
                      value={numTrades}
                      onChange={(e) => setNumTrades(Number(e.target.value))}
                      className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Risk Per Trade (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="20"
                      value={riskPerTrade}
                      onChange={(e) => setRiskPerTrade(Number(e.target.value))}
                      className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Ruin Threshold (% of Equity)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="99"
                      value={ruinThreshold}
                      onChange={(e) => setRuinThreshold(Number(e.target.value))}
                      className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-accent-signal hover:bg-accent-signal/90 text-base font-semibold text-xs py-2 rounded-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading ? 'Running Projections...' : 'Execute Simulation'}
                  </button>
                </form>
              ) : (
                /* Statistical Streak inputs */
                <form onSubmit={runSimulation} className="space-y-4 pt-2">
                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Historical Win Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="99"
                      value={streakWinRate}
                      onChange={(e) => setStreakWinRate(Number(e.target.value))}
                      className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                        Avg Win (R)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        value={streakAvgWin}
                        onChange={(e) => setStreakAvgWin(Number(e.target.value))}
                        className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                        Avg Loss (R)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        value={streakAvgLoss}
                        onChange={(e) => setStreakAvgLoss(Number(e.target.value))}
                        className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Number of Trades Projected
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={streakTrades}
                      onChange={(e) => setStreakTrades(Number(e.target.value))}
                      className="num w-full rounded-card border border-hairline bg-surface-raised px-3 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-accent-signal hover:bg-accent-signal/90 text-base font-semibold text-xs py-2 rounded-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading ? 'Running Streak Model...' : 'Execute Streak Simulation'}
                  </button>
                </form>
              )}
            </div>

            {/* Profile Panel */}
            <div className="border-hairline bg-surface rounded-card border p-4">
              <h3 className="font-display text-primary text-[10px] uppercase tracking-wide mb-3">
                Historical Data Profile
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-secondary font-display">Simulated Symbol</span>
                  <span className="text-primary font-semibold">User History</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-secondary font-display">Total R-Multiples</span>
                  <span className="num text-primary">{tradeCount}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-secondary font-display">Avg R-Multiple</span>
                  <span className="num text-primary text-right">
                    {avgR >= 0 ? '+' : ''}{avgR.toFixed(2)}R
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-secondary font-display">R Std Dev</span>
                  <span className="num text-primary">{stdR.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Saved Mode: List of past runs */
          <div className="border-hairline bg-surface rounded-card border p-4 space-y-4">
            <h2 className="font-display text-primary text-xs uppercase tracking-wide flex items-center gap-1.5">
              <Database size={13} className="text-accent-signal" />
              Saved Simulations
            </h2>
            {localSavedSims.length === 0 ? (
              <p className="text-tertiary text-xs leading-normal">
                No saved projections. Execute and save a simulation in the first tab to view here.
              </p>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto no-scrollbar">
                {localSavedSims.map((sim) => (
                  <div
                    key={sim.id}
                    onClick={() => selectSaved(sim)}
                    className={cn(
                      "p-3 rounded-card border text-xs cursor-pointer transition-colors duration-150 flex justify-between items-start group",
                      selectedSavedSim?.id === sim.id 
                        ? "border-accent-signal bg-base" 
                        : "border-hairline bg-base/50 hover:bg-base"
                    )}
                  >
                    <div className="space-y-1 pr-2 truncate">
                      <span className="text-primary font-semibold block truncate">
                        {sim.name}
                      </span>
                      <span className="text-[10px] text-tertiary block font-mono">
                        {sim.mcResult?.type === 'streak' ? 'Streak Model' : 'Monte Carlo'}
                      </span>
                      <span className="text-[10px] text-tertiary block font-mono">
                        {new Date(sim.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSaved(sim.id, e)}
                      className="text-tertiary hover:text-loss transition-colors p-1 cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right Side Column: Charts & Insights */}
        <div className="space-y-6">
          {error && tab === 'run' && (
            <div className="border-hairline bg-surface rounded-card border px-4 py-3">
              <p className="text-loss text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle size={15} />
                Simulation Error
              </p>
              <p className="text-secondary mt-1 text-xs">{error}</p>
            </div>
          )}

          {!activeMcResult && !activeStreakResult && !loading && (
            <div className="border-hairline bg-surface rounded-card border px-6 py-12 text-center">
              <h3 className="font-display text-secondary text-sm uppercase tracking-wide">
                {tab === 'run' ? 'No Simulation Executed' : 'Select a Saved Simulation'}
              </h3>
              <p className="text-tertiary text-xs mt-2 max-w-sm mx-auto">
                {tab === 'run' 
                  ? 'Configure parameters on the left and execute either the Monte Carlo or Streak simulation to analyze account performance risk.'
                  : 'Click on a saved scenario on the left panel to load the historical charts, position sizing tables, and generated insights.'
                }
              </p>
            </div>
          )}

          {loading && tab === 'run' && (
            <div className="border-hairline bg-surface rounded-card border px-6 py-16 text-center space-y-3">
              <div className="animate-spin h-5 w-5 border-2 border-accent-signal border-t-transparent rounded-card mx-auto" />
              <p className="text-secondary text-xs font-display uppercase tracking-wider">
                {simType === 'monte_carlo' ? 'Running Monte Carlo paths...' : 'Computing streak models...'}
              </p>
            </div>
          )}

          {/* Render MONTE CARLO Result view */}
          {activeMcResult && !loading && (
            <div className="space-y-6">
              {/* Save Setup Option */}
              {tab === 'run' && (
                <div className="border border-hairline bg-surface rounded-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-primary text-xs uppercase tracking-wide font-bold">
                      Save Current Monte Carlo Projection
                    </h3>
                    <p className="text-secondary text-[11px] mt-0.5">
                      Save these results to compare against future optimizations or different risk levels.
                    </p>
                  </div>
                  <form onSubmit={handleSave} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Simulation Name..."
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="rounded border border-hairline bg-base px-2.5 py-1 text-xs text-primary outline-none focus:border-accent-signal w-52"
                    />
                    <button
                      type="submit"
                      disabled={isSaving || saveSuccess}
                      className={cn(
                        "rounded px-3 py-1 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer",
                        saveSuccess 
                          ? "bg-gain/10 border border-gain text-gain"
                          : "bg-accent-signal hover:bg-accent-signal/90 text-base"
                      )}
                    >
                      {saveSuccess ? (
                        <>
                          <CheckCircle2 size={13} />
                          Saved
                        </>
                      ) : (
                        <>
                          <Save size={13} />
                          Save Setup
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Stats Summary Panel */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                  <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                    Probability of Ruin
                  </span>
                  <span className="num text-primary text-lg font-semibold block mt-1.5">
                    {(activeMcResult.ruin_probability * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                  <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                    Median Ending Equity
                  </span>
                  <span className="num text-primary text-lg font-semibold block mt-1.5">
                    {activeMcResult.percentile_curves[activeMcResult.percentile_curves.length - 1].p50.toFixed(1)}%
                  </span>
                </div>
                <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                  <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                    Median Max Drawdown
                  </span>
                  <span className="num text-primary text-lg font-semibold block mt-1.5">
                    {activeMcResult.max_drawdown_percentiles["50"].toFixed(1)}%
                  </span>
                </div>
                <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                  <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                    90th Percentile MDD
                  </span>
                  <span className="num text-primary text-lg font-semibold block mt-1.5">
                    {activeMcResult.max_drawdown_percentiles["90"].toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Simulation Insights */}
              {activeInsights && (
                <div className="border border-hairline bg-surface rounded-card p-4">
                  <h3 className="font-display text-primary text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-accent-signal" />
                    Simulation Insights
                  </h3>
                  <div className="space-y-3.5 text-xs text-secondary leading-relaxed">
                    <div className="border-b border-hairline/30 pb-3">
                      <span className="font-semibold text-primary block">Risk of Ruin Assessment</span>
                      <p className="mt-0.5">{activeInsights.ruinDesc}</p>
                    </div>
                    <div className="border-b border-hairline/30 pb-3">
                      <span className="font-semibold text-primary block">Drawdown Profile & Psychology</span>
                      <p className="mt-0.5">{activeInsights.mddDesc}</p>
                    </div>
                    {activeInsights.recommendation && (
                      <div>
                        <span className="font-semibold text-primary block">Capital Scaling Recommendation</span>
                        <p className="mt-0.5 text-accent-signal font-medium">{activeInsights.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fan Chart Component */}
              <div className="border-hairline bg-surface rounded-card border p-4">
                <h3 className="font-display text-primary text-xs uppercase tracking-wide mb-4">
                  Monte Carlo Equity Percentile Bands
                </h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={activeMcResult.percentile_curves}
                      margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid stroke="#242931" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="trade_index"
                        stroke="#8B93A1"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#8B93A1"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#14171C',
                          border: '1px solid #242931',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)'
                        }}
                        labelStyle={{ color: '#E8EAED', fontWeight: 'bold' }}
                        itemStyle={{ padding: '2px 0' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="p90"
                        name="90th Percentile"
                        stroke="#565D68"
                        strokeDasharray="3 3"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="p75"
                        name="75th Percentile"
                        stroke="#4FD1C5"
                        strokeDasharray="5 5"
                        opacity={0.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="p50"
                        name="50th Percentile (Median)"
                        stroke="#4FD1C5"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="p25"
                        name="25th Percentile"
                        stroke="#4FD1C5"
                        strokeDasharray="5 5"
                        opacity={0.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="p10"
                        name="10th Percentile"
                        stroke="#565D68"
                        strokeDasharray="3 3"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Position Sizing Table */}
              {activeSizingResult && (
                <div className="border-hairline bg-surface rounded-card border overflow-hidden p-4">
                  <h3 className="font-display text-primary text-xs uppercase tracking-wide mb-4">
                    Position Sizing Sensitivity Comparison
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-hairline/80 text-secondary text-[10px] uppercase font-display">
                          <th className="py-2 font-normal">Risk Per Trade</th>
                          <th className="py-2 text-right font-normal">Mean Ending Equity</th>
                          <th className="py-2 text-right font-normal">Median Ending Equity</th>
                          <th className="py-2 text-right font-normal">Mean Max Drawdown</th>
                          <th className="py-2 text-right font-normal">Median Max Drawdown</th>
                          <th className="py-2 text-right font-normal">Ruin Probability</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline/40">
                        {activeSizingResult.map((sizing: any, index: number) => {
                          return (
                            <tr key={index} className="hover:bg-surface-raised/40 transition-colors duration-150">
                              <td className="py-2.5 font-semibold num text-accent-signal">
                                {sizing.risk_percentage.toFixed(1)}%
                              </td>
                              <td className="py-2.5 text-right num text-primary">
                                {sizing.mean_ending_equity.toFixed(1)}%
                              </td>
                              <td className="py-2.5 text-right num text-primary">
                                {sizing.median_ending_equity.toFixed(1)}%
                              </td>
                              <td className="py-2.5 text-right num text-primary">
                                {sizing.mean_max_drawdown.toFixed(1)}%
                              </td>
                              <td className="py-2.5 text-right num text-primary">
                                {sizing.median_max_drawdown.toFixed(1)}%
                              </td>
                              <td className="py-2.5 text-right num font-semibold text-primary">
                                {(sizing.ruin_probability * 100).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Render STATISTICAL STREAK Result view */}
          {activeStreakResult && !loading && (
            <div className="space-y-6">
              {/* Save Setup Option */}
              {tab === 'run' && (
                <div className="border border-hairline bg-surface rounded-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-primary text-xs uppercase tracking-wide font-bold">
                      Save Streak Sizing Simulation
                    </h3>
                    <p className="text-secondary text-[11px] mt-0.5">
                      Save these results to preserve your streak profile and Kelly sizing limits.
                    </p>
                  </div>
                  <form onSubmit={handleSave} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Simulation Name..."
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="rounded border border-hairline bg-base px-2.5 py-1 text-xs text-primary outline-none focus:border-accent-signal w-52"
                    />
                    <button
                      type="submit"
                      disabled={isSaving || saveSuccess}
                      className={cn(
                        "rounded px-3 py-1 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer",
                        saveSuccess 
                          ? "bg-gain/10 border border-gain text-gain"
                          : "bg-accent-signal hover:bg-accent-signal/90 text-base"
                      )}
                    >
                      {saveSuccess ? (
                        <>
                          <CheckCircle2 size={13} />
                          Saved
                        </>
                      ) : (
                        <>
                          <Save size={13} />
                          Save Setup
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* Stats Summary Panel */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-hairline bg-surface rounded-card p-4">
                  <div className="flex items-center gap-1.5 text-tertiary">
                    <Flame size={14} className="text-accent-signal" />
                    <span className="text-[9px] uppercase tracking-wider font-display">Avg Max Losing Streak</span>
                  </div>
                  <span className="num text-primary text-xl font-bold block mt-2">
                    {activeStreakResult.streaks.avgMaxLoss.toFixed(1)} Trades
                  </span>
                  <span className="text-[10px] text-secondary mt-1 block">Expected consecutive losses in sequence</span>
                </div>

                <div className="border border-hairline bg-surface rounded-card p-4">
                  <div className="flex items-center gap-1.5 text-tertiary">
                    <Scale size={14} className="text-accent-signal" />
                    <span className="text-[9px] uppercase tracking-wider font-display">Optimal Kelly Sizing</span>
                  </div>
                  <span className="num text-accent-signal text-xl font-bold block mt-2">
                    {activeStreakResult.kelly.full.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-secondary mt-1 block">Maximum mathematical growth limit</span>
                </div>

                <div className="border border-hairline bg-surface rounded-card p-4">
                  <div className="flex items-center gap-1.5 text-tertiary">
                    <TrendingUp size={14} className="text-accent-signal" />
                    <span className="text-[9px] uppercase tracking-wider font-display">Median Expected R Return</span>
                  </div>
                  <span className="num text-primary text-xl font-bold block mt-2">
                    +{activeStreakResult.outcomes.p50R.toFixed(1)}R
                  </span>
                  <span className="text-[10px] text-secondary mt-1 block">50th percentile run outcome</span>
                </div>
              </div>

              {/* Simulation Insights */}
              {activeInsights && (
                <div className="border border-hairline bg-surface rounded-card p-4">
                  <h3 className="font-display text-primary text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-accent-signal" />
                    Streak & Kelly Insights
                  </h3>
                  <div className="space-y-3.5 text-xs text-secondary leading-relaxed">
                    <div className="border-b border-hairline/30 pb-3">
                      <span className="font-semibold text-primary block">Losing Streak Variance</span>
                      <p className="mt-0.5">{activeInsights.ruinDesc}</p>
                    </div>
                    <div className="border-b border-hairline/30 pb-3">
                      <span className="font-semibold text-primary block">Capital Sizing Guidelines</span>
                      <p className="mt-0.5">{activeInsights.mddDesc}</p>
                    </div>
                    {activeInsights.recommendation && (
                      <div>
                        <span className="font-semibold text-primary block">Recommended Sizing Adjustment</span>
                        <p className="mt-0.5 text-accent-signal font-medium">{activeInsights.recommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Streak chart & Kelly details split */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Consecutive Loss Probability Chart */}
                <div className="border border-hairline bg-surface rounded-card p-4">
                  <h4 className="font-display text-primary text-[10px] uppercase tracking-wide mb-4">
                    Streak Risk Probability (%)
                  </h4>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={streakChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                        <CartesianGrid stroke="#242931" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" stroke="#8B93A1" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#8B93A1" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#14171C',
                            border: '1px solid #242931',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)'
                          }}
                          labelStyle={{ color: '#E8EAED', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="probability" name="Probability">
                          {streakChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#4FD1C5' : index === 1 ? '#e0a96d' : '#F87171'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Sizing Tiers Card */}
                <div className="border border-hairline bg-surface rounded-card p-4 space-y-4">
                  <h4 className="font-display text-primary text-[10px] uppercase tracking-wide">
                    Suggested Sizing Tiers
                  </h4>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-base border border-hairline">
                      <div>
                        <span className="font-semibold text-primary block">Quarter Kelly (Safe)</span>
                        <span className="text-[10px] text-tertiary">Recommended for manual accounts</span>
                      </div>
                      <span className="num font-bold text-primary text-sm">{activeStreakResult.kelly.quarter.toFixed(2)}%</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-base border border-hairline">
                      <div>
                        <span className="font-semibold text-primary block">Half Kelly (Aggressive)</span>
                        <span className="text-[10px] text-tertiary">Moderate drawdowns expected</span>
                      </div>
                      <span className="num font-bold text-accent-signal text-sm">{activeStreakResult.kelly.half.toFixed(2)}%</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-base border border-hairline">
                      <div>
                        <span className="font-semibold text-primary block">Full Kelly (Extreme Growth)</span>
                        <span className="text-[10px] text-tertiary">Maximum variance. NOT recommended</span>
                      </div>
                      <span className="num font-bold text-loss text-sm">{activeStreakResult.kelly.full.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expected R outcome bounds */}
              <div className="border border-hairline bg-surface rounded-card p-4">
                <h4 className="font-display text-primary text-[10px] uppercase tracking-wide mb-3">
                  Expected Return Distribution Profile
                </h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-base border border-hairline rounded">
                    <span className="text-tertiary block text-[9px] uppercase tracking-wider">Adverse Path (10th)</span>
                    <span className="num font-bold text-loss text-sm block mt-1">
                      {activeStreakResult.outcomes.p10R.toFixed(1)}R
                    </span>
                  </div>
                  <div className="p-3 bg-base border border-hairline rounded">
                    <span className="text-tertiary block text-[9px] uppercase tracking-wider">Median Path (50th)</span>
                    <span className="num font-bold text-primary text-sm block mt-1">
                      +{activeStreakResult.outcomes.p50R.toFixed(1)}R
                    </span>
                  </div>
                  <div className="p-3 bg-base border border-hairline rounded">
                    <span className="text-tertiary block text-[9px] uppercase tracking-wider">Optimal Path (90th)</span>
                    <span className="num font-bold text-gain text-sm block mt-1">
                      +{activeStreakResult.outcomes.p90R.toFixed(1)}R
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
