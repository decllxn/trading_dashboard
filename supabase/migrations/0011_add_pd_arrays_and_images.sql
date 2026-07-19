-- 0011_add_pd_arrays_and_images.sql
--
-- Adds daily_pd_array, one_hour_pd_array, and images to the `trades` table.
-- Also creates a public storage bucket `trade-screenshots` for upload and viewing of screenshots.

-- Add the new columns to the trades table if they do not exist
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS daily_pd_array text,
  ADD COLUMN IF NOT EXISTS one_hour_pd_array text,
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

-- Ensure the storage bucket `trade-screenshots` is created
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trade-screenshots',
  'trade-screenshots',
  true,
  10485760, -- 10MB limit
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage objects on the new bucket
-- We drop existing policies to make this script safely re-runnable (idempotent)
DROP POLICY IF EXISTS "Allow public read access to trade screenshots" ON storage.objects;
CREATE POLICY "Allow public read access to trade screenshots"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'trade-screenshots');

DROP POLICY IF EXISTS "Allow authenticated users to upload screenshots" ON storage.objects;
CREATE POLICY "Allow authenticated users to upload screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'trade-screenshots');

DROP POLICY IF EXISTS "Allow users to delete their own screenshots" ON storage.objects;
CREATE POLICY "Allow users to delete their own screenshots"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'trade-screenshots' AND owner = auth.uid());
