'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { MetricKey } from './metric-definitions';
import { getMetricDefinition } from './metric-definitions';

interface MetricInfoModalProps {
  metricKey: MetricKey | null;
  onClose: () => void;
}

/**
 * Modal that displays the definition, formula, and a worked example for a
 * performance metric. Opened when the user clicks a stat card on the dashboard.
 *
 * Content is pulled from the static `METRIC_DEFINITIONS` registry. The modal
 * renders formula and example text in IBM Plex Mono (`.num`) with preserved
 * whitespace so multi-line formulas and examples align correctly.
 */
export function MetricInfoModal({ metricKey, onClose }: MetricInfoModalProps) {
  const definition = metricKey ? getMetricDefinition(metricKey) : undefined;

  return (
    <Dialog open={metricKey !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {definition ? (
          <>
            <DialogHeader>
              <DialogTitle>{definition.name}</DialogTitle>
              <DialogDescription>{definition.definition}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-tertiary mb-2 text-[10px] uppercase tracking-wide">
                  Formula
                </h3>
                <div className="border-hairline rounded-card border bg-base px-4 py-3">
                  <pre className="num text-primary whitespace-pre-wrap text-xs leading-relaxed">
                    {definition.formula}
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-tertiary mb-2 text-[10px] uppercase tracking-wide">
                  Example
                </h3>
                <div className="border-hairline rounded-card border bg-base px-4 py-3">
                  <pre className="num text-secondary whitespace-pre-wrap text-xs leading-relaxed">
                    {definition.example}
                  </pre>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook that manages the open/close state for metric info modals. Returns the
 * currently-selected metric key (null = closed) and a setter to open/close.
 */
export function useMetricInfoModal() {
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);

  return {
    activeMetric,
    openMetric: (key: MetricKey) => setActiveMetric(key),
    closeMetric: () => setActiveMetric(null),
  } as const;
}
