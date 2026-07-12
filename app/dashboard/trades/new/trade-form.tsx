'use client';

import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { Field, Input, Label, Select } from '@/components/field';
import { Segmented } from '@/components/segmented';
import { TagPicker } from '@/components/tag-picker';
import { SubmitButton } from '@/components/submit-button';
import { createTrade, type TradeFormState } from '../actions';
import {
  ASSET_CLASS_OPTIONS,
  DIRECTION_OPTIONS,
  STATUS_OPTIONS,
  computeRMultiple,
  formatR,
  parseNumber,
  rColorClass,
} from '@/lib/trades';
import type { AssetClass, Direction, Tag, TradeStatus } from '@/db/schema';

interface TradeFormProps {
  tags: ReadonlyArray<Tag>;
}

/**
 * Client trade-entry form.
 *
 * State:
 *  - direction / status are React state (driving segmented controls and the
 *    exit-fields-optional-when-open rule). They're mirrored into the form via
 *    hidden inputs so the server action receives them even though the toggles
 *    are custom components.
 *  - selected tag ids are React state for the live chip highlighting; the
 *    checkboxes themselves also submit, so the two stay in sync via onChange.
 *  - R-multiple is derived live from entry/stop/exit + direction for a live
 *    preview; the server recomputes it authoritatively on submit (the field
 *    is never user-typed).
 *
 * Server action wiring follows the same useFormState pattern as the auth
 * forms: the action returns { errors, values, formError }, and this component
 * paints per-field errors and echoes values back on failure.
 */
