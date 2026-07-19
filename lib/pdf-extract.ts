/**
 * PDF broker-statement extraction (Phase 4d).
 *
 * A broker statement PDF is extracted to text server-side, then sent to Claude
 * with a structured-output prompt that returns the SAME `ParsedCsv` shape the
 * CSV importer (4a) produces. That makes the PDF path a drop-in source for
 * the existing mapping / preview / dedup flow: the downstream code never knows
 * or cares whether the source was a CSV or a PDF.
 *
 * Two concerns are kept separate and both side-effect-free at the module level:
 *  - `extractPdfText`  : bytes → plain text (pdf-parse).
 *  - `extractTradesFromText` : text → ParsedCsv (Anthropic SDK, JSON schema).
 *
 * The server action stitches them together and owns auth + error surfaces.
 *
 * Security: extraction runs server-side only (this module is imported solely
 * from a `'use server'` action). Broker statements contain sensitive financial
 * data; sending them to Anthropic is an explicit user action (the dropzone is
 * labeled "PDF broker statement") and the API key never leaves the server.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ParsedCsv } from '@/lib/csv';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

/** True when an Anthropic API key is configured (server-side only). */
export function isAnthropicConfigured(): boolean {
  return ANTHROPIC_API_KEY.length > 0;
}

/**
 * The model used for extraction. Sonnet-class is the right trade-off for this
 * task: statement parsing needs real reasoning over tabular layout but isn't
 * frontier-difficult, and broker statements can be large. Pin a dated model
 * snapshot so extraction behavior is stable across re-runs.
 */
const EXTRACTION_MODEL = 'claude-sonnet-4-5-20250929';

export interface PdfExtractError {
  message: string;
}

export type PdfExtractResult =
  | ({ ok: true } & ParsedCsv)
  | ({ ok: false } & PdfExtractError);

/**
 * Extract plain text from a PDF buffer. pdf-parse v2's type surface exports
 * pdfjs internals rather than a clean call signature, so we dynamic-import it
 * and read `.text` off the resolved value — isolating the version volatility
 * to this one function. Throws on failure; the action surfaces the message.
 */
export async function extractPdfText(data: Buffer): Promise<string> {
  // Dynamic import keeps pdfjs's Node-only globals out of the module graph at
  // build time, and lets us coerce the loosely-typed default export cleanly.
  const mod = (await import('pdf-parse')) as unknown as {
    (data: Buffer): Promise<{ text?: string }>;
  };
  const result = await mod(data);
  const text = result?.text ?? '';
  if (text.trim() === '') {
    throw new Error(
      'No selectable text found. The PDF may be scanned images — OCR is not supported.',
    );
  }
  return text;
}

/**
 * JSON schema for the structured output. Each trade is a row of strings keyed
 * by column name, mirroring how a CSV lands. Keeping cells as strings means
 * the existing `buildTradesFromCsv` normalization (parseNumber, enum value
 * maps) runs unchanged — the model doesn't have to know our decimal/enum
 * rules, it just reports what the statement says.
 *
 * `additionalProperties: false` on both levels makes the contract tight: the
 * model can't smuggle extra keys past the column header set.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headers: {
      type: 'array',
      description: 'Column header names exactly as they appear in the statement.',
      items: { type: 'string' },
    },
    rows: {
      type: 'array',
      description: 'One element per trade/executed lot; each is a cell value per header, in header order.',
      items: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
  required: ['headers', 'rows'],
} as const;

/** The instruction block that frames the extraction task. */
const SYSTEM_PROMPT = [
  'You extract executed-trade rows from broker statement text into a table.',
  'Return a JSON object with two fields:',
  '"headers": the column names from the statement (e.g. Symbol, Side, Qty, Fill Price, P&L, Date),',
  '"rows": one array per trade, each an array of cell strings in the same order as headers.',
  'Rules:',
  '- Include only executed trades or lots — skip balances, fees, cash moves, headers, totals, and page chrome.',
  '- Preserve the statement\'s own column names in "headers"; do not rename them.',
  '- Use empty strings for missing cells; keep every row the same length as headers.',
  '- Keep numbers exactly as printed (with currency symbols, commas, signs) — do not convert or compute.',
  '- If no trades are present, return { "headers": [], "rows": [] }. Never invent trades.',
].join('\n');

