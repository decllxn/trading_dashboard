'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { computeRMultiple } from '@/lib/trades';
import {
  buildTradesFromCsv,
  dedupeTrades,
  type ColumnMapping,
  type ExistingTrade,
  type ImportDefaults,
  type SkippedRow,
} from '@/lib/csv-mapping';
import type { ParsedCsv } from '@/lib/csv';
import {
  extractPdfText,
  extractTradesFromText,
  isAnthropicConfigured,
} from '@/lib/pdf-extract';
import type { Direction, TradeStatus } from '@/db/schema';

/**
 * Import payload shared by preview + commit. The parsed CSV travels back over
 * the wire because the server action is the trust boundary: it re-runs the
 * build + dedup from scratch, so a tampered client can't bypass skip/dedup
 * rules by sending pre-built trades. Sending only the built trades would let a
 * malicious client hide duplicates.
 */
export interface ImportPayload {
  brokerName: string;
  parsed: ParsedCsv;
  mapping: ColumnMapping;
  defaults: ImportDefaults;
}

/** One built trade, ready to insert, in the wire snake_case shape. */
interface InsertRow {
  user_id: string;
  instrument: string;
  asset_class: string;
  direction: Direction;
  status: string;
  source: 'csv';
  entry_price: string | null;
  exit_price: string | null;
  size: string | null;
  stop_price: string | null;
  target_price: string | null;
  entry_time: string | null;
  exit_time: string | null;
  pnl: string | null;
  commission: string | null;
  swap: string | null;
  fees: string | null;
  r_multiple: string | null;
}

/**
 * Preview result — the "N new, M duplicates skipped, K rows skipped" summary
 * the user sees BEFORE committing. No rows are written. The client shows the
 * new count and a reviewable list of every skipped row (duplicates included)
 * so the user can confirm before the irreversible insert.
 */
export interface PreviewResult {
  /** Trades that would be inserted on commit. */
  newCount: number;
  /** Built trades that matched an existing row. */
  duplicateCount: number;
  /** Rows that failed build validation (bad enum, missing instrument). */
  skippedCount: number;
  /** Every skipped row — both build failures and duplicates — for review. */
  skipped: SkippedRow[];
  error?: string;
}

/**
 * The result of a committed import. `inserted` is the actual number of rows
 * written (may differ from the preview's newCount only if existing trades
 * changed between preview and commit — re-derived server-side).
 */
export interface CommitResult {
  inserted: number;
  duplicatesSkipped: number;
  mappingSaved: boolean;
  error?: string;
}

// =============================================================================
// Existing-trade read (dedup reference set).
// =============================================================================

/** Raw shape of a Supabase trade row used for dedup. snake_case. */
interface RawExistingTrade {
  instrument: string;
  size: string | null;
  entry_time: string | null;
}

/**
 * Fetch the user's existing trades projected down to the dedup key (instrument,
 * size, entry_time). These are the rows new imports are checked against. We
 * select only the three dedup columns to keep the payload small — a user with
 * thousands of trades doesn't need every column shipped for dedup.
 *
 * Decimal columns come back as strings; we coerce to number | null here so
 * `dedupeTrades` receives a clean shape.
 */
async function listExistingTrades(
  userId: string,
): Promise<{ existing: ExistingTrade[]; error?: string }> {
  const supabase = createServerClient();
  if (!supabase) return { existing: [], error: 'Database client unavailable.' };
  const { data, error } = await supabase
    .from('trades')
    .select('instrument, size, entry_time')
    .eq('user_id', userId);
  if (error) return { existing: [], error: error.message };
  const existing = ((data ?? []) as RawExistingTrade[]).map((t) => ({
    instrument: t.instrument,
    size: toNumber(t.size),
    entryTime: t.entry_time,
  }));
  return { existing };
}

