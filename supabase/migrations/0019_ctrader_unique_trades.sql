-- Migration: 0019_ctrader_unique_trades.sql
-- Enforce uniqueness on (user_id, external_trade_id) for synced broker trades

-- 1. Deduplicate any existing duplicates (keep earliest)
WITH ranked_trades AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, external_trade_id 
           ORDER BY created_at ASC, id ASC
         ) as rn
  FROM trades
  WHERE external_trade_id IS NOT NULL
)
DELETE FROM trades
WHERE id IN (
  SELECT id FROM ranked_trades WHERE rn > 1
);

-- 2. Backfill entry_time if null for closed trades
UPDATE trades
SET entry_time = exit_time
WHERE entry_time IS NULL AND exit_time IS NOT NULL AND source = 'ctrader';

-- 3. Create partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS trades_user_external_trade_id_uidx 
ON trades (user_id, external_trade_id) 
WHERE external_trade_id IS NOT NULL;
