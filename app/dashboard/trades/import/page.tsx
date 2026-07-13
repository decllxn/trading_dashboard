import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { CsvImporter, type SavedBrokerMapping } from '@/components/csv-import/csv-importer';
import { isAnthropicConfigured } from '@/lib/pdf-extract';
import { listBrokerMappings } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Import page (Phase 4a CSV preview + 4b mapping + 4c dedup + 4d PDF).
 *
 * Preloads the user's saved broker mappings server-side so the importer can
 * (a) autocomplete the broker-name field and (b) auto-apply a matching saved
 * mapping the moment the user selects a known broker. `acceptPdf` is true
 * only when the Anthropic key is configured, so the dropzone degrades to
 * CSV-only cleanly when PDF extraction isn't available.
 */
export default async function ImportCsvPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="font-display text-primary text-xl">Import trades</h1>
        <p className="text-secondary mt-2 text-sm">
          Supabase is not configured. Add credentials to{' '}
          <code className="num text-accent-signal">.env.local</code>.
        </p>
      </main>
    );
  }

  const supabase = createServerClient();
  if (!supabase) redirect('/login');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const saved = await listBrokerMappings();
  const savedMappings: ReadonlyArray<SavedBrokerMapping> = saved.map((m) => ({
    brokerName: m.brokerName,
    mapping: m.mapping,
  }));
  const acceptPdf = isAnthropicConfigured();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/dashboard/trades"
        className="text-tertiary hover:text-secondary inline-flex items-center gap-1 text-xs transition-colors duration-150"
      >
        <ChevronLeft size={14} strokeWidth={1.75} />
        Back to trades
      </Link>

      <header className="mt-3 mb-8">
        <h1 className="font-display text-primary text-xl">Import trades</h1>
        <p className="text-secondary mt-1 text-sm">
          Drop a broker CSV or PDF statement, map its columns, and import.
          {acceptPdf
            ? ' CSV parses in your browser; PDF statements are extracted on the server.'
            : ' Parsing happens in your browser; the mapping is saved per broker for next time.'}
        </p>
      </header>

      <CsvImporter savedMappings={savedMappings} acceptPdf={acceptPdf} />
    </main>
  );
}
