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

## Phase 2b — tags + trade_tags

Apply the tags migration the same way (SQL editor):

1. Paste [`../supabase/migrations/0001_tags.sql`](../supabase/migrations/0001_tags.sql) → **Run**.
2. Paste [`../supabase/verify_tags_rls.sql`](../supabase/verify_tags_rls.sql) → **Run**. Expect:

```
seeded tags for new user: 12  (expected 12)
PASS: default tag set seeded on signup
PASS: seeded rows match canonical names/categories
PASS: intruder sees only their own tags (12, not 24)
PASS: cannot link own trade to another user's tag
RESULT: ALL CHECKS PASSED
```

This proves the three 2b requirements: the signup trigger plants the 12 default tags, tag rows are user-scoped via RLS, and the join table can't be used to reference another user's tag.

**Default tag set** (canonical list in [`seed-tags.ts`](./seed-tags.ts)): ICT concepts (Order Block, FVG, Liquidity Sweep, Breaker, Mitigation Block), sessions (London, New York, Asia), emotions (Disciplined, FOMO, Revenge Trade, Hesitant). The `setup` category is intentionally empty — setups are user-defined strategy names.

The seed fires from an `AFTER INSERT ON auth.users` trigger (`seed_default_tags()`), so it works identically for email/password, OAuth, and admin-created users, and regardless of email-confirmation settings. To add/rename a default later, edit both `db/seed-tags.ts` and the `INSERT` in `0001_tags.sql`'s seed function, then re-run the migration (it's idempotent via `ON CONFLICT DO NOTHING`).

## Phase 2c — journal_entries + journal_trade_links

Apply the journal migration the same way (SQL editor):

1. Paste [`../supabase/migrations/0002_journal.sql`](../supabase/migrations/0002_journal.sql) → **Run**.
2. Paste [`../supabase/verify_journal_rls.sql`](../supabase/verify_journal_rls.sql) → **Run**. Expect:

```
PASS: owner sees their own journal entry
PASS: intruder sees none of the owner's entries
PASS: duplicate same-day entry rejected (one entry/day/user)
PASS: cannot link own entry to another user's trade
RESULT: ALL CHECKS PASSED
```

This proves the three 2c requirements: `journal_entries` is user-scoped via RLS, the one-entry-per-day-per-user constraint holds, and `journal_trade_links` can't bridge a user's entry to another user's trade.

**Schema notes.** `date` is a bare `DATE` (the journal is day-granular — one entry per day). `content` is JSONB storing a Tiptap document; Phase 7a pins a concrete TS type on it. `mood` is free text for now (Phase 7c links it to the emotion tags from 2b).

## Phase 2d — broker_connections

Apply the broker migration the same way (SQL editor):

1. Paste [`../supabase/migrations/0003_broker_connections.sql`](../supabase/migrations/0003_broker_connections.sql) → **Run**.
2. Paste [`../supabase/verify_broker_rls.sql`](../supabase/verify_broker_rls.sql) → **Run**. Expect:

```
PASS: owner sees their own broker connection
PASS: intruder sees only their own connection (not owner's)
PASS: deleting connection nulled trade.broker_connection_id (trade preserved)
RESULT: ALL CHECKS PASSED
```

This migration also wires the forward FK left dangling in `0000_trades.sql`: `trades.broker_connection_id → broker_connections(id) ON DELETE SET NULL`. Deleting a connection preserves the trade and nulls its reference (Phase 8 populates the rows). This completes Phase 2 — the full data model is now in place.

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
