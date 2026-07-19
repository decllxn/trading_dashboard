'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useFormState } from 'react-dom';
import { Field, Input, Label, Select } from '@/components/field';
import { Segmented } from '@/components/segmented';
import { SubmitButton } from '@/components/submit-button';
import { createBestTrade, type BestTradeFormState } from '@/app/dashboard/best-trades/actions';
import { createBrowserClient } from '@supabase/ssr';
import { UploadCloud, X, Loader2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradeOption {
  id: string;
  instrument: string;
  entryTime: string | null;
  pnl: string | null;
  rMultiple: string | null;
}

interface BestTradeFormProps {
  tradesList: ReadonlyArray<TradeOption>;
  onSuccess: () => void;
}

export function BestTradeForm({ tradesList, onSuccess }: BestTradeFormProps) {
  const [state, formAction] = useFormState<BestTradeFormState, FormData>(
    async (prevState, formData) => {
      // Append images JSON array to form data
      formData.append('images', JSON.stringify(uploadedImages));
      formData.append('wasTaken', String(wasTaken === 'yes'));
      const res = await createBestTrade(prevState, formData);
      if (res && !res.errors && !res.formError) {
        onSuccess();
      }
      return res;
    },
    {}
  );

  const [wasTaken, setWasTaken] = useState<'yes' | 'no'>('no');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  );

  const uploadFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    setUploadError('');

    try {
      const newUrls: string[] = [...uploadedImages];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name ? file.name.split('.').pop() : 'png';
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `best-trades/${fileName}`;

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
      console.error('Upload error:', error);
      setUploadError(error.message || 'Failed to upload image.');
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

  const removeImage = (indexToRemove: number) => {
    setUploadedImages(uploadedImages.filter((_, idx) => idx !== indexToRemove));
  };

  const sortedTrades = useMemo(() => {
    return [...tradesList].sort((a, b) => {
      const timeA = a.entryTime ? new Date(a.entryTime).getTime() : 0;
      const timeB = b.entryTime ? new Date(b.entryTime).getTime() : 0;
      return timeB - timeA;
    });
  }, [tradesList]);

  return (
    <form action={formAction} className="space-y-5">
      {state.formError && (
        <p className="rounded-card border border-loss/20 bg-loss/10 p-3 text-xs text-loss">
          {state.formError}
        </p>
      )}

      {/* Identity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="instrument" label="Instrument" error={state.errors?.instrument}>
          <Input
            id="instrument"
            name="instrument"
            defaultValue={state.values?.instrument}
            required
            placeholder="e.g. XAUUSD"
            autoComplete="off"
          />
        </Field>

        <Field id="timeFormed" label="Time formed" error={state.errors?.timeFormed}>
          <Input
            id="timeFormed"
            name="timeFormed"
            type="datetime-local"
            defaultValue={state.values?.timeFormed}
            required
          />
        </Field>
      </div>

      {/* PD Arrays */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="dailyPdArray" label="Daily PD Array" error={state.errors?.dailyPdArray}>
          <Input
            id="dailyPdArray"
            name="dailyPdArray"
            placeholder="e.g. 1D FVG, Daily OB"
            defaultValue={state.values?.dailyPdArray}
            autoComplete="off"
          />
        </Field>

        <Field id="hourlyPdArray" label="Hourly / 30m PD Array" error={state.errors?.hourlyPdArray}>
          <Input
            id="hourlyPdArray"
            name="hourlyPdArray"
            placeholder="e.g. 1H OB, 30m FVG"
            defaultValue={state.values?.hourlyPdArray}
            autoComplete="off"
          />
        </Field>
      </div>

      {/* Was Taken Option */}
      <div className="space-y-4 rounded-card border border-hairline bg-base p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-display text-xs font-semibold text-primary uppercase tracking-wider block">
              Did you take this trade?
            </span>
            <span className="text-[10px] text-secondary mt-0.5 block leading-normal">
              Archive as a model setup or link it to a trade execution you recorded.
            </span>
          </div>
          <Segmented<'yes' | 'no'>
            name="wasTakenToggle"
            aria-label="Was Taken"
            options={[
              { label: 'Taken', value: 'yes' },
              { label: 'Model Only', value: 'no' },
            ]}
            value={wasTaken}
            onChange={setWasTaken}
          />
        </div>

        {wasTaken === 'yes' && (
          <div className="grid grid-cols-1 gap-4 pt-3 border-t border-hairline/50 sm:grid-cols-2">
            <Field id="linkedTradeId" label="Link to Trade Log Entry">
              <Select id="linkedTradeId" name="linkedTradeId" defaultValue={state.values?.linkedTradeId || ''}>
                <option value="">-- Select Recorded Trade --</option>
                {sortedTrades.map((t) => {
                  const dateStr = t.entryTime ? new Date(t.entryTime).toLocaleDateString() : 'No Date';
                  const pnlStr = t.pnl ? (Number(t.pnl) >= 0 ? `+$${t.pnl}` : `-$${Math.abs(Number(t.pnl))}`) : 'No P&L';
                  const rStr = t.rMultiple ? `${t.rMultiple}R` : 'No R';
                  return (
                    <option key={t.id} value={t.id}>
                      {t.instrument} - {dateStr} ({pnlStr} / {rStr})
                    </option>
                  );
                })}
              </Select>
            </Field>

            <Field id="rMultiple" label="R Multiple (Manual)" error={state.errors?.rMultiple}>
              <Input
                id="rMultiple"
                name="rMultiple"
                type="number"
                step="0.01"
                placeholder="e.g. 2.50"
                defaultValue={state.values?.rMultiple}
                className="font-mono"
              />
            </Field>
          </div>
        )}
      </div>

      {/* Notes */}
      <Field id="notes" label="Setup Notes & Analysis" error={state.errors?.notes}>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Describe how the setup formed, key liquidity pools swept, confirmations on lower timeframes, etc."
          defaultValue={state.values?.notes}
          className="w-full bg-base border border-hairline focus:border-accent-signal rounded px-3 py-2 text-xs text-primary outline-none transition-colors"
        />
      </Field>

      {/* Screenshot Upload */}
      <div className="space-y-2">
        <Label id="images-label">Chart Screenshots</Label>
        <div className="flex flex-wrap gap-3">
          {uploadedImages.map((url, idx) => (
            <div key={url} className="relative h-20 w-28 rounded border border-hairline bg-base overflow-hidden group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Screenshot ${idx + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute right-1 top-1 bg-base/80 border border-hairline rounded-sm p-0.5 text-secondary hover:text-primary transition-colors cursor-pointer"
              >
                <X size={10} />
              </button>
            </div>
          ))}

          <label className={cn(
            "flex flex-col items-center justify-center h-20 w-28 rounded border border-dashed border-hairline hover:border-accent-signal/50 bg-base transition-colors cursor-pointer text-tertiary hover:text-secondary",
            isUploading && "pointer-events-none opacity-60"
          )}>
            {isUploading ? (
              <Loader2 size={16} className="animate-spin text-accent-signal" />
            ) : (
              <>
                <UploadCloud size={16} />
                <span className="text-[9px] mt-1 uppercase font-semibold tracking-wider font-display">Upload</span>
              </>
            )}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
              disabled={isUploading}
            />
          </label>
        </div>
        {uploadError && <p className="text-[10px] text-loss mt-1">{uploadError}</p>}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-4 border-t border-hairline/40">
        <SubmitButton pendingLabel="Saving...">Save Best Trade</SubmitButton>
      </div>
    </form>
  );
}