export function TradeForm({ tags }: TradeFormProps) {
  const [state, formAction] = useFormState<TradeFormState, FormData>(
    createTrade,
    {},
  );

  const v = state.values ?? {};

  const [direction, setDirection] = useState<Direction>(
    (v.direction as Direction) || 'long',
  );
  const [status, setStatus] = useState<TradeStatus>(
    (v.status as TradeStatus) || 'open',
  );

  // Entry/stop/exit string values for the live R preview. We read them from
  // controlled inputs below so the preview recomputes on every keystroke
  // without waiting for a submit.
  const [entryPrice, setEntryPrice] = useState(v.entryPrice ?? '');
  const [stopPrice, setStopPrice] = useState(v.stopPrice ?? '');
  const [exitPrice, setExitPrice] = useState(v.exitPrice ?? '');

  const [selectedTags, setSelectedTags] = useState<ReadonlyArray<string>>(
    v.tags ? v.tags.split(',') : [],
  );

  const rPreview = useMemo(
    () =>
      computeRMultiple(
        parseNumber(entryPrice),
        parseNumber(stopPrice),
        parseNumber(exitPrice),
        direction,
      ),
    [entryPrice, stopPrice, exitPrice, direction],
  );

  const exitOptional = status === 'open';

  return (
    <form action={formAction} className="space-y-8">
      {state.formError ? (
        <p className="border-accent-alert/40 text-accent-alert rounded-card border bg-surface px-3 py-2 text-xs">
          {state.formError}
        </p>
      ) : null}

      {/* Identity — what was traded and which way */}
      <section className="space-y-4">
        <SectionTitle>Trade</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="instrument" label="Instrument" error={state.errors?.instrument}>
            <Input
              id="instrument"
              name="instrument"
              defaultValue={v.instrument}
              required
              placeholder="AAPL"
              autoComplete="off"
            />
          </Field>
          <Field id="assetClass" label="Asset class" error={state.errors?.assetClass}>
            <Select
              id="assetClass"
              name="assetClass"
              defaultValue={v.assetClass}
              required
            >
              {ASSET_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="direction" label="Direction" error={state.errors?.direction}>
            <Segmented<Direction>
              name="direction"
              aria-label="Direction"
              options={DIRECTION_OPTIONS}
              value={direction}
              onChange={setDirection}
            />
          </Field>
          <Field id="status" label="Status" error={state.errors?.status}>
            <Segmented<TradeStatus>
              name="status"
              aria-label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
          </Field>
        </div>
      </section>

      {/* Sizing & prices — all numeric, all monospace via .num */}
      <section className="space-y-4">
        <SectionTitle>Levels</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="size" label="Size" error={state.errors?.size}>
            <Input
              id="size"
              name="size"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.size}
              required
              placeholder="100"
            />
          </Field>
          <Field id="entryPrice" label="Entry price" error={state.errors?.entryPrice}>
            <Input
              id="entryPrice"
              name="entryPrice"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.entryPrice}
              required
              placeholder="0.00"
              onChange={(e) => setEntryPrice(e.target.value)}
            />
          </Field>
          <Field id="stopPrice" label="Stop price" error={state.errors?.stopPrice}>
            <Input
              id="stopPrice"
              name="stopPrice"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.stopPrice}
              placeholder="0.00"
              onChange={(e) => setStopPrice(e.target.value)}
            />
          </Field>
          <Field id="targetPrice" label="Target price" error={state.errors?.targetPrice}>
            <Input
              id="targetPrice"
              name="targetPrice"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.targetPrice}
              placeholder="0.00"
            />
          </Field>
          <Field id="exitPrice" label="Exit price" error={state.errors?.exitPrice}>
            <Input
              id="exitPrice"
              name="exitPrice"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.exitPrice}
              required={!exitOptional}
              placeholder={exitOptional ? 'optional' : '0.00'}
              onChange={(e) => setExitPrice(e.target.value)}
            />
          </Field>

          {/* R-multiple readout — computed, not typed. */}
          <div className="space-y-1.5">
            <Label>R-multiple</Label>
            <div
              className={`num flex h-[38px] items-center rounded-card border border-hairline bg-surface-raised px-3 text-sm ${rColorClass(
                rPreview,
              )}`}
            >
              {formatR(rPreview)}
            </div>
            <p className="text-tertiary text-[10px]">
              Computed from entry, stop, exit.
            </p>
          </div>
        </div>
      </section>

      {/* Timing */}
      <section className="space-y-4">
        <SectionTitle>Timing</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="entryTime" label="Entry time" error={state.errors?.entryTime}>
            <Input
              id="entryTime"
              name="entryTime"
              type="datetime-local"
              defaultValue={v.entryTime}
            />
          </Field>
          <Field id="exitTime" label="Exit time" error={state.errors?.exitTime}>
            <Input
              id="exitTime"
              name="exitTime"
              type="datetime-local"
              defaultValue={v.exitTime}
              required={!exitOptional}
              placeholder={exitOptional ? 'optional' : undefined}
            />
          </Field>
        </div>
      </section>

      {/* P&L — manual entry; Phase 5 will compute it from prices × size. */}
      <section className="space-y-4">
        <SectionTitle>Result</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="pnl" label="P&amp;L (account currency)" error={state.errors?.pnl}>
            <Input
              id="pnl"
              name="pnl"
              type="number"
              inputMode="decimal"
              step="any"
              defaultValue={v.pnl}
              placeholder={exitOptional ? 'optional' : '0.00'}
            />
          </Field>
        </div>
      </section>

      {/* Tags — grouped multi-select */}
      <section className="space-y-4">
        <SectionTitle>Tags</SectionTitle>
        <TagPicker
          tags={tags}
          selected={selectedTags}
          onToggle={(tagId) =>
            setSelectedTags((prev) =>
              prev.includes(tagId)
                ? prev.filter((t) => t !== tagId)
                : [...prev, tagId],
            )
          }
        />
      </section>

      <div className="border-hairline flex items-center justify-end gap-3 border-t pt-6">
        <Link
          href="/dashboard/trades"
          className="text-secondary hover:text-primary rounded-card px-4 py-2 text-sm transition-colors duration-150"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving…">Save trade</SubmitButton>
      </div>
    </form>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-primary text-xs uppercase tracking-wide">
      {children}
    </h2>
  );
}
