'use client';

import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { Field, Input, Label, Select } from '@/components/field';
import { Segmented } from '@/components/segmented';
import { TagPicker } from '@/components/tag-picker';
import { SubmitButton } from '@/components/submit-button';
import { createTrade, updateTrade, type TradeFormState } from '../actions';
import {
  ASSET_CLASS_OPTIONS,
  DIRECTION_OPTIONS,
  STATUS_OPTIONS,
  computeRMultiple,
  formatR,
  formatPnl,
  parseNumber,
  pnlColorClass,
  rColorClass,
} from '@/lib/trades';
import { computeNetPnl } from '@/lib/stats';
import type { AssetClass, Direction, Tag, TradeStatus } from '@/db/schema';
import { createBrowserClient } from '@supabase/ssr';
import { cn } from '@/lib/utils';
import { UploadCloud, X, Loader2 } from 'lucide-react';

/** Shape of the trade data passed in for edit mode. */
export interface TradeInitialData {
  id: string;
  instrument: string;
  assetClass: AssetClass;
  direction: Direction;
  status: TradeStatus;
  entryPrice: string;
  exitPrice: string;
  size: string;
  stopPrice: string;
  targetPrice: string;
  entryTime: string;
  exitTime: string;
  pnl: string;
  commission: string;
  swap: string;
  fees: string;
  tagIds: ReadonlyArray<string>;
  dailyPdArray?: string;
  oneHourPdArray?: string;
  thirtyMinutePdArray?: string;
  images?: string[];
}

interface TradeFormProps {
  tags: ReadonlyArray<Tag>;
  /** When provided, the form operates in edit mode. */
  initialData?: TradeInitialData;
}

/**
 * Client trade form — shared between create and edit.
 *
 * In create mode, submits to `createTrade`. In edit mode, submits to
 * `updateTrade` (bound with the trade ID). R-multiple is derived live from
 * entry/stop/exit + direction and recomputed on submit.
 */
