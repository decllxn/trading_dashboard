'use client';

import { useMemo, useState, useEffect } from 'react';
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
  calculateTradeRisk,
  formatRisk,
  calculatePositionSize,
  PEPPERSTONE_SPECS,
} from '@/lib/trades';
import { computeNetPnl } from '@/lib/stats';
import type { AssetClass, Direction, Tag, TradeStatus } from '@/db/schema';
import { createBrowserClient } from '@supabase/ssr';
import { cn } from '@/lib/utils';
import { UploadCloud, X, Loader2, Sliders } from 'lucide-react';

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

  const [instrument, setInstrument] = useState(
    v.instrument ?? initialData?.instrument ?? '',
  );
  const [assetClass, setAssetClass] = useState<AssetClass>(
    (v.assetClass as AssetClass) || (initialData?.assetClass as AssetClass) || 'equity',
  );
  const [size, setSize] = useState(
    v.size ?? initialData?.size ?? '',
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

  // Pepperstone CFD Sizing Calculator states
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcBalance, setCalcBalance] = useState('10000');
  const [calcRiskMode, setCalcRiskMode] = useState<'percent' | 'cash'>('percent');
  const [calcRiskValue, setCalcRiskValue] = useState('1.0');
  const [calcExchangeRate, setCalcExchangeRate] = useState('');
  const [calcContractSize, setCalcContractSize] = useState('');
  const [calcLeverage, setCalcLeverage] = useState('30');

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

  const uploadFiles = async (files: FileList | File[]) => {
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
        const fileExt = file.name ? file.name.split('.').pop() : 'png';
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const filesToUpload: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            filesToUpload.push(file);
          }
        }
      }

      if (filesToUpload.length > 0) {
        e.preventDefault();
        uploadFiles(filesToUpload);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedImages]);

  const rPreview = useMemo(
    () => {
      return computeRMultiple(
        parseNumber(entryPrice),
        parseNumber(stopPrice),
        parseNumber(exitPrice),
        direction,
      );
    },
    [entryPrice, stopPrice, exitPrice, direction],
  );

  const riskPreview = useMemo(
    () => {
      return calculateTradeRisk(
        instrument,
        parseNumber(size),
        parseNumber(entryPrice),
        parseNumber(stopPrice),
        assetClass,
      );
    },
    [instrument, size, entryPrice, stopPrice, assetClass],
  );

  const calcResults = useMemo(() => {
    const balance = parseNumber(calcBalance) ?? 10000;
    const riskVal = parseNumber(calcRiskValue) ?? 0;
    const entry = parseNumber(entryPrice);
    const stop = parseNumber(stopPrice);
    const target = parseNumber(targetPrice);

    if (entry == null || stop == null) return null;

    const targetRiskCash = calcRiskMode === 'percent' ? (balance * riskVal) / 100 : riskVal;

    const symbol = instrument.toUpperCase().replace(/[^A-Z0-9/]/g, '');
    const matchedKey = Object.keys(PEPPERSTONE_SPECS).find(key => symbol.includes(key));
    const defaultSpec = matchedKey ? PEPPERSTONE_SPECS[matchedKey] : null;

    const resolvedContractSize = parseNumber(calcContractSize) ?? defaultSpec?.contract_size ?? (assetClass === 'forex' ? 100000 : 1);
    const quoteCurrency = defaultSpec?.quote_currency ?? 'USD';

    let autoRate = 1.0;
    if (quoteCurrency === 'JPY') {
      const jpyRate = symbol.startsWith('USD') ? entry : 155.0;
      autoRate = 1.0 / jpyRate;
    } else if (quoteCurrency === 'GBP') {
      autoRate = 1.30;
    } else if (quoteCurrency === 'EUR') {
      autoRate = 1.10;
    } else if (quoteCurrency === 'AUD') {
      autoRate = 0.66;
    } else if (quoteCurrency === 'CHF') {
      autoRate = 1.0 / 0.90;
    } else if (quoteCurrency === 'CAD') {
      autoRate = 1.0 / 1.35;
    }

    const rate = parseNumber(calcExchangeRate) ?? autoRate;

    const positionSize = calculatePositionSize(
      instrument,
      targetRiskCash,
      entry,
      stop,
      assetClass,
      { contract_size: resolvedContractSize },
      rate
    );

    const actualRisk = calculateTradeRisk(
      instrument,
      positionSize,
      entry,
      stop,
      assetClass,
      { contract_size: resolvedContractSize },
      rate
    );

    const leverage = parseNumber(calcLeverage) ?? 30;
    const margin = positionSize ? (resolvedContractSize * positionSize * entry) / leverage : null;

    const riskDist = Math.abs(entry - stop);
    const rewardDist = target ? Math.abs(target - entry) : 0;
    const rr = riskDist > 0 ? rewardDist / riskDist : null;

    return {
      targetRiskCash,
      positionSize,
      actualRisk,
      margin,
      rr,
      autoRate,
      resolvedContractSize,
      quoteCurrency
    };
  }, [
    calcBalance,
    calcRiskMode,
    calcRiskValue,
    entryPrice,
    stopPrice,
    targetPrice,
    instrument,
    assetClass,
    calcExchangeRate,
    calcContractSize,
    calcLeverage
  ]);

  const applyCalculations = () => {
    if (!calcResults || calcResults.positionSize == null) return;
    setSize(calcResults.positionSize.toString());
  };

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
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              required
              placeholder="AAPL"
              autoComplete="off"
            />
          </Field>
          <Field id="assetClass" label="Asset class" error={state.errors?.assetClass}>
            <Select
              id="assetClass"
              name="assetClass"
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value as AssetClass)}
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
        <div className="flex items-center justify-between border-b border-hairline pb-1.5">
          <h3 className="font-display text-primary text-xs uppercase tracking-wide">
            Levels
          </h3>
          <button
            type="button"
            onClick={() => setShowCalculator(!showCalculator)}
            className="text-accent-signal hover:underline text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 focus:outline-none cursor-pointer"
          >
            <Sliders size={11} />
            {showCalculator ? 'Hide Sizing Helper' : 'Open Sizing Helper'}
          </button>
        </div>

        {showCalculator && (
          <div className="border border-hairline bg-surface rounded-card p-4 space-y-4">
            <h4 className="font-display text-primary text-xs uppercase tracking-wide flex items-center gap-1.5 border-b border-hairline/30 pb-2">
              <Sliders size={13} className="text-accent-signal" />
              Pepperstone CFD Sizing Calculator
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Inputs */}
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Account Balance (USD)
                    </label>
                    <input
                      type="number"
                      value={calcBalance}
                      onChange={(e) => setCalcBalance(e.target.value)}
                      className="num w-full rounded border border-hairline bg-base px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                    />
                  </div>
                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Leverage Override
                    </label>
                    <input
                      type="number"
                      value={calcLeverage}
                      onChange={(e) => setCalcLeverage(e.target.value)}
                      className="num w-full rounded border border-hairline bg-base px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Risk Target Mode
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-base p-0.5 rounded border border-hairline">
                      <button
                        type="button"
                        onClick={() => setCalcRiskMode('percent')}
                        className={cn(
                          "py-1 text-[9px] font-semibold uppercase rounded transition-colors cursor-pointer",
                          calcRiskMode === 'percent' ? "bg-surface border border-hairline text-accent-signal" : "text-secondary hover:text-primary"
                        )}
                      >
                        Percent (%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalcRiskMode('cash')}
                        className={cn(
                          "py-1 text-[9px] font-semibold uppercase rounded transition-colors cursor-pointer",
                          calcRiskMode === 'cash' ? "bg-surface border border-hairline text-accent-signal" : "text-secondary hover:text-primary"
                        )}
                      >
                        Cash ($)
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                      Risk Amount ({calcRiskMode === 'percent' ? '%' : '$'})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={calcRiskValue}
                      onChange={(e) => setCalcRiskValue(e.target.value)}
                      className="num w-full rounded border border-hairline bg-base px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                    />
                  </div>
                </div>

                {/* Advanced specifications overrides */}
                <div className="border-t border-hairline/30 pt-3 space-y-3">
                  <span className="text-tertiary text-[10px] uppercase tracking-wider font-semibold block">
                    Advanced Contract Specification Overrides
                  </span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                        Exchange Rate Override
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder={calcResults ? `Auto: ${calcResults.autoRate.toFixed(4)}` : '1.0'}
                        value={calcExchangeRate}
                        onChange={(e) => setCalcExchangeRate(e.target.value)}
                        className="num w-full rounded border border-hairline bg-base px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      />
                    </div>
                    <div>
                      <label className="text-secondary block text-[10px] uppercase tracking-wide mb-1 font-display">
                        Contract Size Override
                      </label>
                      <input
                        type="number"
                        placeholder={calcResults ? `Default: ${calcResults.resolvedContractSize.toLocaleString()}` : '1'}
                        value={calcContractSize}
                        onChange={(e) => setCalcContractSize(e.target.value)}
                        className="num w-full rounded border border-hairline bg-base px-2.5 py-1.5 text-xs text-primary outline-none focus:border-accent-signal"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Outputs */}
              <div className="flex flex-col justify-between border-l border-hairline/30 pl-6 space-y-4">
                <div className="space-y-3">
                  <span className="text-tertiary text-[10px] uppercase tracking-wide font-semibold block">
                    Calculated Trade Metrics
                  </span>
                  
                  {calcResults ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-secondary block text-[10px]">Target Position Size</span>
                        <span className="num text-accent-signal text-lg font-bold">
                          {calcResults.positionSize != null ? `${calcResults.positionSize.toFixed(2)} Lots` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary block text-[10px]">Actual Cash Risked</span>
                        <span className="num text-primary text-base font-semibold block mt-0.5">
                          {calcResults.actualRisk != null ? `$${calcResults.actualRisk.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary block text-[10px]">Required Margin</span>
                        <span className="num text-primary text-sm block mt-0.5">
                          {calcResults.margin != null ? `$${calcResults.margin.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-secondary block text-[10px]">Expected R:R Ratio</span>
                        <span className="num text-primary text-sm block mt-0.5">
                          {calcResults.rr != null ? `${calcResults.rr.toFixed(2)}R` : '—'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-tertiary text-xs italic">
                      Please enter Entry Price and Stop Loss below to see calculation outputs.
                    </p>
                  )}
                </div>

                {calcResults && calcResults.positionSize != null && (
                  <button
                    type="button"
                    onClick={applyCalculations}
                    className="w-full bg-accent-signal hover:bg-accent-signal/90 text-base font-semibold text-xs py-2 rounded transition-colors cursor-pointer mt-4"
                  >
                    Apply Sizing to Form
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="size" label="Size" error={state.errors?.size}>
            <Input
              id="size"
              name="size"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={size}
              onChange={(e) => setSize(e.target.value)}
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

          {/* Calculated Risk readout — computed, not typed. */}
          <div className="space-y-1.5">
            <Label>Calculated Risk</Label>
            <div
              className="num flex h-[38px] items-center rounded-card border border-hairline bg-surface-raised px-3 text-sm text-accent-signal"
            >
              {formatRisk(riskPreview)}
            </div>
            <p className="text-tertiary text-[10px]">
              Pepperstone CFD model contract size risk.
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

      <div className="sticky bottom-0 z-20 border-hairline flex items-center justify-end gap-3 border-t bg-surface p-4 rounded-card shrink-0">
        <Link
          href="/dashboard/trades"
          className="text-secondary hover:text-primary rounded-card px-4 py-2 text-xs font-medium transition-colors duration-150 min-h-[44px] flex items-center justify-center border border-hairline bg-base"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel={isEdit ? 'Updating…' : 'Saving…'} className="min-h-[44px]">
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
