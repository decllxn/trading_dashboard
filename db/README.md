# Database (Drizzle + Supabase Postgres)

- **Schema source of truth:** [`schema.ts`](./schema.ts) (Drizzle).
- **Canonical migration:** [`../supabase/migrations/0000_trades.sql`](../supabase/migrations/0000_trades.sql) — hand-written, reviewed SQL that includes the `auth.users` FK, RLS policies, and indexes Drizzle can't express.
- **ORM going forward:** Drizzle, for every phase.

## Get your connection string

1. Supabase Dashboard → your project → **Settings → Database**.
2. Under **Connection string**, pick **URI**.
3. Use the **Session pooler** (port `5432`) — it supports everything `drizzle-kit` needs. (The Transaction pooler on `6543` also works because `db/index.ts` sets `prepare: false`.)
4. Replace `[YOUR-PASSWORD]` with the database password you set when creating the project.

Add to `.env.local` (never committed):

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

## Apply the Phase 2a schema

The migration is the source of truth — **apply it in the Supabase SQL editor**, not `drizzle-kit`. The SQL editor migration is what installs RLS, the `auth.users` FK, and the indexes; `drizzle-kit push` only applies the bare column definitions in `schema.ts` (it has no notion of RLS or the `auth.users` reference) so it would create the table *without* protection.

1. Supabase Dashboard → **SQL Editor → New query**.
2. Paste the contents of [`../supabase/migrations/0000_trades.sql`](../supabase/migrations/0000_trades.sql).
3. **Run.** It is idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`), so re-running is safe.

You should see `Success. No rows returned.` That is "migration runs clean."

## Verify RLS (Definition of Done #2)

Still in the SQL editor:

1. **New query** → paste [`../supabase/verify_rls.sql`](../supabase/verify_rls.sql) → **Run**.
2. Open the **Messages** panel. Expect:

```
owner visible:    1  (expected 1)
intruder visible: 0  (expected 0)
PASS: owner sees their own row
PASS: intruder sees none of the owner's rows
RESULT: ALL CHECKS PASSED
```

The script is self-contained — it creates two throwaway `auth.users`, inserts one trade owned by the first, simulates each user's `auth.uid()` via the JWT-claim GUC Supabase's PostgREST reads, asserts owner sees 1 row and the other user sees 0, then deletes all test data. It does **not** require real signups or email confirmation.

If you see `RLS BROKEN`: check that `ALTER TABLE trades ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` both ran, and that the four `trades_*_own` policies exist (`\d+ trades` in the SQL editor).

## Day-to-day dev loop (later phases)

Once the base table exists, use Drizzle for column changes:

```bash
pnpm db:push      # apply schema.ts changes to the live DB (diff-based, prompts first)
pnpm db:studio    # open Drizzle Studio table browser
pnpm db:generate  # emit SQL into ./drizzle for review (git-ignored)
```

> **RLS/FK caveat:** `db:push` reconciles columns only. Any change to RLS
> policies, the `auth.users` FK, or indexes still goes through a reviewed SQL
> migration in `supabase/migrations/`. The generate step is git-ignored — the
> committed migration is always the hand-written one.

| Script | What it does |
|---|---|
| `pnpm db:push` | Apply `schema.ts` column changes to the live DB (dev loop). |
| `pnpm db:studio` | Open Drizzle Studio (local table browser). |
| `pnpm db:generate` | Emit SQL into `./drizzle` for diffing (git-ignored). |
