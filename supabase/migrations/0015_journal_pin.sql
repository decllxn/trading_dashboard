-- Migration 0015: Add optional 4-digit journal_pin to user_settings table
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS journal_pin text;
