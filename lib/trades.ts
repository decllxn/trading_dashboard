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
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
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
