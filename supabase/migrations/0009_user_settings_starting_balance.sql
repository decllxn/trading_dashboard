-- 0009_user_settings_starting_balance.sql — account starting capital
--
-- Adds `starting_balance` to user_settings so the dashboard equity curve can
-- reflect real account equity (starting capital + cumulative closed-trade P&L)
-- instead of an arbitrary hardcoded $100,000.
--
-- Nullable: existing rows and pre-column accounts fall back to the app default
-- (STARTING_BALANCE_DEFAULT in lib/stats.ts). Users set their own value on the
-- Settings page; the server action upserts into this column.
--
-- `user_settings` already has RLS + user-scoped policies (restored in 0005),
-- so the column inherits the same owner-only access — no new policies needed.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS starting_balance numeric(20, 8);
