'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  computeRMultiple,
  parseDateTimeLocal,
  parseNumber,
} from '@/lib/trades';
import type { AssetClass, Direction, TradeStatus } from '@/db/schema';

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
  | 'status'
  | 'tags';

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

/**
 * Create a trade (and its trade_tags links) from form data.
 *
 * Validation rules (Phase 3a):
 *  - instrument, asset_class, direction are required.
 *  - exit fields (exit_price, exit_time, pnl) are OPTIONAL when status=open.
 *  - r_multiple is NEVER user-typed — it is computed here from
 *    entry/stop/exit when all three are present, and ignored otherwise.
 *  - tag ids are filtered against the user's own tags (defense in depth; RLS
 *    on trade_tags would reject foreign tags anyway, but this avoids a noisy
 *    partial-insert).
 *
 * Inserts run through the Supabase server client (user-scoped by RLS), not the
 * service-role Drizzle client, so the row is owned by auth.uid() by
 * construction. A Postgres array+join insert would be one round trip, but
 * doing trade then trade_tags as two steps keeps the logic readable and lets
 * us roll back the trade insert if the tag linking fails for any reason.
 */
export async function createTrade(
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  if (!isSupabaseConfigured()) {
    return { formError: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { formError: 'Database client unavailable.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { formError: 'You must be signed in to log a trade.' };
  }

  const errors: Partial<Record<TradeField, string>> = {};
  const values: Partial<Record<TradeField, string>> = {};

  // --- Required text/enum fields ---
  const instrument = String(formData.get('instrument') ?? '').trim();
  values.instrument = instrument;
  if (instrument === '') {
    errors.instrument = 'Instrument is required.';
  }

  const assetClassRaw = String(formData.get('assetClass') ?? '').trim();
  values.assetClass = assetClassRaw;
  if (!isOneOf(assetClassRaw, ASSET_CLASSES)) {
    errors.assetClass = 'Select an asset class.';
  }

  const directionRaw = String(formData.get('direction') ?? '').trim();
  values.direction = directionRaw;
  if (!isOneOf(directionRaw, DIRECTIONS)) {
    errors.direction = 'Select a direction.';
  }

  const statusRaw = String(formData.get('status') ?? 'open').trim();
  const status: TradeStatus = isOneOf(statusRaw, STATUSES) ? statusRaw : 'open';
  values.status = status;

  // --- Numeric fields (strings in, decimals out) ---
  const entryPrice = parseNumber(String(formData.get('entryPrice') ?? ''));
  values.entryPrice = String(formData.get('entryPrice') ?? '');
  if (entryPrice == null) {
    errors.entryPrice = 'Entry price is required.';
  } else if (entryPrice <= 0) {
    errors.entryPrice = 'Entry price must be greater than zero.';
  }

  const size = parseNumber(String(formData.get('size') ?? ''));
  values.size = String(formData.get('size') ?? '');
  if (size == null) {
    errors.size = 'Size is required.';
  } else if (size <= 0) {
    errors.size = 'Size must be greater than zero.';
  }

  const stopPrice = parseNumber(String(formData.get('stopPrice') ?? ''));
  values.stopPrice = String(formData.get('stopPrice') ?? '');

  const targetPrice = parseNumber(String(formData.get('targetPrice') ?? ''));
  values.targetPrice = String(formData.get('targetPrice') ?? '');

  // --- Exit fields — optional when status=open (Phase 3a validation rule) ---
  const exitPrice = parseNumber(String(formData.get('exitPrice') ?? ''));
  values.exitPrice = String(formData.get('exitPrice') ?? '');
  const exitTime = parseDateTimeLocal(String(formData.get('exitTime') ?? ''));
  values.exitTime = String(formData.get('exitTime') ?? '');
  const pnl = parseNumber(String(formData.get('pnl') ?? ''));
  values.pnl = String(formData.get('pnl') ?? '');

  if (status === 'closed') {
    if (exitPrice == null) errors.exitPrice = 'Exit price is required for a closed trade.';
    if (exitTime == null) errors.exitTime = 'Exit time is required for a closed trade.';
  }

  const entryTime = parseDateTimeLocal(String(formData.get('entryTime') ?? ''));
  values.entryTime = String(formData.get('entryTime') ?? '');

  if (Object.keys(errors).length > 0) {
    return { errors, values };
  }

  // --- R-multiple: computed, never user-typed ---
  // directionRaw was validated by isOneOf above; the early return on errors
  // guarantees we only reach here with a valid Direction, so the cast is safe.
  const rMultiple = computeRMultiple(
    entryPrice,
    stopPrice,
    exitPrice,
    directionRaw as Direction,
  );

  // --- Tag ids: dedup + filter to the user's own tags ---
  const tagIds = Array.from(
    new Set(formData.getAll('tags').map((t) => String(t))),
  );
  values.tags = tagIds.join(',');

  // --- Insert trade (RLS-owned via the user's server session) ---
  const { data: tradeRow, error: tradeError } = await supabase
    .from('trades')
    .insert({
      user_id: user.id,
      instrument,
      asset_class: assetClassRaw,
      direction: directionRaw,
      status,
      source: 'manual',
      entry_price: entryPrice != null ? String(entryPrice) : null,
      exit_price: exitPrice != null ? String(exitPrice) : null,
      size: size != null ? String(size) : null,
      stop_price: stopPrice != null ? String(stopPrice) : null,
      target_price: targetPrice != null ? String(targetPrice) : null,
      entry_time: entryTime,
      exit_time: exitTime,
      pnl: pnl != null ? String(pnl) : null,
      r_multiple: rMultiple != null ? String(rMultiple) : null,
    })
    .select('id')
    .single();

  if (tradeError || !tradeRow) {
    return {
      values,
      formError: tradeError?.message ?? 'Failed to save the trade.',
    };
  }

  // --- Link tags (skip silently if none selected) ---
  if (tagIds.length > 0) {
    // Filter to tags this user actually owns — foreign ids are dropped instead
    // of 403-ing the whole insert. RLS on trade_tags enforces this server-side
    // regardless, so this is defense in depth + a cleaner error path.
    const { data: ownedTags } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', user.id)
      .in('id', tagIds);

    const ownedIds = (ownedTags ?? []).map((t) => t.id);
    if (ownedIds.length > 0) {
      const links = ownedIds.map((tagId) => ({
        trade_id: tradeRow.id,
        tag_id: tagId,
      }));
      const { error: linkError } = await supabase
        .from('trade_tags')
        .insert(links);
      if (linkError) {
        // Trade was created; the missing tag links are recoverable from the
        // detail page later. Surface a note rather than failing the whole op.
        return {
          values,
          formError: `Trade saved, but tag linking failed: ${linkError.message}`,
        };
      }
    }
  }

  // revalidatePath refreshes the list server-render cache; redirect navigates
  // back so the new row is visible without a manual reload.
  revalidatePath('/dashboard/trades');
  redirect('/dashboard/trades');
}
