'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  computeRMultiple,
  parseDateTimeLocal,
  parseNumber,
} from '@/lib/trades';
import type { AssetClass, Direction, TradeStatus, ChartAnnotation } from '@/db/schema';

/**
 * Form-state shape returned to the client via useFormState. `errors` is a
 * per-field map so the form can paint a message under the offending input
 * (matching how Field renders its `error` prop). `values` echoes the submitted
 * values back so the form stays populated on validation failure.
 */
export interface TradeFormState {
  errors?: Partial<Record<TradeField, string>>;
  values?: Partial<Record<TradeField, string>>;
  /** Top-level error not tied to a single field (e.g. auth, DB down). */
  formError?: string;
}

/** All keys the trade form can submit, used to type the state maps. */
type TradeField =
  | 'instrument'
  | 'assetClass'
  | 'direction'
  | 'entryPrice'
  | 'exitPrice'
  | 'size'
  | 'stopPrice'
  | 'targetPrice'
  | 'entryTime'
  | 'exitTime'
  | 'pnl'
  | 'commission'
  | 'swap'
  | 'fees'
  | 'status'
  | 'tags'
  | 'dailyPdArray'
  | 'oneHourPdArray'
  | 'thirtyMinutePdArray'
  | 'images';

const ASSET_CLASSES: ReadonlyArray<AssetClass> = [
  'equity',
  'forex',
  'futures',
  'crypto',
  'option',
];
const DIRECTIONS: ReadonlyArray<Direction> = ['long', 'short'];
const STATUSES: ReadonlyArray<TradeStatus> = ['open', 'closed'];

function isOneOf<T extends string>(
  value: string,
  allowed: ReadonlyArray<T>,
): value is T {
  return (allowed as ReadonlyArray<string>).includes(value);
}

function validateTrade(formData: FormData) {
  const errors: Partial<Record<TradeField, string>> = {};
  const values: Partial<Record<TradeField, string>> = {};

  const instrument = String(formData.get('instrument') ?? '').trim();
  values.instrument = instrument;
  if (instrument === '') errors.instrument = 'Instrument is required.';

  const assetClassRaw = String(formData.get('assetClass') ?? '').trim();
  values.assetClass = assetClassRaw;
  if (!isOneOf(assetClassRaw, ASSET_CLASSES)) errors.assetClass = 'Select an asset class.';

  const directionRaw = String(formData.get('direction') ?? '').trim();
  values.direction = directionRaw;
  if (!isOneOf(directionRaw, DIRECTIONS)) errors.direction = 'Select a direction.';

  const statusRaw = String(formData.get('status') ?? 'open').trim();
  const status = isOneOf(statusRaw, STATUSES) ? statusRaw : 'open';
  values.status = status;

  const entryPrice = parseNumber(String(formData.get('entryPrice') ?? ''));
  values.entryPrice = String(formData.get('entryPrice') ?? '');
  if (entryPrice == null) errors.entryPrice = 'Entry price is required.';
  else if (entryPrice <= 0) errors.entryPrice = 'Entry price must be greater than zero.';

  const size = parseNumber(String(formData.get('size') ?? ''));
  values.size = String(formData.get('size') ?? '');
  if (size == null) errors.size = 'Size is required.';
  else if (size <= 0) errors.size = 'Size must be greater than zero.';

  const stopPrice = parseNumber(String(formData.get('stopPrice') ?? ''));
  values.stopPrice = String(formData.get('stopPrice') ?? '');
  const targetPrice = parseNumber(String(formData.get('targetPrice') ?? ''));
  values.targetPrice = String(formData.get('targetPrice') ?? '');
  const exitPrice = parseNumber(String(formData.get('exitPrice') ?? ''));
  values.exitPrice = String(formData.get('exitPrice') ?? '');
  const exitTime = parseDateTimeLocal(String(formData.get('exitTime') ?? ''));
  values.exitTime = String(formData.get('exitTime') ?? '');
  const pnl = parseNumber(String(formData.get('pnl') ?? ''));
  values.pnl = String(formData.get('pnl') ?? '');
  const commission = parseNumber(String(formData.get('commission') ?? ''));
  values.commission = String(formData.get('commission') ?? '');
  const swap = parseNumber(String(formData.get('swap') ?? ''));
  values.swap = String(formData.get('swap') ?? '');
  const fees = parseNumber(String(formData.get('fees') ?? ''));
  values.fees = String(formData.get('fees') ?? '');
  const entryTime = parseDateTimeLocal(String(formData.get('entryTime') ?? ''));
  values.entryTime = String(formData.get('entryTime') ?? '');

  const dailyPdArray = String(formData.get('dailyPdArray') ?? '').trim();
  values.dailyPdArray = dailyPdArray;

  const oneHourPdArray = String(formData.get('oneHourPdArray') ?? '').trim();
  values.oneHourPdArray = oneHourPdArray;

  const thirtyMinutePdArray = String(formData.get('thirtyMinutePdArray') ?? '').trim();
  values.thirtyMinutePdArray = thirtyMinutePdArray;

  const images = formData.getAll('images').map((img) => String(img).trim()).filter(Boolean);
  values.images = images.join(',');

  if (status === 'closed') {
    if (exitPrice == null) errors.exitPrice = 'Exit price is required for a closed trade.';
    if (exitTime == null) errors.exitTime = 'Exit time is required for a closed trade.';
  }

  // Costs are optional but, when provided, must be non-negative magnitudes.
  if (commission != null && commission < 0) errors.commission = 'Commission must be zero or positive.';
  if (swap != null && swap < 0) errors.swap = 'Swap must be zero or positive.';
  if (fees != null && fees < 0) errors.fees = 'Fees must be zero or positive.';

  return {
    errors,
    values,
    data: {
      instrument,
      assetClass: assetClassRaw as AssetClass,
      direction: directionRaw as Direction,
      status,
      entryPrice,
      size,
      stopPrice,
      targetPrice,
      exitPrice,
      exitTime,
      pnl,
      commission,
      swap,
      fees,
      entryTime,
      dailyPdArray,
      oneHourPdArray,
      thirtyMinutePdArray,
      images,
      tagIds: Array.from(new Set(formData.getAll('tags').map((t) => String(t)))),
    },
  };
}

