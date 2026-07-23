-- Migration: 0011_trades_pretrade_checklist.sql
-- Add pretrade_checklist jsonb column to trades table

ALTER TABLE trades ADD COLUMN IF NOT EXISTS pretrade_checklist jsonb DEFAULT '[]'::jsonb;
