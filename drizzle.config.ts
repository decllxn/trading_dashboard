/**
 * Drizzle Kit configuration.
 *
 * - `schema`: where Drizzle reads the source-of-truth table definitions.
 * - `out`: where `drizzle-kit generate` writes migration SQL + snapshot meta.
 *   We commit `supabase/migrations` (the reviewed, hand-authored DDL) as the
 *   canonical migrations; `out` points at a git-ignored `drizzle/` so generated
 *   artifacts used only for diffing don't clutter the repo.
 * - `dbCredentials`: read live at run time so `pnpm db:push` / `db:studio`
 *   never need a check-in.
 *
 * Run `pnpm db:push` to apply the schema to Supabase (dev workflow — fast,
 * diff-based). See db/README.md.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
