/**
 * Pure helpers for the CSV column-mapping flow (Phase 4b).
 *
 * Three concerns live here, all side-effect-free so they can be unit-tested
 * without a DB or a DOM:
 *
 *  1. FIELD DEFS — the trades fields a CSV column can map to, with synonyms
 *     used to auto-suggest a mapping from detected headers.
 *  2. SUGGEST / RESOLVE — turn detected headers into a best-guess mapping,
 *     and reconcile a saved (broker) mapping against a new file's headers.
 *  3. BUILD — apply a mapping to parsed rows, normalizing enum values and
 *     skipping rows that can't satisfy the required fields.
 *
 * Nothing here touches the network or the database. The server action
 * (app/dashboard/trades/import/actions.ts) consumes `buildTradesFromCsv` and
 * performs the bulk insert; `r_multiple` is recomputed there via the existing
 * `computeRMultiple` helper so this module doesn't duplicate that formula.
 */
import type { AssetClass, Direction, TradeStatus } from '@/db/schema';
import { parseNumber } from '@/lib/trades';
import type { ParsedCsv } from '@/lib/csv';

/** trades fields a user can map a CSV column onto. */
export type TradesField =
  | 'instrument'
  | 'asset_class'
  | 'direction'
  | 'status'
  | 'entry_price'
  | 'exit_price'
  | 'size'
  | 'stop_price'
  | 'target_price'
  | 'entry_time'
  | 'exit_time'
  | 'pnl';

/** Fields whose value must resolve to a valid enum, else the row is skipped. */
export const ENUM_FIELDS: ReadonlyArray<TradesField> = [
  'asset_class',
  'direction',
  'status',
];

/** Numeric value fields — parsed loosely, unparseable → null (not a skip). */
export const NUMERIC_FIELDS: ReadonlyArray<TradesField> = [
  'entry_price',
  'exit_price',
  'size',
  'stop_price',
  'target_price',
  'pnl',
];

/** Timestamp fields — parsed leniently, unparseable → null (not a skip). */
export const TIMESTAMP_FIELDS: ReadonlyArray<TradesField> = [
  'entry_time',
  'exit_time',
];

/**
 * `instrument` is the only hard-required mapped field. asset_class and
 * direction are required to *resolve* (via column value or per-import
 * default) but don't have to be column-mapped — most broker CSVs omit asset
 * class and encode direction as a Buy/Sell value column.
 */
export const REQUIRED_MAPPED_FIELDS: ReadonlyArray<TradesField> = ['instrument'];

/**
 * Mapping from trades field → the source column header. Keyed by header
 * STRING (not column index) so a saved mapping survives re-export column
 * reordering/relabeling. `null`/absent = unmapped.
 */
export type ColumnMapping = Partial<Record<TradesField, string>>;

/**
 * Per-import defaults applied when a field isn't column-mapped or its cell
 * value can't be resolved. These are what the mapping UI's default selectors
 * edit; `buildTradesFromCsv` falls back to them.
 */
export interface ImportDefaults {
  assetClass: AssetClass;
  direction: Direction;
  status: TradeStatus;
}

export const DEFAULT_IMPORT_DEFAULTS: ImportDefaults = {
  assetClass: 'equity',
  direction: 'long',
  status: 'open',
};

interface FieldDef {
  field: TradesField;
  label: string;
  /**
   * Synonyms matched against normalized header text. Order matters only for
   * tie-breaking; the first exact synonym hit wins. Keep these lowercase and
   * free of punctuation — `normalizeHeader` strips both before comparing.
   */
  synonyms: ReadonlyArray<string>;
}

/**
 * Field definitions in display order. Synonyms were chosen by surveying the
 * column names common across Interactive Brokers, Alpaca, TradingView,
 * TradeStation, and ThinkOrSwim exports — covering ticker/symbol, side,
 * quantity, prices, timestamps, and P&L.
 */
