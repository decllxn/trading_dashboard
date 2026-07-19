/**
 * Pure helpers for the trades domain.
 *
 * Everything here is side-effect-free and shared by client (live form
 * preview) and server (validation + insert). Form values cross the wire as
 * strings, so parsing lives here too — one place to get the decimal/timestamp
 * rules right. The R-multiple formula is intentionally pure so it can be unit
 * tested against a hand-computed table without a DB.
 */
import type { AssetClass, Direction, TagCategory, TradeStatus } from '@/db/schema';

/**
 * Compute the realized R-multiple of a round-trip trade.
 *
 * R = (|entry - exit| / |entry - stop|) * sign(exit - entry for longs; the
 * inverse for shorts). A long profits when exit > entry; a short profits when
 * exit < entry. The formula below encodes both by multiplying by the
 * direction's natural sign so R comes out signed (negative = loss in R
 * terms) regardless of direction.
 *
 * Returns null when any of entry/stop/exit is missing or stop == entry
 * (zero risk would divide by zero — the trade is degenerate). This is the
 * contract the form preview and the server action both rely on: null means
 * "not enough info to compute."
 */
export function computeRMultiple(
  entry: number | null,
  stop: number | null,
  exit: number | null,
  direction: Direction | null,
): number | null {
  if (entry == null || stop == null || exit == null) return null;
  if (!direction) return null;
  const risk = Math.abs(entry - stop);
  if (risk === 0) return null; // zero risk — degenerate, no R defined

  // Signed price distance in the trade's favor: positive = in profit.
  const favorable =
    direction === 'long' ? exit - entry : entry - exit;
  return favorable / risk;
}

/**
 * Round to a fixed number of decimals without floating-point sneakiness for
 * display. Returns null if input is null so callers can render a placeholder.
 */
export function round(value: number | null, decimals = 2): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Format an R-multiple for the live form preview (e.g. +2.50R, -1.00R).
 * Numbers are rendered monospaced by the caller via .num. Sign is always shown
 * so a flat 0R is distinguishable from "not yet computed".
 */
