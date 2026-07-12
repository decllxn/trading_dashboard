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
import { importCsvTrades, type ImportResult } from '@/app/dashboard/trades/import/actions';
import { CsvDropzone } from './csv-dropzone';
import { CsvPreviewTable } from './csv-preview-table';
import { ColumnMapper } from './column-mapper';

/** A previously-saved broker mapping passed from the server for auto-apply. */
export interface SavedBrokerMapping {
  brokerName: string;
  mapping: ColumnMapping;
}

interface CsvImporterProps {
  /** All of the user's saved mappings, for broker-name autocomplete. */
  savedMappings: ReadonlyArray<SavedBrokerMapping>;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string }
  | {
      kind: 'parsed';
      fileName: string;
      fileSize: number;
      parsed: ParsedCsv;
      mapping: ColumnMapping;
      defaults: ImportDefaults;
      brokerName: string;
    }
  | {
      kind: 'importing';
      fileName: string;
      fileSize: number;
      parsed: ParsedCsv;
      mapping: ColumnMapping;
      defaults: ImportDefaults;
      brokerName: string;
    }
  | { kind: 'done'; fileName: string; result: ImportResult }
  | { kind: 'error'; fileName: string; message: string };

/**
 * Orchestrates the full CSV import flow (Phase 4a + 4b).
 *
 * State machine: idle → parsing → parsed (preview + mapping) → importing →
 * done | error. The user moves from preview to mapping by confirming, edits
 * the auto-suggested mapping, names the broker, and commits. On commit the
 * server action builds + bulk-inserts the trades and upserts the (user,
 * broker) mapping; re-importing the same broker auto-applies that mapping via
 * the {@link SavedBrokerMapping} preload.
 */
export function CsvImporter({ savedMappings }: CsvImporterProps) {
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
        mapping: suggestMapping(result.headers),
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
    if (status.kind !== 'parsed') return;
    const saved = savedMappings.find(
      (m) => m.brokerName.toLowerCase() === brokerName.trim().toLowerCase(),
    );
    if (!saved) return;
    setStatus({
      ...status,
      brokerName,
      mapping: resolveSavedMapping(saved.mapping, status.parsed.headers),
    });
  }

  async function commit() {
    if (status.kind !== 'parsed') return;
    const { fileName, parsed, mapping, defaults, brokerName } = status;
    if (mapping.instrument == null) return; // required — guarded in UI
    setStatus({
      kind: 'importing',
      fileName,
      fileSize: status.fileSize,
      parsed,
      mapping,
      defaults,
      brokerName,
    });
    const result = await importCsvTrades({
      brokerName,
      parsed,
      mapping,
      defaults,
    });
    setStatus({ kind: 'done', fileName, result });
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
      <DoneNotice fileName={status.fileName} result={status.result} onReset={reset} />
    );
  }

  const importing = status.kind === 'importing';
  const s = importing
    ? {
        fileName: status.fileName,
        fileSize: status.fileSize,
        parsed: status.parsed,
        mapping: status.mapping,
        defaults: status.defaults,
        brokerName: status.brokerName,
      }
    : status;

  const canCommit = s.mapping.instrument != null && !importing;

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
            <p className="text-primary truncate text-sm">{s.fileName}</p>
            <p className="num text-tertiary text-xs">
              {formatFileSize(s.fileSize)}
            </p>
          </div>
        </div>
        <ResetButton onClick={reset} disabled={importing} />
      </div>

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
            onClick={commit}
            disabled={!canCommit}
            className="bg-accent-signal text-base inline-flex items-center gap-1.5 rounded-card px-4 py-2 text-sm transition-colors duration-150 hover:bg-accent-signal/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <>
                <RefreshCw
                  size={14}
                  strokeWidth={2}
                  className="animate-spin"
                />
                Importing…
              </>
            ) : (
              <>Import {s.parsed.rowCount} row{s.parsed.rowCount === 1 ? '' : 's'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorNotice({ fileName, message }: { fileName: string; message: string }) {
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
  result: ImportResult;
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
              {result.skipped > 0 ? (
                <>
                  {' — '}
                  <span className="num text-loss">{result.skipped}</span>{' '}
                  row{result.skipped === 1 ? '' : 's'} skipped
                </>
              ) : null}
              {result.mappingSaved ? (
                <span className="text-secondary"> · mapping saved</span>
              ) : null}
            </p>
            {result.error ? (
              <p className="text-loss text-xs">{result.error}</p>
            ) : null}
            {result.skipSample.length > 0 ? (
              <div className="border-hairline mt-2 rounded-card border px-3 py-2">
                <p className="text-tertiary mb-1 text-[10px] uppercase tracking-wide">
                  Sample skipped rows
                </p>
                <ul className="space-y-0.5">
                  {result.skipSample.map((s, i) => (
                    <li key={i} className="text-secondary text-xs">
                      <span className="num">row {s.rowIndex + 1}</span> — {s.reason}
                      {s.detail ? `: ${s.detail}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
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