const FIELD_DEFS: ReadonlyArray<FieldDef> = [
  {
    field: 'instrument',
    label: 'Instrument',
    synonyms: ['symbol', 'ticker', 'instrument', 'security', 'contract'],
  },
  {
    field: 'direction',
    label: 'Direction',
    synonyms: ['side', 'direction', 'action', 'type', 'long short', 'buy sell'],
  },
  {
    field: 'size',
    label: 'Size',
    synonyms: ['qty', 'quantity', 'shares', 'contracts', 'size', 'units', 'volume'],
  },
  {
    field: 'entry_price',
    label: 'Entry price',
    synonyms: ['entry price', 'entry', 'fill price', 'avg fill price', 'open price', 'price'],
  },
  {
    field: 'exit_price',
    label: 'Exit price',
    synonyms: ['exit price', 'exit', 'close price', 'close', 'sell price'],
  },
  {
    field: 'stop_price',
    label: 'Stop price',
    synonyms: ['stop price', 'stop', 'stop loss', 'stop loss price'],
  },
  {
    field: 'target_price',
    label: 'Target price',
    synonyms: ['target price', 'target', 'limit price', 'take profit'],
  },
  {
    field: 'pnl',
    label: 'P&L',
    synonyms: ['pnl', 'p and l', 'profit loss', 'profit', 'gain loss', 'realized pnl', 'realized', 'net pnl', 'net'],
  },
  {
    field: 'entry_time',
    label: 'Entry time',
    synonyms: ['entry time', 'entry date', 'open time', 'open date', 'date time', 'date', 'time', 'trade date', 'fill date'],
  },
  {
    field: 'exit_time',
    label: 'Exit time',
    synonyms: ['exit time', 'exit date', 'close time', 'close date', 'close datetime'],
  },
  {
    field: 'asset_class',
    label: 'Asset class',
    synonyms: ['asset class', 'asset', 'class', 'market', 'security type', 'instrument type'],
  },
  {
    field: 'status',
    label: 'Status',
    synonyms: ['status', 'state', 'open closed'],
  },
];

/** Field labels keyed by field, for the mapping UI dropdown headers. */
export const FIELD_LABELS: Record<TradesField, string> = Object.fromEntries(
  FIELD_DEFS.map((d) => [d.field, d.label]),
) as Record<TradesField, string>;

/** Display order of fields in the mapping UI. */
export const FIELD_ORDER: ReadonlyArray<TradesField> = FIELD_DEFS.map(
  (d) => d.field,
);

/**
 * Normalize a header for matching: split CamelCase, lowercase, strip
 * non-alphanumerics, collapse internal whitespace. Three forms that all map to
 * the same thing:
 *   "Avg. Fill Price" → "avg fill price"
 *   "AvgFillPrice"    → "avg fill price"
 *   "AVG_FILL_PRICE"  → "avg fill price"
 * Splitting CamelCase is essential because brokers (IBKR in particular) ship
 * headers like "OpenDateTime" / "FifoPnlRealized" with no separators.
 */