export function formatR(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}R`;
}

/**
 * Format a signed P&L value with the same sign convention as formatR. The
 * sign drives the gain/loss color token in the UI — this helper only produces
 * the string.
 */
export function formatPnl(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

/**
 * Parsed numeric form value → number | null. Empty string, whitespace, and
 * non-finite values yield null. Centralizes "is this a usable number?" so the
 * server action and the form preview agree.
 */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a datetime-local string (YYYY-MM-DDTHH:mm) into an ISO string the
 * server action can hand straight to Postgres. Returns null for empty. The
 * datetime-local input yields local wall-clock time; new Date(...) interprets
 * it as local and .toISOString() normalizes to UTC for storage.
 */
export function parseDateTimeLocal(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Options for the asset_class <select>, with human labels. */
export const ASSET_CLASS_OPTIONS: ReadonlyArray<{ value: AssetClass; label: string }> = [
  { value: 'equity', label: 'Equity' },
  { value: 'forex', label: 'Forex' },
  { value: 'futures', label: 'Futures' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'option', label: 'Option' },
];

/** Options for the direction segmented control. */
export const DIRECTION_OPTIONS: ReadonlyArray<{ value: Direction; label: string }> = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
];

/** Options for the status segmented control. */
export const STATUS_OPTIONS: ReadonlyArray<{ value: TradeStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

/**
 * Display order + labels for the four tag categories in the grouped picker.
 * `setup` is included even though the seed leaves it empty — users create
 * their own setup tags, and the picker should show the section as a target.
 */
export const TAG_CATEGORY_ORDER: ReadonlyArray<{ value: TagCategory; label: string }> = [
  { value: 'setup', label: 'Setups' },
  { value: 'ict_concept', label: 'ICT concepts' },
  { value: 'session', label: 'Sessions' },
  { value: 'emotion', label: 'Emotions' },
];

/** P&L color token based on sign — use with text-gain / text-loss per DS. */
export function pnlColorClass(value: number | null): string {
  if (value == null) return 'text-secondary';
  if (value > 0) return 'text-gain';
  if (value < 0) return 'text-loss';
  return 'text-secondary';
}

/** R-multiple color token: gains green, losses red, neutral otherwise. */
export function rColorClass(value: number | null): string {
  if (value == null) return 'text-tertiary';
  if (value > 0) return 'text-gain';
  if (value < 0) return 'text-loss';
  return 'text-secondary';
}

// =============================================================================
// Trade list domain (Phase 3b)
// =============================================================================
//
// `TradeRow` is the UI-facing contract for one row in /trades. It is decoupled
// from the Drizzle `Trade` type on purpose: the server component maps the
// raw Supabase row (snake_case, decimal-as-string, tag ids resolved to names)
// into this clean shape exactly once, so the client table never touches the
// wire format and stays easy to reason about.
//
// Decimal columns are pre-coerced to number | null here. Postgres numeric
// comes back as a string; Number() is safe for the magnitudes a retail trade
// journal handles (well within Number.MAX_SAFE_INTEGER of significant digits).

/** A tag resolved for display: id + name (category is not needed in the table). */
export interface TradeRowTag {
  id: string;
  name: string;
}

/** UI contract for one row of the trades table. */
export interface TradeRow {
  id: string;
  instrument: string;
  assetClass: AssetClass;
  direction: Direction;
  entryPrice: number | null;
  exitPrice: number | null;
  size: number | null;
  /** Net P&L (gross − commission − swap − fees). The headline P&L shown everywhere. */
  pnl: number | null;
  /** Gross P&L before carrying costs. Shown on hover/detail when costs exist. */
  grossPnl: number | null;
  commission: number | null;
  swap: number | null;
  fees: number | null;
  rMultiple: number | null;
  status: TradeStatus;
  dailyPdArray: string | null;
  oneHourPdArray: string | null;
  thirtyMinutePdArray: string | null;
  images: string[] | null;
  stopPrice: number | null;
  targetPrice: number | null;
  exitTime: string | null;
  /** ISO string; the row is sorted on this by default. Null sorts last. */
  entryTime: string | null;
  /** Resolved tag names for this trade, alphabetized by name. */
  tags: ReadonlyArray<TradeRowTag>;
}

/** Sortable columns. Mirrors the sortable headers in the table. */
export type TradeSortKey =
  | 'instrument'
  | 'direction'
  | 'entryPrice'
  | 'exitPrice'
  | 'pnl'
  | 'rMultiple'
  | 'status'
  | 'entryTime';

export type SortDirection = 'asc' | 'desc';

export interface TradeSort {
  key: TradeSortKey;
  direction: SortDirection;
}

/** Active filter values. `null`/empty means "no constraint" for that facet. */
export interface TradeFilters {
  assetClass: AssetClass | 'all';
  tagId: string | 'all';
  status: TradeStatus | 'all';
  /** ISO date (YYYY-MM-DD) or empty. Inclusive lower bound on entry_time. */
  fromDate: string;
  /** ISO date (YYYY-MM-DD) or empty. Inclusive upper bound on entry_time. */
  toDate: string;
}

export const DEFAULT_FILTERS: TradeFilters = {
  assetClass: 'all',
  tagId: 'all',
  status: 'all',
  fromDate: '',
  toDate: '',
};

/** True when every facet is at its default (no filter applied). */
export function filtersAreEmpty(filters: TradeFilters): boolean {
  return (
    filters.assetClass === 'all' &&
    filters.tagId === 'all' &&
    filters.status === 'all' &&
    filters.fromDate === '' &&
    filters.toDate === ''
  );
}

/**
 * Apply the active filters to a trade list. Pure — used in the client via
 * useMemo so filtering is instant with no server round-trip. Date filters are
 * inclusive day bounds: `fromDate` = entry on/after 00:00 that day; `toDate` =
 * entry on/before 23:59:59 that day.
 */
export function filterTrades(
  trades: ReadonlyArray<TradeRow>,
  filters: TradeFilters,
): TradeRow[] {
  const fromMs = filters.fromDate ? Date.parse(`${filters.fromDate}T00:00:00`) : null;
  // toDate is inclusive of the whole day: add 23:59:59.999.
  const toMs = filters.toDate ? Date.parse(`${filters.toDate}T23:59:59.999`) : null;

  return trades.filter((t) => {
    if (filters.assetClass !== 'all' && t.assetClass !== filters.assetClass) return false;
    if (filters.status !== 'all' && t.status !== filters.status) return false;
    if (filters.tagId !== 'all' && !t.tags.some((tag) => tag.id === filters.tagId)) {
      return false;
    }
    if (t.entryTime != null) {
      const ms = Date.parse(t.entryTime);
      if (fromMs != null && ms < fromMs) return false;
      if (toMs != null && ms > toMs) return false;
    } else if (fromMs != null || toMs != null) {
      // A trade with no entry time can't satisfy a date range.
      return false;
    }
    return true;
  });
}

/**
 * Compare two values for sorting, null-safe (nulls always sort last regardless
 * of direction — a missing value is never "greater" than a present one).
 */
function compareValues<T>(a: T | null, b: T | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // a is null -> sort after b
  if (b == null) return -1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Sort trades by the given key + direction. Pure. Strings use localeCompare;
 * everything else uses the generic comparator. The client applies this after
 * filterTrades in the same useMemo, so sort+filter is one pass per render.
 */
export function sortTrades(
  trades: ReadonlyArray<TradeRow>,
  sort: TradeSort,
): TradeRow[] {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const sorted = [...trades].sort((a, b) => {
    let cmp: number;
    switch (sort.key) {
      case 'instrument':
        cmp = a.instrument.localeCompare(b.instrument);
        break;
      case 'direction':
        cmp = a.direction.localeCompare(b.direction);
        break;
      case 'status':
        cmp = a.status.localeCompare(b.status);
        break;
      case 'entryPrice':
        cmp = compareValues(a.entryPrice, b.entryPrice);
        break;
      case 'exitPrice':
        cmp = compareValues(a.exitPrice, b.exitPrice);
        break;
      case 'pnl':
        cmp = compareValues(a.pnl, b.pnl);
        break;
      case 'rMultiple':
        cmp = compareValues(a.rMultiple, b.rMultiple);
        break;
      case 'entryTime':
        // ISO strings sort chronologically under string compare.
        cmp = compareValues(a.entryTime, b.entryTime);
        break;
    }
    return cmp * dir;
  });
  return sorted;
}

/** Format an ISO timestamp as a compact locale date (e.g. "Jan 5, 2025"). */
export function formatEntryDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format a decimal-as-number for a price/size cell; null → dash. */
export function formatPrice(value: number | null, assetClass?: AssetClass | null): string {
  if (value == null) return '—';
  const decimals = assetClass === 'forex' ? 4 : 2;
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Capitalize the first letter — used for direction/status display. */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

export interface InstrumentSpec {
  symbol: string;
  name: string;
  class: 'fx' | 'commodity' | 'index';
  contract_size: number;
  pip_or_point_size: number;
  quote_currency: string;
  min_lot: number;
  lot_step: number;
  max_lot: number;
}

export const PEPPERSTONE_SPECS: Record<string, InstrumentSpec> = {
  "EURUSD": { symbol: "EURUSD", name: "EUR/USD", class: "fx", contract_size: 100000, pip_or_point_size: 0.0001, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "GBPUSD": { symbol: "GBPUSD", name: "GBP/USD", class: "fx", contract_size: 100000, pip_or_point_size: 0.0001, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "USDJPY": { symbol: "USDJPY", name: "USD/JPY", class: "fx", contract_size: 100000, pip_or_point_size: 0.01, quote_currency: "JPY", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "AUDUSD": { symbol: "AUDUSD", name: "AUD/USD", class: "fx", contract_size: 100000, pip_or_point_size: 0.0001, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "EURJPY": { symbol: "EURJPY", name: "EUR/JPY", class: "fx", contract_size: 100000, pip_or_point_size: 0.01, quote_currency: "JPY", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "GBPJPY": { symbol: "GBPJPY", name: "GBP/JPY", class: "fx", contract_size: 100000, pip_or_point_size: 0.01, quote_currency: "JPY", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "USDCAD": { symbol: "USDCAD", name: "USD/CAD", class: "fx", contract_size: 100000, pip_or_point_size: 0.0001, quote_currency: "CAD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "USDCHF": { symbol: "USDCHF", name: "USD/CHF", class: "fx", contract_size: 100000, pip_or_point_size: 0.0001, quote_currency: "CHF", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  
  "XAUUSD": { symbol: "XAUUSD", name: "Gold (XAU/USD)", class: "commodity", contract_size: 100, pip_or_point_size: 0.01, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "XAGUSD": { symbol: "XAGUSD", name: "Silver (XAG/USD)", class: "commodity", contract_size: 5000, pip_or_point_size: 0.001, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "USOIL":  { symbol: "USOIL",  name: "Crude Oil (WTI)", class: "commodity", contract_size: 1000, pip_or_point_size: 0.01, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "UKOIL":  { symbol: "UKOIL",  name: "Crude Oil (Brent)", class: "commodity", contract_size: 1000, pip_or_point_size: 0.01, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "NGAS":   { symbol: "NGAS",   name: "Natural Gas", class: "commodity", contract_size: 10000, pip_or_point_size: 0.001, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },

  "US500":  { symbol: "US500",  name: "S&P 500 (US500)", class: "index", contract_size: 1, pip_or_point_size: 1.0, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "NAS100": { symbol: "NAS100", name: "Nasdaq (NAS100)", class: "index", contract_size: 1, pip_or_point_size: 1.0, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "US30":   { symbol: "US30",   name: "Dow Jones (US30)", class: "index", contract_size: 1, pip_or_point_size: 1.0, quote_currency: "USD", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "GER40":  { symbol: "GER40",  name: "DAX (GER40)", class: "index", contract_size: 1, pip_or_point_size: 1.0, quote_currency: "EUR", min_lot: 0.01, lot_step: 0.01, max_lot: 100 },
  "UK100":  { symbol: "UK100",  name: "FTSE (UK100)", class: "index", contract_size: 1, pip_or_point_size: 1.0, quote_currency: "GBP", min_lot: 0.01, lot_step: 0.01, max_lot: 100 }
};

/**
 * Calculates the exact currency amount (in USD) risked on a trade,
 * accounting for Pepperstone's contract sizes/multipliers across CFDs and FX.
 */
export function calculateTradeRisk(
  instrument: string | null,
  size: number | null,
  entry: number | null,
  stop: number | null,
  assetClass: AssetClass | null,
  userSpecs?: Partial<InstrumentSpec>,
  exchangeRateOverride?: number
): number | null {
  if (!instrument || size == null || entry == null || stop == null) return null;
  const priceDiff = Math.abs(entry - stop);
  if (priceDiff === 0) return null;

  const symbol = instrument.toUpperCase().replace(/[^A-Z0-9/]/g, '');
  
  // Find match in our Pepperstone default specs
  const matchedKey = Object.keys(PEPPERSTONE_SPECS).find(key => symbol.includes(key));
  const defaultSpec = matchedKey ? PEPPERSTONE_SPECS[matchedKey] : null;

  // Resolve specification fields, allowing user overrides
  const contractSize = userSpecs?.contract_size ?? defaultSpec?.contract_size ?? (assetClass === 'forex' ? 100000 : 1);
  const quoteCurrency = userSpecs?.quote_currency ?? defaultSpec?.quote_currency ?? 'USD';

  // Base risk in quote currency of the instrument
  const baseRisk = priceDiff * contractSize * size;

  // Convert to USD (standard account base currency)
  if (exchangeRateOverride != null) {
    return baseRisk * exchangeRateOverride;
  }

  if (quoteCurrency === 'USD') {
    return baseRisk;
  } else if (quoteCurrency === 'JPY') {
    const jpyRate = symbol.startsWith('USD') ? entry : 155.0;
    return baseRisk / jpyRate;
  } else if (quoteCurrency === 'GBP') {
    return baseRisk * 1.30;
  } else if (quoteCurrency === 'EUR') {
    return baseRisk * 1.10;
  } else if (quoteCurrency === 'AUD') {
    return baseRisk * 0.66;
  } else if (quoteCurrency === 'CHF') {
    return baseRisk / 0.90;
  } else if (quoteCurrency === 'CAD') {
    return baseRisk / 1.35;
  }

  return baseRisk;
}

/**
 * Calculates position size in lots given a target risk amount.
 */
export function calculatePositionSize(
  instrument: string | null,
  targetRiskAmount: number | null,
  entry: number | null,
  stop: number | null,
  assetClass: AssetClass | null,
  userSpecs?: Partial<InstrumentSpec>,
  exchangeRateOverride?: number
): number | null {
  if (!instrument || targetRiskAmount == null || entry == null || stop == null) return null;
  const priceDiff = Math.abs(entry - stop);
  if (priceDiff === 0) return null;

  const symbol = instrument.toUpperCase().replace(/[^A-Z0-9/]/g, '');
  const matchedKey = Object.keys(PEPPERSTONE_SPECS).find(key => symbol.includes(key));
  const defaultSpec = matchedKey ? PEPPERSTONE_SPECS[matchedKey] : null;

  const contractSize = userSpecs?.contract_size ?? defaultSpec?.contract_size ?? (assetClass === 'forex' ? 100000 : 1);
  const quoteCurrency = userSpecs?.quote_currency ?? defaultSpec?.quote_currency ?? 'USD';

  let conversionRate = 1.0;
  if (exchangeRateOverride != null) {
    conversionRate = exchangeRateOverride;
  } else if (quoteCurrency === 'JPY') {
    const jpyRate = symbol.startsWith('USD') ? entry : 155.0;
    conversionRate = 1.0 / jpyRate;
  } else if (quoteCurrency === 'GBP') {
    conversionRate = 1.30;
  } else if (quoteCurrency === 'EUR') {
    conversionRate = 1.10;
  } else if (quoteCurrency === 'AUD') {
    conversionRate = 0.66;
  } else if (quoteCurrency === 'CHF') {
    conversionRate = 1.0 / 0.90;
  } else if (quoteCurrency === 'CAD') {
    conversionRate = 1.0 / 1.35;
  }

  const rawSize = targetRiskAmount / (priceDiff * contractSize * conversionRate);
  
  const lotStep = userSpecs?.lot_step ?? defaultSpec?.lot_step ?? 0.01;
  const minLot = userSpecs?.min_lot ?? defaultSpec?.min_lot ?? 0.01;
  const maxLot = userSpecs?.max_lot ?? defaultSpec?.max_lot ?? 100;

  const steppedSize = Math.max(minLot, Math.min(maxLot, Math.round(rawSize / lotStep) * lotStep));
  return steppedSize;
}

/** Formats a risk value as currency. */
export function formatRisk(value: number | null): string {
  if (value == null) return '—';
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