/**
 * Create a trade (and its trade_tags links) from form data.
 */
export async function createTrade(
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  if (!isSupabaseConfigured()) return { formError: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { formError: 'Database client unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { formError: 'You must be signed in to log a trade.' };

  const { errors, values, data } = validateTrade(formData);
  if (Object.keys(errors).length > 0) return { errors, values };

  const rMultiple = computeRMultiple(data.entryPrice!, data.stopPrice, data.exitPrice, data.direction);

  const { data: tradeRow, error: tradeError } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      instrument: data.instrument,
      asset_class: data.assetClass,
      direction: data.direction,
      status: data.status,
      source: 'manual',
      entry_price: data.entryPrice?.toString() ?? null,
      exit_price: data.exitPrice?.toString() ?? null,
      size: data.size?.toString() ?? null,
      stop_price: data.stopPrice?.toString() ?? null,
      target_price: data.targetPrice?.toString() ?? null,
      entry_time: data.entryTime,
      exit_time: data.exitTime,
      pnl: data.pnl?.toString() ?? null,
      commission: data.commission?.toString() ?? null,
      swap: data.swap?.toString() ?? null,
      fees: data.fees?.toString() ?? null,
      r_multiple: rMultiple != null ? String(rMultiple) : null,
      daily_pd_array: data.dailyPdArray || null,
      one_hour_pd_array: data.oneHourPdArray || null,
      thirty_minute_pd_array: data.thirtyMinutePdArray || null,
      images: data.images,
    })
    .select('id')
    .single();

  if (tradeError || !tradeRow) return { values, formError: tradeError?.message ?? 'Failed to save the trade.' };

  if (data.tagIds.length > 0) {
    const { data: ownedTags } = await supabase.from('tags').select('id').eq('user_id', user.id).in('id', data.tagIds);
    const ownedIds = (ownedTags ?? []).map((t) => t.id);
    if (ownedIds.length > 0) {
      await supabase.from('trade_tags').insert(ownedIds.map((tagId) => ({ trade_id: tradeRow.id, tag_id: tagId })));
    }
  }

  revalidatePath('/dashboard/trades');
  redirect('/dashboard/trades');
}

