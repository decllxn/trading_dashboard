'use client';

import { useState } from 'react';
import { AlertTriangle, FileText, RefreshCw } from 'lucide-react';
import {
  formatFileSize,
  parseCsvText,
  readFileAsText,
  type ParsedCsv,
} from '@/lib/csv';
import { CsvDropzone } from './csv-dropzone';
import { CsvPreviewTable } from './csv-preview-table';

type Status =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string }
  | {
      kind: 'parsed';
      fileName: string;
      fileSize: number;
      parsed: ParsedCsv;
    }
  | { kind: 'error'; fileName: string; message: string };

/**
 * Orchestrates the CSV import preview flow (Phase 4a).
 *
 * A small explicit state machine: idle → parsing → parsed | error. The parse
 * is fully client-side (Papa via lib/csv.ts) — no network and no server
 * action. The user can clear and pick another file at any time, which resets
 * back to idle.
 *
 * Phase 4a is preview-only by design: there is no "Import" / "Commit" button
 * here. Column → field mapping (4b) and dedup/insert (4c) are later phases
 * that will hang off the `ParsedCsv` this component produces.
 */
export function CsvImporter() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleFile(file: File) {
    setStatus({ kind: 'parsing', fileName: file.name });
    try {
      const text = await readFileAsText(file);
      const result = parseCsvText(text);
      if (!result.ok) {
        setStatus({
          kind: 'error',
          fileName: file.name,
          message: result.message,
        });
        return;
      }
      setStatus({
        kind: 'parsed',
        fileName: file.name,
        fileSize: file.size,
        parsed: result,
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        fileName: file.name,
        message:
          err instanceof Error
            ? err.message
            : 'Could not read the file.',
      });
    }
  }

  function reset() {
    setStatus({ kind: 'idle' });
  }

  if (status.kind === 'idle' || status.kind === 'parsing') {
    return (
      <div className="space-y-4">
        <CsvDropzone onFile={handleFile} disabled={status.kind === 'parsing'} />
        {status.kind === 'parsing' ? (
          <p className="text-secondary flex items-center gap-2 text-xs">
            <RefreshCw
              size={12}
              strokeWidth={1.75}
              className="animate-spin"
            />
            Parsing {status.fileName}…
          </p>
        ) : null}
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="space-y-4">
        <div className="border-hairline bg-surface rounded-card border px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={14}
              strokeWidth={1.75}
              className="text-accent-alert mt-0.5 shrink-0"
            />
            <div className="space-y-1">
              <p className="text-primary text-sm">
                Couldn&apos;t parse {status.fileName}
              </p>
              <p className="text-secondary text-xs">{status.message}</p>
            </div>
          </div>
        </div>
        <ResetButton onClick={reset} />
      </div>
    );
  }

  // parsed
  return (
    <div className="space-y-6">
      <div className="border-hairline bg-surface flex items-center justify-between gap-3 rounded-card border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText
            size={16}
            strokeWidth={1.75}
            className="text-accent-signal shrink-0"
          />
          <div className="min-w-0">
            <p className="text-primary truncate text-sm">{status.fileName}</p>
            <p className="num text-tertiary text-xs">
              {formatFileSize(status.fileSize)}
            </p>
          </div>
        </div>
        <ResetButton onClick={reset} />
      </div>

      <CsvPreviewTable parsed={status.parsed} />
    </div>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-secondary hover:text-primary inline-flex items-center gap-1.5 rounded-card px-3 py-2 text-xs transition-colors duration-150"
    >
      <RefreshCw size={12} strokeWidth={1.75} />
      Choose another file
    </button>
  );
}
