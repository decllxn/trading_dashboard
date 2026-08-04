-- 0014_highest_achieved_level.sql
-- Add highest_achieved_level to user_settings for sticky level demotion buffer

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS highest_achieved_level integer NOT NULL DEFAULT 0;
