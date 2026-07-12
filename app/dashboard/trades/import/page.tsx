import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { CsvImporter } from '@/components/csv-import/csv-importer';

export const dynamic = 'force-dynamic';

/**
 * CSV import page (Phase 4a).
 *
 * The page itself only needs a session to gate access — the actual parse and
 * preview are fully client-side (Papaparse in the browser), per the phase's
 * "Done when": dropping a CSV shows an accurate preview without hitting the
 * server. Auth gating mirrors the new-trade page; no trades or tags are read.
 *
 * Column mapping (4b) and dedup/insert (4c) arrive in later phases and will
 * extend this flow after the preview.
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
          Drop a broker CSV to preview it here. Parsing happens locally in your
          browser.
        </p>
      </header>

      <CsvImporter />
    </main>
  );
}
