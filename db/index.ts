/**
 * Typed Drizzle client, scoped to the current process.
 *
 * Uses the `postgres` (postgres.js) driver against the Supabase Postgres
 * pooler. Reads `DATABASE_URL` (the pooler connection string — see db/README.md
 * for where to find it). Returns a null client + `isDbConfigured = false` when
 * the var is unset, so routes that only need auth (the current state of the
 * app) never crash on a missing DB URL.
 *
 * The client is cached on `globalThis` so Next.js dev HMR reuses one
 * connection pool across refreshes instead of leaking a new one per reload —
 * the same pattern used by lib/supabase.ts for the browser Supabase client.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.ts';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

/** True only when a Postgres connection string is present. */
export function isDbConfigured(): boolean {
  return DATABASE_URL.length > 0;
}

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Build a fresh pool + Drizzle instance. Caller guards on isDbConfigured();
 * this function assumes DATABASE_URL is set and valid.
 *
 * `prepare: false` is required for Supabase's PgBouncer/Supavisor pooler
 * (transaction mode) — named prepared statements don't survive pooling.
 */
function buildDb(): DbClient {
  const queryClient = postgres(DATABASE_URL, { prepare: false });
  return drizzle(queryClient, { schema });
}

declare global {
  // eslint-disable-next-line no-var
  var __drizzleDb: DbClient | null | undefined;
}

/**
 * The Drizzle client, or null when DATABASE_URL is unset. App code MUST
 * null-check before querying until every deploy has the var wired.
 */
export const db: DbClient | null = isDbConfigured()
  ? (globalThis.__drizzleDb ??= buildDb())
  : null;

export * from './schema.ts';
