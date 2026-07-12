import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { CsvImporter, type SavedBrokerMapping } from '@/components/csv-import/csv-importer';
import { listBrokerMappings } from './actions';

export const dynamic = 'force-dynamic';

/**
 * CSV import page (Phase 4a preview + 4b mapping).
 *
 * Preloads the user's saved broker mappings server-side so the importer can
 * (a) autocomplete the broker-name field and (b) auto-apply a matching saved
 * mapping the moment the user selects a known broker. Parsing and mapping
 * edits are client-side; the actual insert + mapping upsert happen in the
 * `importCsvTrades` server action on commit.
 */
export default async function ImportCsvPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
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
          Drop a broker CSV, map its columns, and import. Parsing happens in
          your browser; the mapping is saved per broker for next time.
        </p>
      </header>

      <CsvImporter savedMappings={savedMappings} />
    </main>
  );
}
