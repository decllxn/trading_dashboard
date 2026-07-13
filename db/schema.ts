/**
 * Drizzle schema — single source of truth for the Postgres tables.
 *
 * Phases 2a (trades), 2b (tags + trade_tags), 2c (journal_entries +
 * journal_trade_links), and 2d (broker_connections) live here. Phase 2 is now
 * complete; later phases append to this file. Do not split schemas across
 * modules — Drizzle reads the whole `db/schema.ts` as one graph.
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
  boolean,
  date,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export type AnnotationType = 'fvg' | 'ob';
export interface ChartAnnotation {
  id: string;
  type: AnnotationType;
  time1: number;
  price1: number;
  time2: number;
  price2: number;
}

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

  // User-drawn chart annotations for this trade (FVG, OB)
  annotations: jsonb('annotations').$type<ChartAnnotation[]>().default([]),

  // Forward reference: Phase 2d adds the broker_connections table and this
  // becomes a real FK. Kept nullable + untyped for now so open/manual trades
  // (the vast majority) carry no broker linkage.
  brokerConnectionId: uuid('broker_connection_id').references(
    () => brokerConnections.id,
    { onDelete: 'set null' },
  ),

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

/**
 * journal_entries — one rich-text note per calendar day, authored in Tiptap
 * (Phase 7a). `content` stores the Tiptap document as JSONB; `date` is a bare
 * date (no time/tz) because the journal is a daily journal — one entry per day.
 * The (user_id, date) unique constraint enforces "one entry per day per user".
 *
 * `mood` is a free-text label (e.g. an emotion-tag name from the 2b seed). It's
 * nullable so an entry need not declare a mood. Phase 7c formalizes the link to
 * the emotion tags.
 */
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    // Bare date — the journal is day-granular. Stored as YYYY-MM-DD.
    date: date('date').notNull(),
    // Tiptap JSON document. Typed as `unknown` until Phase 7a pins the
    // editor's concrete TiptapDoc type here via `$type<TiptapDoc>()`.
    content: jsonb('content'),
    textContent: text('text_content'),
    mood: text('mood'),
    mistakes: jsonb('mistakes').$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('journal_entries_user_date_uidx').on(t.userId, t.date)],
);

/**
 * journal_trade_links — many-to-many between journal entries and trades, so a
 * note can reference specific trades. Composite PK on (journal_entry_id,
 * trade_id) prevents linking the same trade twice. Both FKs CASCADE.
 */
export const journalTradeLinks = pgTable(
  'journal_trade_links',
  {
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    tradeId: uuid('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.journalEntryId, t.tradeId] })],
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type JournalTradeLink = typeof journalTradeLinks.$inferSelect;
export type NewJournalTradeLink = typeof journalTradeLinks.$inferInsert;

/**
 * broker_provider — how a brokerage link is managed. `snaptrade` = the
 * connection flows through SnapTrade (Phase 8a); `manual` = the user typed the
 * broker name themselves with no live linkage (e.g. for CSV import provenance).
 */
export const brokerProviderEnum = pgEnum('broker_provider', [
  'snaptrade',
  'manual',
]);

/**
 * broker_connection_status — the lifecycle state of a brokerage link.
 * `active` = connected and syncing; `error` = the last sync failed (auth
 * revoked, broker outage); `disconnected` = the user or broker revoked the
 * link. Trades keep referencing the row (their `broker_connection_id` stays
 * populated) regardless of status — status only governs whether Phase 8 syncs
 * pull fresh data.
 */
export const brokerConnectionStatusEnum = pgEnum('broker_connection_status', [
  'active',
  'error',
  'disconnected',
]);

/**
 * broker_connections — a user's linked brokerage accounts. Populated in Phase 8
 * (SnapTrade connection flow); the schema is finalized here. `trades.
 * broker_connection_id` references this table `ON DELETE SET NULL`, so deleting
 * a connection preserves trade history (the trade just loses its link).
 *
 * `external_account_id` is the broker-side identifier (e.g. SnapTrade account
 * reference); nullable because `manual` connections have none. `last_synced_at`
 * is null until the first successful sync.
 */
export const brokerConnections = pgTable(
  'broker_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    provider: brokerProviderEnum('provider').notNull(),
    externalAccountId: text('external_account_id'),
    brokerName: text('broker_name').notNull(),
    status: brokerConnectionStatusEnum('status').notNull().default('active'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('broker_connections_user_provider_external_account_uidx').on(
      t.userId,
      t.provider,
      t.externalAccountId,
    ),
  ],
);

export type BrokerConnection = typeof brokerConnections.$inferSelect;
export type NewBrokerConnection = typeof brokerConnections.$inferInsert;
/** Union of valid broker_provider values: 'snaptrade' | 'manual'. */
export type BrokerProvider = (typeof brokerProviderEnum.enumValues)[number];
/** 'active' | 'error' | 'disconnected'. */
export type BrokerConnectionStatus =
  (typeof brokerConnectionStatusEnum.enumValues)[number];

/**
 * snaptrade_users — server-only credentials for the SnapTrade commercial flow.
 *
 * SnapTrade issues one secret for each registered end user. The record is
 * intentionally kept separate from broker_connections: one SnapTrade identity
 * can own multiple brokerage accounts. No RLS policy grants browser clients
 * access to this table; only server code using the database connection reads it.
 */
export const snaptradeUsers = pgTable('snaptrade_users', {
  userId: uuid('user_id').primaryKey().notNull(),
  userSecret: text('user_secret').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SnaptradeUser = typeof snaptradeUsers.$inferSelect;

/**
 * csv_mappings — one saved CSV column-mapping per (user, broker_name) for the
 * Phase 4 import flow. `mapping` is `{ tradesField: sourceColumnHeader }`,
 * keyed by header STRING so a saved mapping survives column reordering /
 * relabeling between re-exports. (user_id, broker_name) is unique, so
 * re-importing from the same broker refreshes the saved mapping in place.
 *
 * `trades.source = 'csv'` marks rows inserted via this flow; the mapping row
 * is provenance, not a hard FK (a user may delete a mapping without losing
 * imported trades).
 */
export const csvMappings = pgTable(
  'csv_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    brokerName: text('broker_name').notNull(),
    mapping: jsonb('mapping').$type<Record<string, string>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('csv_mappings_user_broker_uidx').on(t.userId, t.brokerName)],
);

export type CsvMapping = typeof csvMappings.$inferSelect;
export type NewCsvMapping = typeof csvMappings.$inferInsert;

/**
 * user_settings — global preferences per user.
 */
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().notNull(),
  chartSessionsEnabled: boolean('chart_sessions_enabled')
    .notNull()
    .default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;

/**
 * market_data_cache — server-side daily-refresh cache for market data (Alpaca + Twelve Data).
 *
 * Caches stock (SPY) and forex price series JSON arrays so page loads do not hit
 * external APIs on every refresh. Primary key is a composite of (symbol, timeframe).
 */
export const marketDataCache = pgTable(
  'market_data_cache',
  {
    symbol: text('symbol').notNull(),
    timeframe: text('timeframe').notNull(), // e.g. '1D', '1Hour'
    data: jsonb('data').$type<{ time: string; value: number }[]>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.timeframe] })]
);

export type MarketDataCache = typeof marketDataCache.$inferSelect;
export type NewMarketDataCache = typeof marketDataCache.$inferInsert;