export async function updateTrade(
  tradeId: string,
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  if (!isSupabaseConfigured()) return { formError: 'Supabase is not configured.' };
  const supabase = createServerClient();
  if (!supabase) return { formError: 'Database client unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { formError: 'You must be signed in to update a trade.' };

  const { errors, values, data } = validateTrade(formData);
  if (Object.keys(errors).length > 0) return { errors, values };

  const rMultiple = computeRMultiple(data.entryPrice!, data.stopPrice, data.exitPrice, data.direction);

  console.log(`[updateTrade] Updating trade ID: ${tradeId} for user: ${user.id}`);
  console.log('[updateTrade] Data submitted:', JSON.stringify(data, null, 2));

  const { data: updatedRows, error: tradeError } = await supabase
    .from('trades')
    .update({
      instrument: data.instrument,
      asset_class: data.assetClass,
      direction: data.direction,
      status: data.status,
      entry_price: data.entryPrice?.toString() ?? null,
      exit_price: data.exitPrice?.toString() ?? null,
      size: data.size?.toString() ?? null,
      stop_price: data.stopPrice?.toString() ?? null,
      target_price: data.targetPrice?.toString() ?? null,
      entry_time: data.entryTime,
      exit_time: data.exitTime,
      pnl: data.pnl?.toString() ?? null,
      commission: data.commission?.toString() ?? null,
      swap: data.swap?.toString() ?? null,
      fees: data.fees?.toString() ?? null,
      r_multiple: rMultiple != null ? String(rMultiple) : null,
      daily_pd_array: data.dailyPdArray || null,
      one_hour_pd_array: data.oneHourPdArray || null,
      thirty_minute_pd_array: data.thirtyMinutePdArray || null,
      images: data.images,
    })
    .eq('id', tradeId)
    .select();

  if (tradeError) {
    console.error('[updateTrade] Error updating trade row:', tradeError.message);
    return { values, formError: tradeError.message };
  }

  if (!updatedRows || updatedRows.length === 0) {
    console.error('[updateTrade] No rows updated! RLS block or trade ID not found.');
    return { values, formError: 'Failed to update trade: trade not found or access denied.' };
  }

  console.log('[updateTrade] Successfully updated trade row:', JSON.stringify(updatedRows[0], null, 2));

  // Sync tags: delete existing links, fetch owned tags, insert new ones
  const { error: deleteTagsError } = await supabase
    .from('trade_tags')
    .delete()
    .eq('trade_id', tradeId);

  if (deleteTagsError) {
    console.error('[updateTrade] Error deleting trade tags:', deleteTagsError.message);
    return { values, formError: deleteTagsError.message };
  }

  if (data.tagIds.length > 0) {
    const { data: ownedTags, error: tagsFetchError } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', user.id)
      .in('id', data.tagIds);

    if (tagsFetchError) {
      console.error('[updateTrade] Error fetching owned tags:', tagsFetchError.message);
      return { values, formError: tagsFetchError.message };
    }

    const ownedIds = (ownedTags ?? []).map((t) => t.id);
    if (ownedIds.length > 0) {
      const { error: insertTagsError } = await supabase
        .from('trade_tags')
        .insert(ownedIds.map((tagId) => ({ trade_id: tradeId, tag_id: tagId })));

      if (insertTagsError) {
        console.error('[updateTrade] Error inserting new trade tags:', insertTagsError.message);
        return { values, formError: insertTagsError.message };
      }
    }
  }

  console.log('[updateTrade] Tags updated successfully.');

  revalidatePath('/dashboard/trades');
  redirect('/dashboard/trades');
}

export async function deleteTrade(tradeId: string): Promise<{ error?: string }> {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Database client unavailable.' };
  const { error } = await supabase.from('trades').delete().eq('id', tradeId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/trades');
  return {};
}

export async function saveTradeAnnotations(tradeId: string, annotations: ChartAnnotation[]): Promise<{ error?: string }> {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Database client unavailable.' };
  
  const { error } = await supabase
    .from('trades')
    .update({ annotations: annotations as any })
    .eq('id', tradeId);
    
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/trades/${tradeId}`);
  return {};
}

export async function toggleSessionBands(enabled: boolean): Promise<{ error?: string }> {
  const supabase = createServerClient();
  if (!supabase) return { error: 'Database client unavailable.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: user.id,
      chart_sessions_enabled: enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) return { error: error.message };
  revalidatePath('/dashboard');
  return {};
}
