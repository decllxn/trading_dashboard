'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { PreviewResult } from '@/app/dashboard/trades/import/actions';
import type { SkipReason } from '@/lib/csv-mapping';

interface ImportReviewProps {
  fileName: string;
  preview: PreviewResult;
  onBack: () => void;
  onConfirm: () => void;
}

/** Human label for each skip reason, shown in the review list. */
const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  'missing-instrument': 'No instrument',
  'unresolved-asset-class': 'Unrecognized asset class',
  'unresolved-direction': 'Unrecognized direction',
  'unresolved-status': 'Unrecognized status',
  duplicate: 'Already imported',
};

/**
 * Pre-commit review (Phase 4c).
 *
 * Renders the "N new / M duplicates / K skipped" summary and a collapsible
 * list of every skipped row so the user can review what won't be imported
 * before confirming. The confirm button is disabled when there are zero new
 * trades — there's nothing to commit, so the action would be a no-op that
 * still upserts a (possibly empty) mapping.
 *
 * Skipped-row indices are 1-based file rows so the user can cross-reference
 * against their broker export.
 */
export function ImportReview({
  fileName,
  preview,
  onBack,
  onConfirm,
}: ImportReviewProps) {
  const [showSkipped, setShowSkipped] = useState(
    // Expand by default when there are non-duplicate skips (those are the
    // actionable ones the user should review); keep collapsed when the only
    // skips are duplicates (the common, expected case on re-import).
    preview.skippedCount > 0,
  );

  const nothingNew = preview.newCount === 0;

  return (
    <div className="space-y-6">
      <div className="border-hairline bg-surface rounded-card border px-4 py-4">
        <p className="text-tertiary mb-3 text-xs">
          <span className="text-primary">{fileName}</span> — review before importing.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="New"
            value={preview.newCount}
            valueClass="text-gain"
          />
          <Stat
            label="Duplicates"
            value={preview.duplicateCount}
            valueClass="text-loss"
          />
          <Stat
            label="Skipped"
            value={preview.skippedCount}
            valueClass="text-accent-alert"
          />
        </div>
        {preview.error ? (
          <p className="text-loss mt-3 text-xs">{preview.error}</p>
        ) : null}
        {nothingNew ? (
          <div className="border-accent-alert/40 text-accent-alert mt-3 flex items-start gap-2 rounded-card border px-3 py-2 text-xs">
            <AlertTriangle
              size={12}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0"
            />
            <span>
              Nothing new to import — every row is a duplicate or was skipped.
              Adjust the mapping or pick another file.
            </span>
          </div>
        ) : null}
      </div>

      {preview.skipped.length > 0 ? (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            className="text-secondary hover:text-primary inline-flex items-center gap-1 text-xs transition-colors duration-150"
          >
            {showSkipped ? (
              <ChevronDown size={12} strokeWidth={1.75} />
            ) : (
              <ChevronRight size={12} strokeWidth={1.75} />
            )}
            Review skipped rows
            <span className="num text-tertiary">({preview.skipped.length})</span>
          </button>
          {showSkipped ? (
            <div className="border-hairline bg-surface overflow-hidden rounded-card border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-tertiary border-hairline border-b">
                    <th className="px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wide">
                      Row
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wide">
                      Reason
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-normal uppercase tracking-wide">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.skipped.map((s, i) => (
                    <tr
                      key={i}
                      className="border-hairline border-b last:border-b-0"
                    >
                      <td className="num text-secondary px-3 py-2 text-right">
                        {s.rowIndex + 1}
                      </td>
                      <td className="text-secondary px-3 py-2">
                        {SKIP_REASON_LABELS[s.reason]}
                      </td>
                      <td className="text-tertiary px-3 py-2">
                        {s.detail || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="border-hairline flex items-center justify-between gap-3 border-t pt-6">
        <button
          type="button"
          onClick={onBack}
          className="text-secondary hover:text-primary rounded-card px-4 py-2 text-sm transition-colors duration-150"
        >
          Back to mapping
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={nothingNew || !!preview.error}
          className="bg-accent-signal text-base inline-flex items-center gap-1.5 rounded-card px-4 py-2 text-sm transition-colors duration-150 hover:bg-accent-signal/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Import <span className="num">{preview.newCount}</span> new trade
          {preview.newCount === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="border-hairline rounded-card border px-3 py-2">
      <p className="text-tertiary text-[10px] uppercase tracking-wide">{label}</p>
      <p className={`num text-lg ${valueClass}`}>{value}</p>
    </div>
  );
}
