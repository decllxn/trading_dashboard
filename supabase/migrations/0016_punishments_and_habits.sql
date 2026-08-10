-- Migration 0016: Punishments and Good Habits tables

-- Enable punishment_status enum if not exists
DO $$ BEGIN
  CREATE TYPE punishment_status AS ENUM ('active', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. Create good_habits table
CREATE TABLE IF NOT EXISTS public.good_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  streak_days integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS for good_habits
ALTER TABLE public.good_habits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own good habits"
    ON public.good_habits
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create punishments table
CREATE TABLE IF NOT EXISTS public.punishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  task_description text NOT NULL,
  target_trade_count integer NOT NULL DEFAULT 30,
  target_essay_word_count integer NOT NULL DEFAULT 3000,
  essay_text text NOT NULL DEFAULT '',
  status punishment_status NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

-- RLS for punishments
ALTER TABLE public.punishments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own punishments"
    ON public.punishments
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create punishment_trades table
CREATE TABLE IF NOT EXISTS public.punishment_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punishment_id uuid NOT NULL REFERENCES public.punishments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  pair text NOT NULL,
  direction direction NOT NULL,
  time_formed timestamp with time zone NOT NULL,
  daily_pd_array text NOT NULL,
  entry_pd_array text NOT NULL,
  time_taken_to_tap text NOT NULL,
  entry_price numeric(20, 8),
  stop_loss numeric(20, 8),
  take_profit numeric(20, 8),
  planned_rr numeric(10, 4),
  realized_rr numeric(10, 4),
  pnl numeric(20, 8),
  time_in_drawdown text,
  killzone text,
  displacement_score integer,
  liquidity_swept text,
  notes text,
  images jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.punishment_trades ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

-- RLS for punishment_trades
ALTER TABLE public.punishment_trades ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own punishment trades"
    ON public.punishment_trades
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
