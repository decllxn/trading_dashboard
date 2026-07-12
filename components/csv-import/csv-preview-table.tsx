'use client';

import { PREVIEW_ROW_LIMIT, type ParsedCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';

interface CsvPreviewTableProps {
  parsed: ParsedCsv;
}

/**
 * Read-only preview of the first {@link PREVIEW_ROW_LIMIT} rows of a parsed
 * CSV, rendered with the same table vocabulary as the trades table: hairline
 * borders, surface background, tertiary uppercase headers, monospaced numerics.
 *
 * Numeric columns (detected in lib/csv.ts) are right-aligned and rendered with
 * `.num` per the design system rule — every number is IBM Plex Mono
 * tabular-nums, right-aligned, no exceptions. Text columns stay left-aligned.
 * This is raw data preview, not yet mapped to trades fields (Phase 4b), so
 * gain/loss coloring is intentionally NOT applied — nothing here is a P&L
 * value yet, and the DS bans gain/loss outside real P&L.
 */
export function CsvPreviewTable({ parsed }: CsvPreviewTableProps) {
  const previewRows = parsed.rows.slice(0, PREVIEW_ROW_LIMIT);
  const hiddenCount = Math.max(0, parsed.rowCount - previewRows.length);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-primary text-xs uppercase tracking-wide">
          Preview
        </h2>
        <p className="num text-tertiary text-xs">
          {parsed.rowCount} row{parsed.rowCount === 1 ? '' : 's'} ·{' '}
          {parsed.headers.length} column
          {parsed.headers.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="border-hairline bg-surface overflow-hidden rounded-card border">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-tertiary border-hairline border-b">
                {parsed.headers.map((header, colIndex) => (
                  <th
                    key={colIndex}
                    className={cn(
                      'px-3 py-2 text-[10px] font-normal uppercase tracking-wide',
                      parsed.numericColumns[colIndex]
                        ? 'text-right'
                        : 'text-left',
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-hairline border-b last:border-b-0"
                >
                  {parsed.headers.map((_, colIndex) => {
                    const cell = row[colIndex] ?? '';
                    const numeric = parsed.numericColumns[colIndex];
                    return (
                      <td
                        key={colIndex}
                        className={cn(
                          'px-3 py-2.5',
                          numeric
                            ? 'num text-primary text-right'
                            : 'text-secondary text-left',
                        )}
                      >
                        {cell === '' ? (
                          <span className="text-tertiary">—</span>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {hiddenCount > 0 ? (
        <p className="num text-tertiary text-xs">
          First {PREVIEW_ROW_LIMIT} of {parsed.rowCount} rows shown.{' '}
          {hiddenCount} more row{hiddenCount === 1 ? '' : 's'} not displayed.
        </p>
      ) : null}
    </div>
  );
}