/** Postgres numeric → number | null. Safe at retail-trade magnitudes. */
function toNumber(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// =============================================================================
// Preview — build + dedup, no writes.
// =============================================================================

/**
 * Preview an import: build typed trades from the parsed grid, dedup against
 * the user's existing trades, and return the summary. No rows are inserted.
 * The user reviews this summary (new count, every skipped row + reason) before
 * the `commitImport` action runs.
 */
export async function previewImport(
  payload: ImportPayload,
): Promise<PreviewResult> {
  if (!isSupabaseConfigured()) {
    return emptyPreview('Supabase is not configured.');
  }
  const supabase = createServerClient();
  if (!supabase) return emptyPreview('Database client unavailable.');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyPreview('You must be signed in to import trades.');

  const { trades, skipped } = buildTradesFromCsv(
    payload.parsed,
    payload.mapping,
    payload.defaults,
  );

  const { existing, error } = await listExistingTrades(user.id);
  if (error) {
    return {
      newCount: 0,
      duplicateCount: 0,
      skippedCount: skipped.length,
      skipped,
      error,
    };
  }

  const { newTrades, duplicates } = dedupeTrades(trades, existing);
  return {
    newCount: newTrades.length,
    duplicateCount: duplicates.length,
    skippedCount: skipped.length,
    skipped: [...skipped, ...duplicates],
  };
}

function emptyPreview(message: string): PreviewResult {
  return {
    newCount: 0,
    duplicateCount: 0,
    skippedCount: 0,
    skipped: [],
    error: message,
  };
}

// =============================================================================
// Commit — insert the de-duplicated new trades + save the mapping.
// =============================================================================

/**
 * Commit an import: re-run build + dedup (the payload is the trust boundary —
 * the server doesn't trust a client-sent "which rows are new" list), insert
 * only the new trades with `source: 'csv'`, and upsert the (user, broker)
 * mapping. Returns the actual inserted count so the UI can confirm.
 *
 * Dedup is re-derived here, not carried over from the preview, so trades
 * inserted between preview and commit are accounted for (and a tampered
 * payload can't sneak in duplicates by claiming everything is new).
 */
export async function commitImport(
  payload: ImportPayload,
): Promise<CommitResult> {
  if (!isSupabaseConfigured()) {
    return { inserted: 0, duplicatesSkipped: 0, mappingSaved: false, error: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) {
    return { inserted: 0, duplicatesSkipped: 0, mappingSaved: false, error: 'Database client unavailable.' };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { inserted: 0, duplicatesSkipped: 0, mappingSaved: false, error: 'You must be signed in to import trades.' };
  }

  const { trades } = buildTradesFromCsv(
    payload.parsed,
    payload.mapping,
    payload.defaults,
  );
  const { existing } = await listExistingTrades(user.id);
  const { newTrades, duplicates } = dedupeTrades(trades, existing);

  if (newTrades.length > 0) {
    const rows: InsertRow[] = newTrades.map((t) => ({
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
      commission: numOrNull(t.commission),
      swap: numOrNull(t.swap),
      fees: numOrNull(t.fees),
      r_multiple: rMultipleOrNull(t),
    }));

    const { error: insertError } = await supabase
      .from('trades')
      .insert(rows);
    if (insertError) {
      return {
        inserted: 0,
        duplicatesSkipped: duplicates.length,
        mappingSaved: false,
        error: insertError.message,
      };
    }
  }

  // Upsert the (user, broker) mapping. ON CONFLICT (user_id, broker_name)
  // DO UPDATE is what makes a re-import refresh the saved mapping in place
  // instead of stacking duplicate rows.
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
    inserted: newTrades.length,
    duplicatesSkipped: duplicates.length,
    mappingSaved,
  };
}

/** Decimal columns are sent as strings (Postgres numeric wire format). */
function numOrNull(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

/**
 * Recompute R from the built row. The source data may have shipped its own R,
 * but we ignore it and compute from entry/stop/exit + direction so the value
 * is consistent with the manual trade entry path.
 */
function rMultipleOrNull(t: {
  entryPrice: number | null;
  stopPrice: number | null;
  exitPrice: number | null;
  targetPrice: number | null;
  status: TradeStatus;
  direction: Direction;
}): string | null {
  const r = computeRMultiple(
    t.entryPrice,
    t.stopPrice,
    t.exitPrice,
    t.direction,
  );
  return r == null ? null : String(r);
}

// =============================================================================
// PDF extraction (Phase 4d) — server-side only.
// =============================================================================

/**
 * Result of extracting trade rows from a PDF broker statement. On success,
 * `parsed` is the same `ParsedCsv` shape the CSV importer produces, so the
 * downstream mapping / preview / dedup flow is reused unchanged.
 */
export interface PdfExtractActionResult {
  ok: boolean;
  parsed?: ParsedCsv;
  error?: string;
}

/**
 * Extract trades from a PDF broker statement: pdf-parse pulls the text,
 * Claude (structured output) returns headers + rows. Auth-gated so a signed-in
 * session is required even though no DB row is read or written here — broker
 * statements are sensitive, and this guards the Anthropic call behind login.
 *
 * The 5 MB ceiling matches what the manual-entry forms accept for attachments
 * and keeps the request well under Anthropic's per-request text limits once
 * pdf-parse flattens it. Statements above this are rejected with a clear
 * message rather than failing mid-extraction.
 */
const PDF_MAX_BYTES = 5 * 1024 * 1024;

export async function extractPdfTrades(
  file: File,
): Promise<PdfExtractActionResult> {
  if (!isAnthropicConfigured()) {
    return { ok: false, error: 'Anthropic API key is not configured.' };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = createServerClient();
  if (!supabase) return { ok: false, error: 'Database client unavailable.' };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in to import trades.' };

  if (file.size > PDF_MAX_BYTES) {
    return {
      ok: false,
      error: `PDF is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is 5.0 MB.`,
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { ok: false, error: 'Could not read the PDF file.' };
  }

  let text: string;
  try {
    text = await extractPdfText(buffer);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `PDF text extraction failed: ${err.message}`
          : 'PDF text extraction failed.',
    };
  }

  const result = await extractTradesFromText(text);
  if (!result.ok) {
    return { ok: false, error: result.message };
  }
  // Mark the source so saved mappings know this came from a PDF. We don't
  // persist the source on ParsedCsv itself (it's a parse shape); the mapping
  // is saved under whatever broker name the user enters, same as CSV.
  return { ok: true, parsed: result };
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
