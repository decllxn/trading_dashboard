-- 0010_user_settings_breakeven_threshold.sql — break even threshold preference
--
-- Adds `breakeven_threshold` to user_settings so users can configure what
-- dollar magnitude (e.g. $5.00) counts as a Break Even trade rather than Win/Loss.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS breakeven_threshold numeric(20, 8);
