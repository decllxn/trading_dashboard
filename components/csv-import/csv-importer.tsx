'use client';

import { useState } from 'react';
import { AlertTriangle, Check, FileText, RefreshCw } from 'lucide-react';
import {
  formatFileSize,
  parseCsvText,
  readFileAsText,
  type ParsedCsv,
} from '@/lib/csv';
import {
  DEFAULT_IMPORT_DEFAULTS,
  resolveSavedMapping,
  suggestMapping,
  type ColumnMapping,
  type ImportDefaults,
} from '@/lib/csv-mapping';
import {
  commitImport,
  extractPdfTrades,
  previewImport,
  type CommitResult,
  type PreviewResult,
} from '@/app/dashboard/trades/import/actions';
import { ImportDropzone } from './csv-dropzone';
import type { ImportFileKind } from './csv-dropzone';
import { CsvPreviewTable } from './csv-preview-table';
import { ColumnMapper } from './column-mapper';
import { ImportReview } from './import-review';

/** A previously-saved broker mapping passed from the server for auto-apply. */
export interface SavedBrokerMapping {
  brokerName: string;
  mapping: ColumnMapping;
}

interface CsvImporterProps {
  /** All of the user's saved mappings, for broker-name autocomplete. */
  savedMappings: ReadonlyArray<SavedBrokerMapping>;
  /** True when PDF upload should be offered (Anthropic key configured). */
  acceptPdf?: boolean;
}

/** Shared fields across the parsed / confirming / importing states. */
interface ParsedContext {
  fileName: string;
  fileSize: number;
  parsed: ParsedCsv;
  mapping: ColumnMapping;
  defaults: ImportDefaults;
  brokerName: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string }
  | ({ kind: 'parsed' } & ParsedContext)
  | ({ kind: 'confirming' } & ParsedContext & { preview: PreviewResult })
  | ({ kind: 'importing' } & ParsedContext)
  | { kind: 'done'; fileName: string; result: CommitResult }
  | { kind: 'error'; fileName: string; message: string };

/**
 * Orchestrates the full CSV import flow (Phase 4a preview + 4b mapping + 4c
 * dedup review).
 *
 * State machine: idle → parsing → parsed (preview + mapping) → confirming
 * (dedup summary, review skipped rows) → importing → done | error.
 *
 * On "Import", the server runs `previewImport` (build + dedup against existing
 * trades, no writes) and shows the "N new / M duplicates / K skipped" summary
 * with a reviewable skipped-row list. The user confirms, then `commitImport`
 * re-derives the new set server-side and inserts only those rows. Dedup is
 * re-derived on commit so a malicious payload can't bypass it, and so trades
 * added between preview and commit are accounted for.
 */
