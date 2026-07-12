'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImportFileKind = 'csv' | 'pdf';

interface ImportDropzoneProps {
  /**
   * Called with a chosen file and its detected kind. The parent routes PDFs
   * through the Anthropic extraction action and CSVs through the local parser.
   */
  onFile: (file: File, kind: ImportFileKind) => void;
  /** Disable interaction (e.g. while a parse/extraction is in progress). */
  disabled?: boolean;
  /**
   * Whether PDF upload is offered. Hidden server-side when the Anthropic key
   * isn't configured, so the dropzone degrades to CSV-only cleanly.
   */
  acceptPdf?: boolean;
}

/**
 * MIME types we treat as CSV / PDF. Module constants so the `classify`
 * callback has stable identity across renders. Browsers are inconsistent
 * about MIME types for these extensions, so the extension check in
 * `classifyFile` is the real authority and MIME is a fallback.
 */
const CSV_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'];
const PDF_MIME_TYPES = ['application/pdf'];

/**
 * File drop zone styled to the instrument-panel aesthetic — NOT a default
 * browser file input.
 *
 * The native `<input type="file">` is visually hidden but present for
 * accessibility and the click-to-browse affordance; drag events drive a
 * focused state in `accent-signal` per the design system (the single
 * interactive color). Accepts `.csv` (and `.pdf` when `acceptPdf` is set);
 * anything else is rejected with a hairline-bordered inline message rather
 * than a system dialog.
 *
 * This component is dumb on purpose: it hands the chosen `File` + its kind up
 * via `onFile` and owns nothing about parsing — the parent `CsvImporter`
 * routes by kind and orchestrates the parse/extract → preview flow.
 */
export function ImportDropzone({
  onFile,
  disabled,
  acceptPdf = false,
}: ImportDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const classify = useCallback(
    (file: File): ImportFileKind | null => {
      if (/\.csv$/i.test(file.name) || CSV_MIME_TYPES.includes(file.type)) {
        return 'csv';
      }
      if (
        acceptPdf &&
        (/\.pdf$/i.test(file.name) || PDF_MIME_TYPES.includes(file.type))
      ) {
        return 'pdf';
      }
      return null;
    },
    [acceptPdf],
  );

  const handleFile = useCallback(
    (file: File) => {
      const kind = classify(file);
      if (!kind) {
        setRejection(
          acceptPdf
            ? `${file.name} is not a CSV or PDF file.`
            : `${file.name} is not a CSV file.`,
        );
        return;
      }
      setRejection(null);
      onFile(file, kind);
    },
    [acceptPdf, classify, onFile],
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

  const acceptAttr = acceptPdf ? '.csv,text/csv,application/pdf,.pdf' : '.csv,text/csv';

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a file or click to browse"
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
            <FileText size={18} strokeWidth={1.75} />
          ) : (
            <Upload size={18} strokeWidth={1.75} />
          )}
        </div>
        <p className="text-primary mt-4 text-sm">
          {dragging ? 'Drop file to parse' : 'Drop a file here'}
        </p>
        <p className="text-tertiary mt-1 text-xs">
          or{' '}
          <span className="text-accent-signal">click to browse</span>.{' '}
          {acceptPdf
            ? 'CSV parses locally; PDF statements are extracted on the server.'
            : 'CSV parses locally in your browser.'}
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={acceptAttr}
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

      {rejection ? <p className="text-loss text-xs">{rejection}</p> : null}
    </div>
  );
}
