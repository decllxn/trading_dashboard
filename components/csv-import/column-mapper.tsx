'use client';

import { Select } from '@/components/field';
import {
  ASSET_CLASS_OPTIONS,
  DIRECTION_OPTIONS,
  STATUS_OPTIONS,
} from '@/lib/trades';
import {
  FIELD_LABELS,
  FIELD_ORDER,
  REQUIRED_MAPPED_FIELDS,
  type ColumnMapping,
  type TradesField,
} from '@/lib/csv-mapping';
import type { ParsedCsv } from '@/lib/csv';
import type {
  AssetClass,
  Direction,
  TradeStatus,
} from '@/db/schema';

interface ColumnMapperProps {
  parsed: ParsedCsv;
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  defaults: {
    assetClass: AssetClass;
    direction: Direction;
    status: TradeStatus;
  };
  onDefaultsChange: (defaults: {
    assetClass: AssetClass;
    direction: Direction;
    status: TradeStatus;
  }) => void;
  /** Disable all controls — used while an import is in flight. */
  disabled?: boolean;
}

const NONE_VALUE = '__none__';

/**
 * Column → trades-field mapping UI.
 *
 * One row per mappable trades field, in canonical order. Each row shows the
 * field label on the left and a dropdown of detected CSV columns on the
 * right; the dropdown pre-selects the auto-suggested match (or a saved
 * mapping) and includes a "—" option to clear. The required field
 * (`instrument`) is marked and can't be left unmapped before import.
 *
 * Below the column rows sit three per-import default selectors (asset class,
 * direction, status). These apply when a field isn't column-mapped OR when a
 * mapped cell value can't be resolved to a valid enum — most broker CSVs omit
 * asset class entirely, so the default is what every row receives.
 */
export function ColumnMapper({
  parsed,
  mapping,
  onMappingChange,
  defaults,
  onDefaultsChange,
  disabled,
}: ColumnMapperProps) {
  const usedHeaders = new Set(
    FIELD_ORDER.map((f) => mapping[f]).filter((h): h is string => !!h),
  );

  function setField(field: TradesField, header: string | null) {
    const next = { ...mapping };
    if (header == null) delete next[field];
    else next[field] = header;
    onMappingChange(next);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionTitle>Map columns</SectionTitle>
        <p className="text-secondary text-xs">
          Detected columns are matched automatically. Override any field with
          the dropdown — unmatched fields use the defaults below.
        </p>
        <div className="border-hairline bg-surface overflow-hidden rounded-card border">
          <div className="divide-y divide-[rgb(var(--hairline))]">
            {FIELD_ORDER.map((field) => (
              <MappingRow
                key={field}
                field={field}
                headers={parsed.headers}
                value={mapping[field] ?? null}
                usedHeaders={usedHeaders}
                disabled={disabled}
                onChange={(header) => setField(field, header)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Defaults for unmapped values</SectionTitle>
        <p className="text-secondary text-xs">
          Applied to any row whose column is unmapped or whose value can&apos;t
          be read as a valid option.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DefaultField label="Asset class">
            <Select
              aria-label="Default asset class"
              value={defaults.assetClass}
              disabled={disabled}
              onChange={(e) =>
                onDefaultsChange({
                  ...defaults,
                  assetClass: e.target.value as AssetClass,
                })
              }
            >
              {ASSET_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </DefaultField>
          <DefaultField label="Direction">
            <Select
              aria-label="Default direction"
              value={defaults.direction}
              disabled={disabled}
              onChange={(e) =>
                onDefaultsChange({
                  ...defaults,
                  direction: e.target.value as Direction,
                })
              }
            >
              {DIRECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </DefaultField>
          <DefaultField label="Status">
            <Select
              aria-label="Default status"
              value={defaults.status}
              disabled={disabled}
              onChange={(e) =>
                onDefaultsChange({
                  ...defaults,
                  status: e.target.value as TradeStatus,
                })
              }
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </DefaultField>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-primary text-xs uppercase tracking-wide">
      {children}
    </h2>
  );
}

interface MappingRowProps {
  field: TradesField;
  headers: string[];
  value: string | null;
  /** Headers already claimed by another field — shown but dimmed. */
  usedHeaders: Set<string>;
  disabled?: boolean;
  onChange: (header: string | null) => void;
}

function MappingRow({
  field,
  headers,
  value,
  usedHeaders,
  disabled,
  onChange,
}: MappingRowProps) {
  const required = REQUIRED_MAPPED_FIELDS.includes(field);
  const empty = value == null;
  // The currently-selected header is always available even if claimed
  // elsewhere (shouldn't happen — each header maps to one field — but be safe).
  const available = headers.filter(
    (h) => h === value || !usedHeaders.has(h),
  );

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-primary text-sm">{FIELD_LABELS[field]}</span>
        {required ? (
          <span className="text-accent-alert text-[10px] uppercase tracking-wide">
            required
          </span>
        ) : null}
        {empty && !required ? (
          <span className="text-tertiary text-[10px] uppercase tracking-wide">
            optional
          </span>
        ) : null}
      </div>
      <div className="w-1/2 min-w-[180px]">
        <Select
          aria-label={`Source column for ${FIELD_LABELS[field]}`}
          value={value ?? NONE_VALUE}
          disabled={disabled}
          onChange={(e) =>
            onChange(
              e.target.value === NONE_VALUE ? null : e.target.value,
            )
          }
        >
          <option value={NONE_VALUE}>— none —</option>
          {available.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function DefaultField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-tertiary block text-xs uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}