/**
 * Send extracted PDF text to Claude with a JSON-schema structured-output
 * request and coerce the response into a `ParsedCsv`. Returns a result union
 * so the action can branch without try/catch noise.
 *
 * `numericColumns` is recomputed heuristically here so the preview table can
 * right-align numeric columns exactly as it does for CSVs. The heuristic is
 * deliberately lenient: a column the model returns is numeric if at least
 * half its non-empty cells parse as numbers.
 */
export async function extractTradesFromText(
  text: string,
): Promise<PdfExtractResult> {
  if (!isAnthropicConfigured()) {
    return { ok: false, message: 'Anthropic API key is not configured.' };
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      output_config: {
        format: {
          type: 'json_schema',
          schema: RESPONSE_SCHEMA as { [key: string]: unknown },
        },
      },
      messages: [
        {
          role: 'user',
          content: `Broker statement text:\n\n${text}`,
        },
      ],
    });
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Anthropic request failed: ${err.message}`
          : 'Anthropic request failed.',
    };
  }

  const block = message.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') {
    return {
      ok: false,
      message: 'The model returned no extractable content.',
    };
  }

  let parsed: { headers: string[]; rows: string[][] };
  try {
    parsed = JSON.parse(block.text) as { headers: string[]; rows: string[][] };
  } catch {
    return { ok: false, message: 'The model response was not valid JSON.' };
  }

  if (
    !Array.isArray(parsed.headers) ||
    !Array.isArray(parsed.rows) ||
    parsed.headers.length === 0
  ) {
    return { ok: false, message: 'No trade rows found in the statement.' };
  }

  const headers = parsed.headers.map((h) => String(h || '').trim() || 'column');
  // Normalize every row to the header length (pad short rows, drop trailing
  // cells from long ones) so the downstream builder can index by position.
  // Drop fully-empty rows — the model occasionally emits page-break artifacts
  // as blank rows, which would clutter the preview only to be skipped later.
  const rows = parsed.rows
    .filter(Array.isArray)
    .map((row) =>
      headers.map((_, i) => {
        const cell = row[i];
        return cell == null ? '' : String(cell).trim();
      }),
    )
    .filter((row) => row.some((cell) => cell !== ''));

  if (rows.length === 0) {
    return { ok: false, message: 'No trade rows found in the statement.' };
  }

  const numericColumns = headers.map((_, i) => isNumericColumn(rows, i));

  return {
    ok: true,
    headers,
    rows,
    numericColumns,
    rowCount: rows.length,
  };
}

/**
 * Conservative numeric-column detector for the PDF path. Mirrors the rule in
 * lib/csv.ts but is inlined here so the PDF module is self-contained — the
 * lib/csv.ts detector is coupled to the CSV parse path and we don't want to
 * thread a second dependency through. A column is numeric when ≥50% of its
 * non-empty cells parse as finite numbers after stripping currency/sign noise.
 */
function isNumericColumn(rows: string[][], colIndex: number): boolean {
  let nonEmpty = 0;
  let numeric = 0;
  for (const row of rows) {
    const cell = row[colIndex];
    if (cell == null || cell === '') continue;
    nonEmpty++;
    if (isNumericCell(cell)) numeric++;
  }
  if (nonEmpty === 0) return false;
  return numeric / nonEmpty >= 0.5;
}

const NUMERIC_CELL_RE = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^\.\d+$/;

function isNumericCell(value: string): boolean {
  const core = value
    .trim()
    .replace(/^[+\-$€£¥\s]+/, '')
    .replace(/[+\-$€£¥%\s]+$/, '');
  if (core === '') return false;
  return NUMERIC_CELL_RE.test(core);
}
