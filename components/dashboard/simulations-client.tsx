'use client';

import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

interface SimulationsClientProps {
  initialRMultiples: number[];
}

export function SimulationsClient({ initialRMultiples }: SimulationsClientProps) {
  const [numSimulations, setNumSimulations] = useState<number>(1000);
  const [numTrades, setNumTrades] = useState<number>(100);
  const [riskPerTrade, setRiskPerTrade] = useState<number>(1.0); // as percentage
  const [ruinThreshold, setRuinThreshold] = useState<number>(50.0); // as percentage
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [mcResult, setMcResult] = useState<any | null>(null);
  const [sizingResult, setSizingResult] = useState<any | null>(null);

  const SIMULATION_SERVICE_URL = process.env.NEXT_PUBLIC_SIMULATION_SERVICE_URL || 'http://localhost:8000';

  const runSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Convert risk from percentage (1.0) to decimal (0.01) for the API
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

      if (!mcRes.ok) {
        throw new Error(`Monte Carlo simulation failed: ${mcRes.statusText}`);
      }

      const mcData = await mcRes.json();

      // 2. Fetch Position Sizing results
      const sizingRes = await fetch(`${SIMULATION_SERVICE_URL}/simulate/position-sizing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historical_r_multiples: initialRMultiples,
          risk_ranges: [0.005, 0.01, 0.015, 0.02, 0.03, 0.05], // 0.5%, 1%, 1.5%, 2%, 3%, 5%
          num_simulations: numSimulations,
          num_trades: numTrades,
          ruin_threshold: ruinThreshold,
          initial_equity: 100.0
        })
      });

      if (!sizingRes.ok) {
        throw new Error(`Position sizing simulation failed: ${sizingRes.statusText}`);
      }

      const sizingData = await sizingRes.json();

      setMcResult(mcData);
      setSizingResult(sizingData.results);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during simulation. Make sure the simulation service is running locally on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  const tradeCount = initialRMultiples.length;
  const avgR = tradeCount > 0 ? initialRMultiples.reduce((a, b) => a + b, 0) / tradeCount : 0;
  const stdR = tradeCount > 0 ? Math.sqrt(initialRMultiples.reduce((acc, r) => acc + (r - avgR) ** 2, 0) / tradeCount) : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start">
      {/* Settings Form Column */}
      <div className="border-hairline bg-surface rounded-card border p-4 space-y-6">
        <div>
          <h2 className="font-display text-primary text-xs uppercase tracking-wide mb-3">
            Simulation Inputs
          </h2>
          <form onSubmit={runSimulation} className="space-y-4">
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
                className="w-full bg-surface-raised border border-hairline rounded px-3 py-1.5 text-xs text-primary num outline-none focus:border-accent-signal/80 transition-colors"
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
                className="w-full bg-surface-raised border border-hairline rounded px-3 py-1.5 text-xs text-primary num outline-none focus:border-accent-signal/80 transition-colors"
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
                className="w-full bg-surface-raised border border-hairline rounded px-3 py-1.5 text-xs text-primary num outline-none focus:border-accent-signal/80 transition-colors"
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
                className="w-full bg-surface-raised border border-hairline rounded px-3 py-1.5 text-xs text-primary num outline-none focus:border-accent-signal/80 transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-signal hover:bg-accent-signal/90 text-[#0B0D10] font-semibold text-xs py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Running Projections...' : 'Execute Simulation'}
            </button>
          </form>
        </div>

        {/* History Stats Panel */}
        <div className="border-t border-hairline/60 pt-4">
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
              <span className="num text-primary">
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

      {/* Results Column */}
      <div className="space-y-6">
        {error && (
          <div className="border-hairline bg-surface rounded-card border px-4 py-3">
            <p className="text-loss text-sm font-semibold">Simulation Error</p>
            <p className="text-secondary mt-1 text-xs">{error}</p>
          </div>
        )}

        {!mcResult && !loading && !error && (
          <div className="border-hairline bg-surface rounded-card border px-6 py-12 text-center">
            <h3 className="font-display text-secondary text-sm uppercase tracking-wide">
              No Simulation Executed
            </h3>
            <p className="text-tertiary text-xs mt-2 max-w-sm mx-auto">
              Configure parameters on the left and execute the simulation to generate Monte Carlo percentile bands and position sizing comparisons.
            </p>
          </div>
        )}

        {loading && (
          <div className="border-hairline bg-surface rounded-card border px-6 py-16 text-center space-y-3">
            <div className="animate-spin h-5 w-5 border-2 border-accent-signal border-t-transparent rounded-full mx-auto" />
            <p className="text-secondary text-xs font-display uppercase tracking-wider">
              Running Monte Carlo paths...
            </p>
          </div>
        )}

        {mcResult && !loading && (
          <div className="space-y-6">
            {/* Stats Summary Panel */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                  Probability of Ruin
                </span>
                <span className={`num text-lg font-semibold block mt-1.5 ${mcResult.ruin_probability > 0.1 ? 'text-loss' : 'text-gain'}`}>
                  {(mcResult.ruin_probability * 100).toFixed(2)}%
                </span>
              </div>
              <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                  Median Ending Equity
                </span>
                <span className="num text-primary text-lg font-semibold block mt-1.5">
                  {mcResult.percentile_curves[mcResult.percentile_curves.length - 1].p50.toFixed(1)}%
                </span>
              </div>
              <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                  Median Max Drawdown
                </span>
                <span className="num text-loss text-lg font-semibold block mt-1.5">
                  {mcResult.max_drawdown_percentiles["50"].toFixed(1)}%
                </span>
              </div>
              <div className="border-hairline bg-surface rounded-card border px-4 py-3">
                <span className="text-tertiary block text-[9px] uppercase tracking-wider font-display">
                  90th Percentile MDD
                </span>
                <span className="num text-loss text-lg font-semibold block mt-1.5">
                  {mcResult.max_drawdown_percentiles["90"].toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Fan Chart Component */}
            <div className="border-hairline bg-surface rounded-card border p-4">
              <h3 className="font-display text-primary text-xs uppercase tracking-wide mb-4">
                Monte Carlo Equity Percentile Bands
              </h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={mcResult.percentile_curves}
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
              <div className="flex flex-wrap items-center justify-center gap-6 mt-4 text-[10px] text-secondary font-display">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t border-dashed border-[#565D68] block" />
                  <span>10th / 90th Percentile (Outer Risk Range)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t border-dashed border-[#4FD1C5] opacity-50 block" />
                  <span>25th / 75th Percentile (Inner Risk Range)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#4FD1C5] block" />
                  <span>50th Percentile (Median Projection)</span>
                </div>
              </div>
            </div>

            {/* Position Sizing Table */}
            {sizingResult && (
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
                      {sizingResult.map((sizing: any, index: number) => {
                        const isHighRuin = sizing.ruin_probability > 0.1;
                        return (
                          <tr key={index} className="hover:bg-surface-raised/40 transition-colors">
                            <td className="py-2.5 font-semibold num text-accent-signal">
                              {sizing.risk_percentage.toFixed(1)}%
                            </td>
                            <td className="py-2.5 text-right num text-primary">
                              {sizing.mean_ending_equity.toFixed(1)}%
                            </td>
                            <td className="py-2.5 text-right num text-primary">
                              {sizing.median_ending_equity.toFixed(1)}%
                            </td>
                            <td className="py-2.5 text-right num text-loss">
                              {sizing.mean_max_drawdown.toFixed(1)}%
                            </td>
                            <td className="py-2.5 text-right num text-loss">
                              {sizing.median_max_drawdown.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 text-right num font-semibold ${isHighRuin ? 'text-loss' : 'text-gain'}`}>
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
      </div>
    </div>
  );
}
