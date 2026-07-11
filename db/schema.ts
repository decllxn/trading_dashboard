/**
 * Drizzle schema — single source of truth for the Postgres tables.
 *
 * Phases 2a (trades) and 2b (tags + trade_tags) live here. Later phases (2c
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
 * - Join tables (e.g. trade_tags) reference user-scoped tables via Drizzle's
 *   `.references()` with `ON DELETE CASCADE` so deleting a trade or tag cleans
 *   up its join rows automatically.
 */
import {
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
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
/** Union of valid asset_class values: 'equity' | 'forex' | 'futures' | 'crypto' | 'option'. */
export type AssetClass = (typeof assetClassEnum.enumValues)[number];
/** 'long' | 'short'. */
export type Direction = (typeof directionEnum.enumValues)[number];
/** 'open' | 'closed'. */
export type TradeStatus = (typeof tradeStatusEnum.enumValues)[number];
/** 'manual' | 'csv' | 'snaptrade'. */
export type TradeSource = (typeof tradeSourceEnum.enumValues)[number];

/**
 * tag_category — the facet of a trade a tag describes. Stored as a native
 * Postgres enum so invalid values are rejected at the DB layer. `setup` =
 * user-defined strategy/setups (the default seed leaves this empty for the
 * user to fill in); `ict_concept`, `session`, `emotion` are pre-seeded.
 */
export const tagCategoryEnum = pgEnum('tag_category', [
  'setup',
  'ict_concept',
  'session',
  'emotion',
]);

/**
 * tags — user-scoped labels applied to trades (many-to-many via trade_tags).
 * One row per (user, name, category); the unique index below enforces no
 * duplicates within a user. Seeded automatically on signup — see
 * db/seed-tags.ts for the canonical default set and supabase/migrations/
 * 0001_tags.sql for the trigger that plants it.
 */
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  category: tagCategoryEnum('category').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * trade_tags — many-to-many between trades and tags. Composite PK on
 * (trade_id, tag_id) prevents a tag from being applied twice to the same
 * trade. Both FKs CASCADE, so deleting either side removes the join row.
 */
export const tradeTags = pgTable(
  'trade_tags',
  {
    tradeId: uuid('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.tagId] })],
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
/** Union of valid tag_category values: 'setup' | 'ict_concept' | 'session' | 'emotion'. */
export type TagCategory = (typeof tagCategoryEnum.enumValues)[number];
export type TradeTag = typeof tradeTags.$inferSelect;
export type NewTradeTag = typeof tradeTags.$inferInsert;