export function normalizeHeader(header: string): string {
  return header
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // CamelCase → "Camel Case"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Per-field synonyms also normalized once at module load so the suggest loop
 * isn't re-normalizing the same synonyms on every call.
 */
const NORMALIZED_SYNONYMS: ReadonlyArray<{
  field: TradesField;
  synonyms: ReadonlyArray<string>;
}> = FIELD_DEFS.map((d) => ({
  field: d.field,
  synonyms: d.synonyms.map(normalizeHeader),
}));

/**
 * Suggest a column mapping from detected headers by matching against each
 * field's synonyms. One column per field at most; if two fields would match
 * the same column, the higher-scoring match wins and the other field stays
 * unmapped (better to leave it blank than silently mis-map).
 *
 * Scoring (higher wins):
 *  - 100: exact normalized synonym match
 *  - 80 : header contains a synonym as a whole word ("avg fill price" ⊃ "fill price")
 *  - 60 : synonym contains the header ("price" ⊂ "entry price") — weaker,
 *         only used for short generic headers like "price"
 *  - 0  : no match
 *
 * The scoring favors precision: a header must genuinely look like a given
 * field to be auto-mapped. Ambiguous headers (e.g. bare "price") get at most
 * the 60-point branch, so a real "entry price" column beats it.
 */
export function suggestMapping(headers: ReadonlyArray<string>): ColumnMapping {
  // For each field, find the best-scoring header. For each header, find the
  // best-scoring field. A (field, header) pair lands in the output only when
  // each is the other's best — that's what prevents two fields from colliding
  // on one column.
  //
  // Tie-break: when two headers score equally for a field, prefer the MORE
  // specific header (longer normalized form). "entry price" is a stronger
  // signal for entry_price than a bare "price", even though both contain the
  // "price" synonym, so equal scores should resolve to the longer one.
  const bestHeaderForField = new Map<
    TradesField,
    { header: string; score: number; specificity: number }
  >();
  const bestFieldForHeader = new Map<
    string,
    { field: TradesField; score: number }
  >();

  headers.forEach((header) => {
    const norm = normalizeHeader(header);
    const specificity = norm.split(' ').length;
    for (const { field, synonyms } of NORMALIZED_SYNONYMS) {
      const score = scoreMatch(norm, synonyms);
      if (score === 0) continue;
      const prev = bestHeaderForField.get(field);
      if (
        !prev ||
        prev.score < score ||
        (prev.score === score && prev.specificity < specificity)
      ) {
        bestHeaderForField.set(field, { header, score, specificity });
      }
      const prevH = bestFieldForHeader.get(header);
      if (!prevH || prevH.score < score) {
        bestFieldForHeader.set(header, { field, score });
      }
    }
  });

  const mapping: ColumnMapping = {};
  for (const [field, claim] of bestHeaderForField) {
    if (bestFieldForHeader.get(claim.header)?.field === field) {
      mapping[field] = claim.header;
    }
  }
  return mapping;
}

/**
 * Score a normalized header against a field's normalized synonyms. See
 * `suggestMapping` for the scoring tiers.
 */
function scoreMatch(
  normHeader: string,
  synonyms: ReadonlyArray<string>,
): number {
  if (normHeader === '') return 0;
  let best = 0;
  for (const syn of synonyms) {
    if (syn === '') continue;
    if (normHeader === syn) {
      return 100; // exact — short-circuit, nothing beats it
    }
    // Whole-word containment either way. Use token boundaries so "price"
    // doesn't match "pricebook".
    if (containsWholeWord(normHeader, syn)) {
      best = Math.max(best, 80);
    } else if (containsWholeWord(syn, normHeader)) {
      best = Math.max(best, 60);
    }
  }
  return best;
}

/** True if `phrase` contains `term` as a sequence of whole tokens. */
function containsWholeWord(phrase: string, term: string): boolean {
  if (term === '') return false;
  const phraseTokens = phrase.split(' ');
  const termTokens = term.split(' ');
  for (let i = 0; i + termTokens.length <= phraseTokens.length; i++) {
    if (termTokens.every((t, j) => t === phraseTokens[i + j])) return true;
  }
  return false;
}

/**
 * Resolve a saved broker mapping against a new file's headers. Headers in the
 * saved mapping that are absent from the new file are dropped (the user will
 * see the unmapped fields and can re-suggest or fix them). This is what makes
 * a saved mapping survive re-exports that drop or rename columns.
 */
export function resolveSavedMapping(
  saved: ColumnMapping,
  headers: ReadonlyArray<string>,
): ColumnMapping {
  const present = new Set(headers);
  const resolved: ColumnMapping = {};
  for (const field of FIELD_ORDER) {
    const header = saved[field];
    if (header && present.has(header)) {
      resolved[field] = header;
    }
  }
  return resolved;
}

// =============================================================================
// Value normalization — turn raw cell strings into typed DB values.
// =============================================================================

/** Direction synonyms grouped by target value. Matched case-insensitively. */
const DIRECTION_LONG = ['long', 'buy', 'b', 'buy to open', 'bto', 'long to open'];
const DIRECTION_SHORT = ['short', 'sell', 's', 'sell to open', 'sto', 'short to open', 'ss'];

/** Asset-class synonyms — matched as whole tokens in the cell. */
const ASSET_CLASS_SYNONYMS: Record<AssetClass, ReadonlyArray<string>> = {
  equity: ['equity', 'stock', 'stocks', 'share', 'shares'],
  forex: ['forex', 'fx', 'currency', 'currencies'],
  futures: ['futures', 'future', 'fut'],
  crypto: ['crypto', 'cryptocurrency', 'coin', 'tokens'],
  option: ['option', 'options', 'opt'],
};

const STATUS_OPEN = ['open', 'opened', 'active', 'pending'];
const STATUS_CLOSED = ['closed', 'close', 'realized', 'done'];

/** Normalize an asset_class cell value, or null if it can't be resolved. */
export function normalizeAssetClass(raw: string | null | undefined): AssetClass | null {
  const norm = normalizeHeaderValue(raw);
  if (!norm) return null;
  for (const cls of ['equity', 'forex', 'futures', 'crypto', 'option'] as AssetClass[]) {
    if (norm === cls || ASSET_CLASS_SYNONYMS[cls].includes(norm)) return cls;
  }
  return null;
}

/** Normalize a direction cell value, or null if it can't be resolved. */
export function normalizeDirection(raw: string | null | undefined): Direction | null {
  const norm = normalizeHeaderValue(raw);
  if (!norm) return null;
  if (DIRECTION_LONG.includes(norm)) return 'long';
  if (DIRECTION_SHORT.includes(norm)) return 'short';
  return null;
}

/** Normalize a status cell value, or null if it can't be resolved. */
export function normalizeStatus(raw: string | null | undefined): TradeStatus | null {
  const norm = normalizeHeaderValue(raw);
  if (!norm) return null;
  if (STATUS_OPEN.includes(norm)) return 'open';
  if (STATUS_CLOSED.includes(norm)) return 'closed';
  return null;
}

/**
 * Normalize an enum/identifier cell for comparison: lowercase, strip the
 * currency/percent/symbol noise that brokers attach to side columns, collapse
 * whitespace. "Buy (B)" → "buy b".
 */
function normalizeHeaderValue(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw)
    .toLowerCase()
    .replace(/[$€£¥%()]/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

// =============================================================================
// Build — apply a mapping to parsed rows and produce typed trade inserts.
// =============================================================================

/** One built trade row ready for insert (camelCase; the action maps to snake_case). */
export interface BuiltTrade {
  instrument: string;
  assetClass: AssetClass;
  direction: Direction;
  status: TradeStatus;
  entryPrice: number | null;
  exitPrice: number | null;
  size: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  entryTime: string | null;
  exitTime: string | null;
  pnl: number | null;
}

/** Reason a row was skipped during build — surfaced in the import summary. */
export type SkipReason =
  | 'missing-instrument'
  | 'unresolved-asset-class'
  | 'unresolved-direction'
  | 'unresolved-status';

export interface SkippedRow {
  /** 0-based index into the parsed rows array. */
  rowIndex: number;
  reason: SkipReason;
  /** The offending cell value, for display in a skipped-rows review list. */
  detail: string;
}

export interface BuildResult {
  trades: BuiltTrade[];
  skipped: SkippedRow[];
}

/**
 * Apply a column mapping + per-import defaults to a parsed CSV, producing
 * typed trade rows ready to insert.
 *
 * Skip rules:
 *  - instrument cell empty → skip (missing-instrument)
 *  - asset_class column mapped but cell value unresolvable AND no default
 *    applies → skip. If no column is mapped, the per-import default is used.
 *  - direction: same rule as asset_class.
 *  - status: same rule, defaulting to the import default (usually 'open').
 *
 * Numeric and timestamp fields never skip a row — an unparseable value becomes
 * null on the built trade (matching the manual form, where those are optional).
 */
export function buildTradesFromCsv(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  defaults: ImportDefaults,
): BuildResult {
  const colIndexByHeader = new Map<string, number>();
  parsed.headers.forEach((h, i) => colIndexByHeader.set(h, i));

  const instrumentCol = mapping.instrument != null ? colIndexByHeader.get(mapping.instrument) : undefined;
  const assetClassCol = mapping.asset_class != null ? colIndexByHeader.get(mapping.asset_class) : undefined;
  const directionCol = mapping.direction != null ? colIndexByHeader.get(mapping.direction) : undefined;
  const statusCol = mapping.status != null ? colIndexByHeader.get(mapping.status) : undefined;
  const numericCols: Partial<Record<TradesField, number>> = {};
  for (const f of NUMERIC_FIELDS) {
    if (mapping[f] != null) {
      const idx = colIndexByHeader.get(mapping[f]!);
      if (idx != null) numericCols[f] = idx;
    }
  }
  const tsCols: Partial<Record<TradesField, number>> = {};
  for (const f of TIMESTAMP_FIELDS) {
    if (mapping[f] != null) {
      const idx = colIndexByHeader.get(mapping[f]!);
      if (idx != null) tsCols[f] = idx;
    }
  }

  const trades: BuiltTrade[] = [];
  const skipped: SkippedRow[] = [];

  parsed.rows.forEach((row, rowIndex) => {
    // instrument — required.
    let instrument = '';
    if (instrumentCol != null) {
      instrument = (row[instrumentCol] ?? '').trim();
    }
    if (instrument === '') {
      skipped.push({ rowIndex, reason: 'missing-instrument', detail: 'No instrument value.' });
      return;
    }

    // asset_class — try mapped column, fall back to default.
    let assetClass: AssetClass | null = defaults.assetClass;
    if (assetClassCol != null) {
      const cell = row[assetClassCol];
      if (cell && cell.trim() !== '') {
        assetClass = normalizeAssetClass(cell);
        if (assetClass == null) {
          skipped.push({
            rowIndex,
            reason: 'unresolved-asset-class',
            detail: cell,
          });
          return;
        }
      }
    }

    // direction — try mapped column, fall back to default.
    let direction: Direction | null = defaults.direction;
    if (directionCol != null) {
      const cell = row[directionCol];
      if (cell && cell.trim() !== '') {
        direction = normalizeDirection(cell);
        if (direction == null) {
          skipped.push({
            rowIndex,
            reason: 'unresolved-direction',
            detail: cell,
          });
          return;
        }
      }
    }

    // status — try mapped column, fall back to default.
    let status: TradeStatus | null = defaults.status;
    if (statusCol != null) {
      const cell = row[statusCol];
      if (cell && cell.trim() !== '') {
        status = normalizeStatus(cell);
        if (status == null) {
          skipped.push({
            rowIndex,
            reason: 'unresolved-status',
            detail: cell,
          });
          return;
        }
      }
    }

    trades.push({
      instrument,
      assetClass,
      direction,
      status,
      entryPrice: numericValue(row, numericCols.entry_price),
      exitPrice: numericValue(row, numericCols.exit_price),
      size: numericValue(row, numericCols.size),
      stopPrice: numericValue(row, numericCols.stop_price),
      targetPrice: numericValue(row, numericCols.target_price),
      pnl: numericValue(row, numericCols.pnl),
      entryTime: timestampValue(row, tsCols.entry_time),
      exitTime: timestampValue(row, tsCols.exit_time),
    });
  });

  return { trades, skipped };
}

/** Read + loose-parse a numeric cell; null for empty/unparseable. */
function numericValue(
  row: string[],
  col: number | undefined,
): number | null {
  if (col == null) return null;
  return parseNumber(row[col]);
}

/**
 * Read + parse a timestamp cell. Uses Date.parse which accepts ISO and most
 * common broker formats ("YYYY-MM-DD HH:MM:SS", "MM/DD/YYYY"). Returns an ISO
 * string or null. No timezone coercion — the server action hands the string
 * to Postgres and timestamptz handles UTC normalization.
 */
function timestampValue(
  row: string[],
  col: number | undefined,
): string | null {
  if (col == null) return null;
  const raw = (row[col] ?? '').trim();
  if (raw === '') return null;
  // Swap space-separated "YYYY-MM-DD HH:MM" into ISO "T" form so Date.parse
  // is reliable across browsers (some reject the space form).
  const isoish = raw.replace(/^(\d{4}-\d{2}-\d{2})\s/, '$1T');
  const ms = Date.parse(isoish);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}