export function TradeForm({ tags, initialData }: TradeFormProps) {
  const isEdit = !!initialData;

  const boundUpdate = initialData
    ? updateTrade.bind(null, initialData.id)
    : createTrade;

  const [state, formAction] = useFormState<TradeFormState, FormData>(
    boundUpdate,
    {},
  );

  // On validation failure the server echoes values back; on first render of
  // edit mode, use the initial data instead.
  const v = state.values ?? {};

  const [direction, setDirection] = useState<Direction>(
    (v.direction as Direction) || initialData?.direction || 'long',
  );
  const [status, setStatus] = useState<TradeStatus>(
    (v.status as TradeStatus) || initialData?.status || 'open',
  );

  const [entryPrice, setEntryPrice] = useState(
    v.entryPrice ?? initialData?.entryPrice ?? '',
  );
  const [stopPrice, setStopPrice] = useState(
    v.stopPrice ?? initialData?.stopPrice ?? '',
  );
  const [exitPrice, setExitPrice] = useState(
    v.exitPrice ?? initialData?.exitPrice ?? '',
  );
  const [targetPrice, setTargetPrice] = useState(
    v.targetPrice ?? initialData?.targetPrice ?? '',
  );

  // Carrying costs — optional, default empty. Drives the live net P&L readout.
  const [pnl, setPnl] = useState(v.pnl ?? initialData?.pnl ?? '');
  const [commission, setCommission] = useState(
    v.commission ?? initialData?.commission ?? '',
  );
  const [swap, setSwap] = useState(v.swap ?? initialData?.swap ?? '');
  const [fees, setFees] = useState(v.fees ?? initialData?.fees ?? '');

  const [selectedTags, setSelectedTags] = useState<ReadonlyArray<string>>(
    v.tags ? v.tags.split(',') : (initialData?.tagIds ?? []),
  );

  const [uploadedImages, setUploadedImages] = useState<string[]>(
    initialData?.images || []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (uploadedImages.length + files.length > 3) {
      setUploadError("You can only upload up to 3 screenshots.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      setUploadError("Supabase configuration is missing.");
      setIsUploading(false);
      return;
    }
    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

    const newUrls = [...uploadedImages];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const filePath = `screenshots/${fileName}`;

        const { data, error } = await supabase.storage
          .from('trade-screenshots')
          .upload(filePath, file);

        if (error) throw error;

        if (data) {
          const { data: { publicUrl } } = supabase.storage
            .from('trade-screenshots')
            .getPublicUrl(data.path);
          newUrls.push(publicUrl);
        }
      }
      setUploadedImages(newUrls);
    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadError(error.message || "Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  };

  const rPreview = useMemo(
    () => {
      const exitOrTarget = status === 'open' ? targetPrice : exitPrice;
      return computeRMultiple(
        parseNumber(entryPrice),
        parseNumber(stopPrice),
        parseNumber(exitOrTarget),
        direction,
      );
    },
    [entryPrice, stopPrice, exitPrice, targetPrice, direction, status],
  );

  // Net P&L = gross − commission − swap − fees. Live so the user sees the true
  // realized result as they type the costs in.
  const netPnlPreview = useMemo(
    () =>
      computeNetPnl(
        parseNumber(pnl),
        parseNumber(commission),
        parseNumber(swap),
        parseNumber(fees),
      ),
    [pnl, commission, swap, fees],
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
              defaultValue={v.instrument ?? initialData?.instrument}
              required
              placeholder="AAPL"
              autoComplete="off"
            />
          </Field>
          <Field id="assetClass" label="Asset class" error={state.errors?.assetClass}>
            <Select
              id="assetClass"
              name="assetClass"
              defaultValue={v.assetClass ?? initialData?.assetClass}
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
              defaultValue={v.size ?? initialData?.size}
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
              defaultValue={v.entryPrice ?? initialData?.entryPrice}
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
              defaultValue={v.stopPrice ?? initialData?.stopPrice}
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
              defaultValue={v.targetPrice ?? initialData?.targetPrice}
              placeholder="0.00"
              onChange={(e) => setTargetPrice(e.target.value)}
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
              defaultValue={v.exitPrice ?? initialData?.exitPrice}
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
              defaultValue={v.entryTime ?? initialData?.entryTime}
            />
          </Field>
          <Field id="exitTime" label="Exit time" error={state.errors?.exitTime}>
            <Input
              id="exitTime"
              name="exitTime"
              type="datetime-local"
              defaultValue={v.exitTime ?? initialData?.exitTime}
              required={!exitOptional}
              placeholder={exitOptional ? 'optional' : undefined}
            />
          </Field>
        </div>
      </section>

      {/* P&L + carrying costs — gross P&L is manual entry; commission/swap/fees
          are optional and subtracted to derive net P&L (shown live). */}
      <section className="space-y-4">
        <SectionTitle>Result</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="pnl" label="Gross P&amp;L (account currency)" error={state.errors?.pnl}>
            <Input
              id="pnl"
              name="pnl"
              type="number"
              inputMode="decimal"
              step="any"
              defaultValue={v.pnl ?? initialData?.pnl}
              placeholder={exitOptional ? 'optional' : '0.00'}
              onChange={(e) => setPnl(e.target.value)}
            />
          </Field>
          <Field id="commission" label="Commission" error={state.errors?.commission}>
            <Input
              id="commission"
              name="commission"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.commission ?? initialData?.commission}
              placeholder="0.00"
              onChange={(e) => setCommission(e.target.value)}
            />
          </Field>
          <Field id="swap" label="Swap / financing" error={state.errors?.swap}>
            <Input
              id="swap"
              name="swap"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.swap ?? initialData?.swap}
              placeholder="0.00"
              onChange={(e) => setSwap(e.target.value)}
            />
          </Field>
          <Field id="fees" label="Other fees" error={state.errors?.fees}>
            <Input
              id="fees"
              name="fees"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              defaultValue={v.fees ?? initialData?.fees}
              placeholder="0.00"
              onChange={(e) => setFees(e.target.value)}
            />
          </Field>

          {/* Net P&L readout — computed, not typed. */}
          <div className="space-y-1.5">
            <Label>Net P&amp;L</Label>
            <div
              className={`num flex h-[38px] items-center rounded-card border border-hairline bg-surface-raised px-3 text-sm ${pnlColorClass(
                netPnlPreview,
              )}`}
            >
              {formatPnl(netPnlPreview)}
            </div>
            <p className="text-tertiary text-[10px]">
              Gross P&amp;L minus commission, swap, and fees.
            </p>
          </div>
        </div>
      </section>

      {/* Market Context — Daily, 1h & 30m PD arrays */}
      <section className="space-y-4">
        <SectionTitle>Market Context</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field id="dailyPdArray" label="Daily PD Array" error={state.errors?.dailyPdArray}>
            <Input
              id="dailyPdArray"
              name="dailyPdArray"
              defaultValue={v.dailyPdArray ?? initialData?.dailyPdArray}
              placeholder="e.g. Daily Order Block, Daily FVG"
              autoComplete="off"
            />
          </Field>
          <Field id="oneHourPdArray" label="1 Hr PD Array" error={state.errors?.oneHourPdArray}>
            <Input
              id="oneHourPdArray"
              name="oneHourPdArray"
              defaultValue={v.oneHourPdArray ?? initialData?.oneHourPdArray}
              placeholder="e.g. 1h Breaker, 1h Mitigation Block"
              autoComplete="off"
            />
          </Field>
          <Field id="thirtyMinutePdArray" label="30 Min PD Array" error={state.errors?.thirtyMinutePdArray}>
            <Input
              id="thirtyMinutePdArray"
              name="thirtyMinutePdArray"
              defaultValue={v.thirtyMinutePdArray ?? initialData?.thirtyMinutePdArray}
              placeholder="e.g. 30m FVG, 30m Order Block"
              autoComplete="off"
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

      {/* Screenshots — up to 3 files upload */}
      <section className="space-y-4">
        <SectionTitle>Screenshots (Max 3)</SectionTitle>
        {uploadError && (
          <p className="text-xs text-accent-alert">{uploadError}</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {uploadedImages.map((url, idx) => (
            <div key={url} className="relative group aspect-video border border-hairline bg-surface rounded-card overflow-hidden">
              <img src={url} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setUploadedImages(prev => prev.filter(img => img !== url))}
                className="absolute top-2 right-2 p-1 bg-surface-raised/90 hover:text-loss border border-hairline rounded-card text-secondary transition-colors duration-150"
              >
                <X size={12} />
              </button>
              <input type="hidden" name="images" value={url} />
            </div>
          ))}
          {uploadedImages.length < 3 && (
            <label className={cn(
              "flex flex-col items-center justify-center aspect-video border border-dashed border-hairline rounded-card bg-surface hover:bg-surface-raised cursor-pointer transition-all duration-150 group",
              isUploading && "pointer-events-none opacity-50"
            )}>
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-accent-signal animate-spin" />
              ) : (
                <>
                  <UploadCloud className="w-6 h-6 text-secondary group-hover:text-accent-signal transition-colors duration-150" />
                  <span className="text-[11px] text-tertiary mt-2">Upload screenshot</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={isUploading}
                onChange={handleImageUpload}
              />
            </label>
          )}
        </div>
      </section>

      <div className="border-hairline flex items-center justify-end gap-3 border-t pt-6">
        <Link
          href="/dashboard/trades"
          className="text-secondary hover:text-primary rounded-card px-4 py-2 text-sm transition-colors duration-150"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel={isEdit ? 'Updating…' : 'Saving…'}>
          {isEdit ? 'Update trade' : 'Save trade'}
        </SubmitButton>
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