export function CsvImporter({ savedMappings, acceptPdf }: CsvImporterProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  /**
   * Route by file kind. CSVs parse client-side (Papaparse); PDFs are sent to
   * the `extractPdfTrades` server action, which pulls text server-side and
   * asks Claude for a structured `{ headers, rows }` response. Both paths
   * converge on the same `parsed` state, so the mapping / preview / dedup
   * flow that follows is identical regardless of source.
   */
  async function handleFile(file: File, kind: ImportFileKind) {
    setStatus({ kind: 'parsing', fileName: file.name });
    try {
      let parsed: ParsedCsv;
      if (kind === 'pdf') {
        const result = await extractPdfTrades(file);
        if (!result.ok || !result.parsed) {
          setStatus({
            kind: 'error',
            fileName: file.name,
            message: result.error ?? 'Could not extract trades from the PDF.',
          });
          return;
        }
        parsed = result.parsed;
      } else {
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
        parsed = result;
      }
      setStatus({
        kind: 'parsed',
        fileName: file.name,
        fileSize: file.size,
        parsed,
        mapping: suggestMapping(parsed.headers),
        defaults: DEFAULT_IMPORT_DEFAULTS,
        brokerName: '',
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        fileName: file.name,
        message:
          err instanceof Error ? err.message : 'Could not read the file.',
      });
    }
  }

  function reset() {
    setStatus({ kind: 'idle' });
  }

  function applyBrokerMapping(brokerName: string) {
    setStatus((prev) => {
      if (prev.kind !== 'parsed') return prev;
      const saved = savedMappings.find(
        (m) => m.brokerName.toLowerCase() === brokerName.trim().toLowerCase(),
      );
      if (!saved) return prev;
      return {
        ...prev,
        brokerName,
        mapping: resolveSavedMapping(saved.mapping, prev.parsed.headers),
      };
    });
  }

  async function runPreview() {
    if (status.kind !== 'parsed') return;
    if (status.mapping.instrument == null) return; // required — guarded in UI
    const ctx: ParsedContext = {
      fileName: status.fileName,
      fileSize: status.fileSize,
      parsed: status.parsed,
      mapping: status.mapping,
      defaults: status.defaults,
      brokerName: status.brokerName,
    };
    setStatus({ kind: 'importing', ...ctx });
    const preview = await previewImport({
      brokerName: ctx.brokerName,
      parsed: ctx.parsed,
      mapping: ctx.mapping,
      defaults: ctx.defaults,
    });
    setStatus({ kind: 'confirming', ...ctx, preview });
  }

  async function confirmCommit() {
    if (status.kind !== 'confirming') return;
    const ctx: ParsedContext = {
      fileName: status.fileName,
      fileSize: status.fileSize,
      parsed: status.parsed,
      mapping: status.mapping,
      defaults: status.defaults,
      brokerName: status.brokerName,
    };
    setStatus({ kind: 'importing', ...ctx });
    const result = await commitImport({
      brokerName: ctx.brokerName,
      parsed: ctx.parsed,
      mapping: ctx.mapping,
      defaults: ctx.defaults,
    });
    setStatus({ kind: 'done', fileName: ctx.fileName, result });
  }

  function backToMapping() {
    setStatus((prev) =>
      prev.kind === 'confirming'
        ? {
            kind: 'parsed',
            fileName: prev.fileName,
            fileSize: prev.fileSize,
            parsed: prev.parsed,
            mapping: prev.mapping,
            defaults: prev.defaults,
            brokerName: prev.brokerName,
          }
        : prev,
    );
  }

  // idle / parsing
  if (status.kind === 'idle' || status.kind === 'parsing') {
    return (
      <div className="space-y-4">
        <ImportDropzone
          onFile={handleFile}
          disabled={status.kind === 'parsing'}
          acceptPdf={acceptPdf}
        />
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
        {savedMappings.length > 0 ? (
          <p className="text-tertiary text-xs">
            Saved brokers: {savedMappings.map((m) => m.brokerName).join(', ')}
          </p>
        ) : null}
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="space-y-4">
        <ErrorNotice fileName={status.fileName} message={status.message} />
        <ResetButton onClick={reset} />
      </div>
    );
  }

  if (status.kind === 'done') {
    return (
      <DoneNotice
        fileName={status.fileName}
        result={status.result}
        onReset={reset}
      />
    );
  }

  if (status.kind === 'confirming') {
    return (
      <ImportReview
        fileName={status.fileName}
        preview={status.preview}
        onBack={backToMapping}
        onConfirm={confirmCommit}
      />
    );
  }

  // parsed or importing — both render the mapping editor; importing disables it.
  const importing = status.kind === 'importing';
  const s = status;

  return (
    <div className="space-y-6">
      <FileHeader
        fileName={s.fileName}
        fileSize={s.fileSize}
        onReset={reset}
        resetDisabled={importing}
      />

      <CsvPreviewTable parsed={s.parsed} />

      <section className="space-y-3">
        <h2 className="font-display text-primary text-xs uppercase tracking-wide">
          Broker
        </h2>
        <div className="flex flex-wrap gap-2">
          {savedMappings.map((m) => {
            const active =
              m.brokerName.toLowerCase() === s.brokerName.trim().toLowerCase();
            return (
              <button
                key={m.brokerName}
                type="button"
                disabled={importing}
                onClick={() => applyBrokerMapping(m.brokerName)}
                className={
                  'border-hairline rounded-card border px-2.5 py-1 text-xs transition-colors duration-150 disabled:opacity-50 ' +
                  (active
                    ? 'border-accent-signal text-accent-signal'
                    : 'text-secondary hover:text-primary hover:bg-surface-raised')
                }
              >
                {m.brokerName}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={s.brokerName}
          onChange={(e) =>
            setStatus((prev) =>
              prev.kind === 'parsed' || prev.kind === 'importing'
                ? { ...prev, brokerName: e.target.value }
                : prev,
            )
          }
          placeholder="Broker name (saved for re-imports)"
          list="broker-names"
          disabled={importing}
          className="w-full rounded-card border border-hairline bg-surface px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:border-accent-signal focus:outline-none focus:ring-1 focus:ring-accent-signal"
        />
        <datalist id="broker-names">
          {savedMappings.map((m) => (
            <option key={m.brokerName} value={m.brokerName} />
          ))}
        </datalist>
        {savedMappings.some(
          (m) =>
            m.brokerName.toLowerCase() === s.brokerName.trim().toLowerCase(),
        ) ? (
          <p className="text-accent-signal text-xs">
            Saved mapping applied. Override any field below if this file differs.
          </p>
        ) : null}
      </section>

      <ColumnMapper
        parsed={s.parsed}
        mapping={s.mapping}
        disabled={importing}
        onMappingChange={(mapping) =>
          setStatus((prev) =>
            prev.kind === 'parsed' || prev.kind === 'importing'
              ? { ...prev, mapping }
              : prev,
          )
        }
        defaults={s.defaults}
        onDefaultsChange={(defaults) =>
          setStatus((prev) =>
            prev.kind === 'parsed' || prev.kind === 'importing'
              ? { ...prev, defaults }
              : prev,
          )
        }
      />

      <div className="border-hairline flex items-center justify-between gap-3 border-t pt-6">
        <div>
          {s.mapping.instrument == null ? (
            <p className="text-accent-alert text-xs">
              Map the Instrument field to import.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={importing}
            className="text-secondary hover:text-primary rounded-card px-4 py-2 text-sm transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={runPreview}
            disabled={s.mapping.instrument == null || importing}
            className="bg-accent-signal text-base inline-flex items-center gap-1.5 rounded-card px-4 py-2 text-sm transition-colors duration-150 hover:bg-accent-signal/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <>
                <RefreshCw
                  size={14}
                  strokeWidth={2}
                  className="animate-spin"
                />
                Checking…
              </>
            ) : (
              <>Review import</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileHeader({
  fileName,
  fileSize,
  onReset,
  resetDisabled,
}: {
  fileName: string;
  fileSize: number;
  onReset: () => void;
  resetDisabled?: boolean;
}) {
  return (
    <div className="border-hairline bg-surface flex items-center justify-between gap-3 rounded-card border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <FileText
          size={16}
          strokeWidth={1.75}
          className="text-accent-signal shrink-0"
        />
        <div className="min-w-0">
          <p className="text-primary truncate text-sm">{fileName}</p>
          <p className="num text-tertiary text-xs">{formatFileSize(fileSize)}</p>
        </div>
      </div>
      <ResetButton onClick={onReset} disabled={resetDisabled} />
    </div>
  );
}

function ErrorNotice({
  fileName,
  message,
}: {
  fileName: string;
  message: string;
}) {
  return (
    <div className="border-hairline bg-surface rounded-card border px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          strokeWidth={1.75}
          className="text-accent-alert mt-0.5 shrink-0"
        />
        <div className="space-y-1">
          <p className="text-primary text-sm">Couldn&apos;t parse {fileName}</p>
          <p className="text-secondary text-xs">{message}</p>
        </div>
      </div>
    </div>
  );
}

function DoneNotice({
  fileName,
  result,
  onReset,
}: {
  fileName: string;
  result: CommitResult;
  onReset: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="border-hairline bg-surface rounded-card border px-4 py-4">
        <div className="flex items-start gap-2.5">
          <Check
            size={16}
            strokeWidth={1.75}
            className="text-accent-signal mt-0.5 shrink-0"
          />
          <div className="space-y-2">
            <p className="text-primary text-sm">
              Imported <span className="num text-gain">{result.inserted}</span>{' '}
              trade{result.inserted === 1 ? '' : 's'} from {fileName}
              {result.duplicatesSkipped > 0 ? (
                <>
                  {' — '}
                  <span className="num text-loss">
                    {result.duplicatesSkipped}
                  </span>{' '}
                  duplicate{result.duplicatesSkipped === 1 ? '' : 's'} skipped
                </>
              ) : null}
              {result.mappingSaved ? (
                <span className="text-secondary"> · mapping saved</span>
              ) : null}
            </p>
            {result.error ? (
              <p className="text-loss text-xs">{result.error}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReset}
          className="border-hairline text-secondary hover:text-primary hover:bg-surface-raised inline-flex items-center gap-1.5 rounded-card border px-4 py-2 text-sm transition-colors duration-150"
        >
          <RefreshCw size={14} strokeWidth={1.75} />
          Import another file
        </button>
      </div>
    </div>
  );
}

function ResetButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-secondary hover:text-primary inline-flex items-center gap-1.5 rounded-card px-3 py-2 text-xs transition-colors duration-150 disabled:opacity-50"
    >
      <RefreshCw size={12} strokeWidth={1.75} />
      Choose another file
    </button>
  );
}
