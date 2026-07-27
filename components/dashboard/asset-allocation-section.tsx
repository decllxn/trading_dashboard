'use client';

import { useState } from 'react';
import type { StatTrade } from '@/lib/stats';
import { AllocationChart } from '@/components/charts/allocation-chart';
import { AssetTelemetryPanel } from './asset-telemetry-panel';

interface AssetAllocationSectionProps {
  trades: ReadonlyArray<StatTrade>;
  breakevenThreshold?: number;
}

export function AssetAllocationSection({
  trades,
  breakevenThreshold,
}: AssetAllocationSectionProps) {
  const [selectedAsset, setSelectedAsset] = useState<string>('ALL');

  return (
    <div className="space-y-6">
      {/* DONUT PIE CHART ALLOCATION */}
      <AllocationChart
        trades={trades}
        selectedAsset={selectedAsset}
        onSelectAsset={setSelectedAsset}
      />

      {/* ASSET FILTERING & TELEMETRY BREAKDOWN PANEL */}
      <AssetTelemetryPanel
        trades={trades}
        breakevenThreshold={breakevenThreshold}
        selectedAsset={selectedAsset}
        onSelectAsset={setSelectedAsset}
      />
    </div>
  );
}
