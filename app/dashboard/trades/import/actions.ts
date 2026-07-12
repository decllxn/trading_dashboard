'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { computeRMultiple } from '@/lib/trades';
import {
  buildTradesFromCsv,
  type ColumnMapping,
  type ImportDefaults,
} from '@/lib/csv-mapping';
import type { ParsedCsv } from '@/lib/csv';
import type { Direction } from '@/db/schema';

/**
 * Payload sent from the client mapping UI. The parsed CSV travels back over
 * the wire because the server action is the trust boundary: it re-validates
 * the build (rows can be skipped) and owns the insert. Sending only the built
 * trades would let a malicious client bypass skip rules; sending the parsed
 * grid + mapping means the server reconstructs the build from scratch.
 */
export interface ImportCsvPayload {
  brokerName: string;
  parsed: ParsedCsv;
  mapping: ColumnMapping;
  defaults: ImportDefaults;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  /** First few skip reasons, for the inline summary. */
  skipSample: ReadonlyArray<{ rowIndex: number; reason: string; detail: string }>;
  /** True when a saved mapping was written/refreshed for this broker. */
  mappingSaved: boolean;
  error?: string;
}

/**
 * Import a parsed + mapped CSV: build typed trade rows, bulk-insert them with
 * `source: 'csv'`, and upsert the (user, broker) mapping so the next import
 * from the same broker auto-applies. Dedup (4c) is not yet applied — re-
 * importing the same file will create duplicates; that's the explicit next
 * phase.
 *
 * Returns a structured result instead of redirecting so the UI can show the
 * "N imported / M skipped" summary inline.
 */
export async function importCsvTrades(
  payload: ImportCsvPayload,
): Promise<ImportResult> {
  if (!isSupabaseConfigured()) {
    return { inserted: 0, skipped: 0, skipSample: [], mappingSaved: false, error: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { inserted: 0, skipped: 0, skipSample: [], mappingSaved: false, error: 'Database client unavailable.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { inserted: 0, skipped: 0, skipSample: [], mappingSaved: false, error: 'You must be signed in to import trades.' };
  }

  const { trades, skipped } = buildTradesFromCsv(
    payload.parsed,
    payload.mapping,
    payload.defaults,
  );

  if (trades.length > 0) {
    const rows = trades.map((t) => ({
      user_id: user.id,
      instrument: t.instrument,
      asset_class: t.assetClass,
      direction: t.direction,
      status: t.status,
      source: 'csv',
      entry_price: numOrNull(t.entryPrice),
      exit_price: numOrNull(t.exitPrice),
      size: numOrNull(t.size),
      stop_price: numOrNull(t.stopPrice),
      target_price: numOrNull(t.targetPrice),
      entry_time: t.entryTime,
      exit_time: t.exitTime,
      pnl: numOrNull(t.pnl),
      r_multiple: rMultipleOrNull(t),
    }));

    const { error: insertError } = await supabase
      .from('trades')
      .insert(rows);

    if (insertError) {
      return {
        inserted: 0,
        skipped: skipped.length,
        skipSample: sample(skipped),
        mappingSaved: false,
        error: insertError.message,
      };
    }
  }

  // Persist the (user, broker) mapping so re-imports auto-apply. ON CONFLICT
  // (user_id, broker_name) DO UPDATE is what makes a re-import refresh the
  // saved mapping in place instead of stacking duplicate rows.
  let mappingSaved = false;
  const trimmedBroker = payload.brokerName.trim();
  if (trimmedBroker !== '') {
    const { error: upsertError } = await supabase
      .from('csv_mappings')
      .upsert(
        {
          user_id: user.id,
          broker_name: trimmedBroker,
          mapping: payload.mapping as Record<string, string>,
        },
        { onConflict: 'user_id,broker_name' },
      );
    mappingSaved = !upsertError;
  }

  revalidatePath('/dashboard/trades');

  return {
    inserted: trades.length,
    skipped: skipped.length,
    skipSample: sample(skipped),
    mappingSaved,
  };
}

/** Decimal columns are sent as strings (Postgres numeric wire format). */
function numOrNull(value: number | null): string | null {
  return value == null ? null : String(value);
}

/**
 * Recompute R from the built row. The CSV source may have shipped its own R,
 * but we ignore it and compute from entry/stop/exit + direction so the value
 * is consistent with the manual trade entry path.
 */
function rMultipleOrNull(t: {
  entryPrice: number | null;
  stopPrice: number | null;
  exitPrice: number | null;
  direction: Direction;
}): string | null {
  const r = computeRMultiple(t.entryPrice, t.stopPrice, t.exitPrice, t.direction);
  return r == null ? null : String(r);
}

/** First few skip rows for the inline summary (don't ship the whole list). */
function sample(
  skipped: ReadonlyArray<{ rowIndex: number; reason: string; detail: string }>,
): ReadonlyArray<{ rowIndex: number; reason: string; detail: string }> {
  return skipped.slice(0, 5);
}

// =============================================================================
// Saved-mapping read helpers (server components + client autocomplete).
// =============================================================================

export interface BrokerMappingSummary {
  brokerName: string;
  mapping: ColumnMapping;
  updatedAt: string;
}

/**
 * List the signed-in user's saved broker mappings. Used by the import page to
 * preload mappings for auto-apply and broker-name autocomplete. Returns an
 * empty list when Supabase isn't configured or the user is signed out.
 */
export async function listBrokerMappings(): Promise<BrokerMappingSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServerClient();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('csv_mappings')
    .select('broker_name, mapping, updated_at')
    .eq('user_id', user.id)
    .order('broker_name');

  return ((data ?? []) as Array<{
    broker_name: string;
    mapping: Record<string, string>;
    updated_at: string;
  }>).map((row) => ({
    brokerName: row.broker_name,
    mapping: row.mapping as ColumnMapping,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get the signed-in user's mapping for a single broker name, or null. Used to
 * auto-apply a saved mapping when the user types/selects a known broker.
 */
export async function getBrokerMapping(
  brokerName: string,
): Promise<BrokerMappingSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServerClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('csv_mappings')
    .select('broker_name, mapping, updated_at')
    .eq('user_id', user.id)
    .eq('broker_name', brokerName.trim())
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    broker_name: string;
    mapping: Record<string, string>;
    updated_at: string;
  };
  return {
    brokerName: row.broker_name,
    mapping: row.mapping as ColumnMapping,
    updatedAt: row.updated_at,
  };
}

/**
 * Type re-exports so the page layer can import the mapping types from the
 * actions module if convenient. The authoritative definitions live in
 * lib/csv-mapping.ts.
 */
export type { ColumnMapping, ImportDefaults };
