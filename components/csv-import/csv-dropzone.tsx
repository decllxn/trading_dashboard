'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CsvDropzoneProps {
  /** Called with a valid CSV file chosen by drop or browse. */
  onFile: (file: File) => void;
  /** Disable interaction (e.g. while a parse is in progress). */
  disabled?: boolean;
}

/**
 * MIME types we treat as CSV. Kept as a module constant so the `isCsv`
 * callback identity is stable across renders (and so the accept check has no
 * hook dependencies). Some browsers report `.csv` files with an empty or
 * generic MIME type, so the extension check in `isCsv` is the real authority.
 */
const CSV_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'];

/**
 * File drop zone styled to the instrument-panel aesthetic — NOT a default
 * browser file input.
 *
 * The native `<input type="file">` is visually hidden but present for
 * accessibility and the click-to-browse affordance; drag events drive a
 * focused state in `accent-signal` per the design system (the single
 * interactive color). Accepts `.csv` only; anything else is rejected with a
 * hairline-bordered inline message rather than a system dialog.
 *
 * This component is dumb on purpose: it hands the chosen `File` up via
 * `onFile` and owns nothing about parsing — the parent `CsvImporter`
 * orchestrates the parse → preview flow.
 */
export function CsvDropzone({ onFile, disabled }: CsvDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const isCsv = useCallback((file: File) => {
    if (/\.csv$/i.test(file.name)) return true;
    return CSV_MIME_TYPES.includes(file.type);
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!isCsv(file)) {
        setRejection(`${file.name} is not a CSV file.`);
        return;
      }
      setRejection(null);
      onFile(file);
    },
    [isCsv, onFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [disabled, handleFile],
  );

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a CSV file or click to browse"
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          'border-hairline bg-surface flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed px-6 py-12 text-center transition-colors duration-150',
          'focus-visible:border-accent-signal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-signal',
          dragging
            ? 'border-accent-signal bg-surface-raised'
            : 'hover:bg-surface-raised',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-card border border-hairline transition-colors duration-150',
            dragging ? 'text-accent-signal' : 'text-secondary',
          )}
        >
          {dragging ? (
            <FileSpreadsheet size={18} strokeWidth={1.75} />
          ) : (
            <Upload size={18} strokeWidth={1.75} />
          )}
        </div>
        <p className="text-primary mt-4 text-sm">
          {dragging ? 'Drop file to parse' : 'Drop a CSV file here'}
        </p>
        <p className="text-tertiary mt-1 text-xs">
          or{' '}
          <span className="text-accent-signal">click to browse</span>. Parses
          locally in your browser.
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = '';
          }}
        />
      </div>

      {rejection ? (
        <p className="text-loss text-xs">{rejection}</p>
      ) : null}
    </div>
  );
}
