/**
 * Pure helpers for the CSV import flow (Phase 4a).
 *
 * Everything here is side-effect-free. The React layer owns the file → text
 * extraction (a File read) and the UI state; this module owns the part worth
 * unit-testing in isolation: turning raw CSV text into a normalized grid and
 * deciding which columns are numeric so the preview can honor the design
 * system's "numbers are monospaced and right-aligned" rule without a human
 * tagging each column by hand.
 *
 * Phase 4a is preview-only — nothing here touches the network or the database.
 * Column → trades-field mapping (4b) and dedup/insert (4c) build on the
 * `ParsedCsv` shape produced here.
 */
import Papa from 'papaparse';

/**
 * The maximum number of rows the preview table renders. Build.md 4a: "shows a
 * preview table of the first 10 rows before committing". The full parsed set
 * is still available on `ParsedCsv.rows` for later phases.
 */
export const PREVIEW_ROW_LIMIT = 10;

/**
 * Minimum fraction of non-empty cells in a column that must parse as numbers
 * for the column to be treated as numeric. 1.0 would be too strict — real
 * broker exports mix in the occasional blank or header-like artifact; a clear
 * majority is the right signal.
 */
const NUMERIC_COLUMN_THRESHOLD = 0.6;

export interface ParsedCsv {
  /** Header row, normalized. Empty headers become `column_N` (1-based). */
  headers: string[];
  /** Every parsed data row, parallel to `headers` by index. */
  rows: string[][];
  /** Per-column index, true when the column is detected as numeric. */
  numericColumns: boolean[];
  /** Number of data rows (rows.length). Exposed for convenience. */
  rowCount: number;
}

export interface CsvParseError {
  /** Human-facing message, safe to render directly. */
  message: string;
}

export type CsvParseResult =
  | ({ ok: true } & ParsedCsv)
  | ({ ok: false } & CsvParseError);

/**
 * Parse raw CSV text into a normalized grid with per-column numeric detection.
 *
 * `header: true` makes Papa treat the first record as the column names, so
 * `data` and `meta.fields` line up. `skipEmptyLines: true` drops blank rows
 * (common in broker exports with trailing newlines). Errors from Papa are
 * surfaced as a normal failure result rather than thrown — the UI just needs
 * a string to show.
 */
export function parseCsvText(text: string): CsvParseResult {
  if (text.trim() === '') {
    return { ok: false, message: 'The file is empty.' };
  }

  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
  });

  if (result.errors.length > 0) {
    // Papa reports per-row field-count mismatches as recoverable FieldMismatch
    // errors and still returns data; only treat hard failures (malformed
    // quoting, undetectable delimiter) as fatal.
    const fatal = result.errors.find((e) => e.type !== 'FieldMismatch');
    if (fatal) {
      return { ok: false, message: fatal.message };
    }
  }

  const records = result.data as string[][];
  if (records.length === 0) {
    return { ok: false, message: 'No rows found in the file.' };
  }

  // First record is the header. Normalize header cells to non-empty strings;
  // Papa returns undefined for trailing empty cells in a short row, so coerce.
  const rawHeaders = (records[0] ?? []).map((h) => (h ?? '').trim());
  const headers = rawHeaders.map((h, i) =>
    h === '' ? `column_${i + 1}` : h,
  );

  const rows = records.slice(1).map((record) =>
    headers.map((_, i) => {
      const cell = record[i];
      return cell == null ? '' : String(cell).trim();
    }),
  );

  if (rows.length === 0) {
    return { ok: false, message: 'The file has a header row but no data rows.' };
  }

  const numericColumns = headers.map((_, colIndex) =>
    isColumnNumeric(rows, colIndex),
  );

  return {
    ok: true,
    headers,
    rows,
    numericColumns,
    rowCount: rows.length,
  };
}

/**
 * Read a File (from a drop or file input) as text. Thin promise wrapper around
 * FileReader so the component layer can `await` it. Kept here next to the
 * parser so all CSV I/O lives in one module.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

/**
 * Decide whether a column is numeric: count non-empty cells that parse as
 * finite numbers, and require at least `NUMERIC_COLUMN_THRESHOLD` of the
 * non-empty cells to qualify. Blanks don't count against a column — broker
 * exports routinely leave optional price columns empty.
 */
function isColumnNumeric(rows: string[][], colIndex: number): boolean {
  let nonEmpty = 0;
  let numeric = 0;
  for (const row of rows) {
    const cell = row[colIndex];
    if (cell == null || cell === '') continue;
    nonEmpty++;
    if (isNumericCell(cell)) numeric++;
  }
  if (nonEmpty === 0) return false;
  return numeric / nonEmpty >= NUMERIC_COLUMN_THRESHOLD;
}

/**
 * A cell counts as numeric if, after stripping a leading/trailing sign and
 * currency wrapper, the remainder is a clean decimal (optionally with
 * thousands groups). Pure digit strings, signed decimals, "$475.00", and
 * "1,234.50" all qualify; ISO timestamps, tickers (incl. futures like
 * "ES1!" which contain a digit), "N/A", and free text do not.
 *
 * Detection is deliberately conservative: a false negative (numeric column
 * left-aligned) is a minor polish miss, while a false positive (a text column
 * right-aligned and monospaced) looks broken. So any surviving letter rejects
 * the cell — only the currency/sign characters below are tolerated as wrap.
 */
const NUMERIC_CELL_RE = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^\.\d+$/;

function isNumericCell(value: string): boolean {
  const core = value
    .trim()
    .replace(/^[+\-$€£¥\s]+/, '') // leading sign / currency / space
    .replace(/[+\-$€£¥%\s]+$/, ''); // trailing sign / currency / % / space
  if (core === '') return false;
  return NUMERIC_CELL_RE.test(core);
}

/** Format a human-readable byte size, e.g. "12.3 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
