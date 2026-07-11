/**
 * Drizzle schema — single source of truth for the Postgres tables.
 *
 * Phase 2a introduces the `trades` table only. Later phases (2b tags, 2c
 * journal_entries, 2d broker_connections) append to this file; do not split
 * schemas across modules — Drizzle reads the whole `db/schema.ts` as one graph.
 *
 * Conventions enforced here:
 * - Money/price/size columns are `numeric(p, s)` (decimal), never `real`/`double
 *   precision` — floats would corrupt P&L. `pnl` is a *signed* decimal; the UI
 *   paints it gain/loss (#34D399 / #F87171) purely off its sign per
 *   DESIGN_SYSTEM.md. Never store an unsigned magnitude + flag.
 * - All timestamp columns are `timestamp with time zone` (timestamptz) so
 *   values are stored UTC and rendered in the viewer's tz.
 * - `user_id` is the tenant boundary. Every table mirrors the same pattern: a
 *   plain `uuid` column here, with the `REFERENCES auth.users(id) ON DELETE
 *   CASCADE` constraint + RLS authored in supabase/migrations/*.sql. Drizzle
 *   doesn't manage `auth.users` (it's a Supabase system table), so the FK is
 *   declared in raw DDL rather than via `.references()`.
 */
import {
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * asset_class — the market a trade was executed in. Stored as a native
 * Postgres enum so invalid values are rejected at the DB layer, not in app
 * code. Drizzle maps the TS keys to the exact Postgres labels.
 */
export const assetClassEnum = pgEnum('asset_class', [
  'equity',
  'forex',
  'futures',
  'crypto',
  'option',
]);

/** direction — long or short. */
export const directionEnum = pgEnum('direction', ['long', 'short']);

/**
 * trade_status — open or closed. Named `trade_status` (not `status`) to avoid
 * collisions with reserved/ambiguous naming in tooling; the column itself is
 * still `status`.
 */
export const tradeStatusEnum = pgEnum('trade_status', ['open', 'closed']);

/**
 * trade_source — how the row entered the system. `manual` = hand-entered in the
 * trade form (Phase 3), `csv` = imported (Phase 4), `snaptrade` = broker sync
 * (Phase 8).
 */
export const tradeSourceEnum = pgEnum('trade_source', [
  'manual',
  'csv',
  'snaptrade',
]);

/**
 * trades — the core journal row. One row = one round-trip (or currently-open)
 * position. Nullable price/size columns reflect that an open trade may not yet
 * have an exit, and a manual entry may defer values the user fills in later.
 */
export const trades = pgTable('trades', {
  // Surrogate key. gen_random_uuid() ships with Supabase (pgcrypto) so we get
  // UUIDs without a round-trip to a sequence.
  id: uuid('id').primaryKey().defaultRandom(),

  // Tenant scoping. FK to auth.users(id) ON DELETE CASCADE is authored in
  // supabase/migrations/0000_trades.sql (auth.users is a Supabase-managed
  // table, not a Drizzle table). RLS, not this column, gates cross-user access.
  userId: uuid('user_id').notNull(),

  // Ticker / symbol as the user typed it (e.g. "AAPL", "EUR/USD", "ES1!",
  // "BTCUSDT"). Free text — normalization happens in the app layer.
  instrument: text('instrument').notNull(),

  assetClass: assetClassEnum('asset_class').notNull(),
  direction: directionEnum('direction').notNull(),

  // 8 fractional digits covers BTC satoshis and forex micro-lots; 20 total
  // digits covers notional sizes up to ~10^12 with headroom.
  entryPrice: numeric('entry_price', { precision: 20, scale: 8 }),
  exitPrice: numeric('exit_price', { precision: 20, scale: 8 }),
  size: numeric('size', { precision: 20, scale: 8 }),
  stopPrice: numeric('stop_price', { precision: 20, scale: 8 }),
  targetPrice: numeric('target_price', { precision: 20, scale: 8 }),

  entryTime: timestamp('entry_time', { withTimezone: true }),
  exitTime: timestamp('exit_time', { withTimezone: true }),

  // Signed P&L in account currency. UI gain/loss color derives from the sign.
  pnl: numeric('pnl', { precision: 20, scale: 8 }),

  // R-multiple (reward-to-risk). 4 fractional digits is plenty for +/-X.XXXX R.
  rMultiple: numeric('r_multiple', { precision: 10, scale: 4 }),

  status: tradeStatusEnum('status').notNull().default('open'),
  source: tradeSourceEnum('source').notNull().default('manual'),

  // Forward reference: Phase 2d adds the broker_connections table and this
  // becomes a real FK. Kept nullable + untyped for now so open/manual trades
  // (the vast majority) carry no broker linkage.
  brokerConnectionId: uuid('broker_connection_id'),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Type helpers — import these in app code instead of re-deriving from the table. */
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
