-- 0010_trades_costs.sql — per-trade carrying costs (commission, swap, fees)
--
-- Adds three nullable numeric columns to `trades` so net P&L can be derived as
-- gross P&L − commission − swap − fees. Keeping them separate (rather than one
-- "costs" column) preserves auditability and matches how brokers report them.
--
-- All nullable: existing rows get NULL, which the app treats as 0 at read time,
-- so existing P&L data is NOT affected. The dashboard equity curve and every
-- stat switch from gross P&L to net P&L once costs are present.
--
-- `trades` already has RLS + user-scoped policies (restored in 0005), so the
-- columns inherit owner-only access — no new policies needed.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS commission numeric(20, 8),
  ADD COLUMN IF NOT EXISTS swap numeric(20, 8),
  ADD COLUMN IF NOT EXISTS fees numeric(20, 8);
