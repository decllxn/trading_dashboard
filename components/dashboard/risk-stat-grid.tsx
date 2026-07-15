'use client';

import { cn } from '@/lib/utils';
import type { MetricKey } from './metric-definitions';
import { MetricInfoModal, useMetricInfoModal } from './metric-info-modal';

interface RiskStatGridProps {
  sharpe: string | null;
  sortino: string | null;
  avgR: string | null;
}

/**
 * Secondary stat grid for risk-adjusted metrics: Sharpe, Sortino, and Avg R.
 *
 * Mirrors the StatGrid pattern: clicking any card opens a definition modal.
 * All values arrive pre-formatted (or null for the empty/undefined case).
 */
export function RiskStatGrid({ sharpe, sortino, avgR }: RiskStatGridProps) {
  const { activeMetric, openMetric, closeMetric } = useMetricInfoModal();

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <RiskStatCard
          label="Sharpe"
          value={sharpe}
          onClick={() => openMetric('sharpe')}
        />
        <RiskStatCard
          label="Sortino"
          value={sortino}
          onClick={() => openMetric('sortino')}
        />
        <RiskStatCard
          label="Avg R"
          value={avgR}
          onClick={() => openMetric('avgR')}
        />
      </div>

      <MetricInfoModal metricKey={activeMetric} onClose={closeMetric} />
    </>
  );
}

interface RiskStatCardProps {
  label: string;
  value: string | null;
  onClick: () => void;
}

function RiskStatCard({ label, value, onClick }: RiskStatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-hairline bg-surface rounded-card border px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-signal cursor-pointer"
    >
      <p className="text-tertiary text-[10px] uppercase tracking-wide">{label}</p>
      <p className="num text-primary mt-2 text-lg">{value ?? '\u2014'}</p>
    </button>
  );
}
