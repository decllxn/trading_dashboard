-- 0007_snaptrade_users.sql
--
-- Stores the per-user SnapTrade secret needed by the commercial integration.
-- This table deliberately has RLS enabled with no client policies: the secret
-- must never be available through the browser-facing Supabase client.

CREATE TABLE IF NOT EXISTS snaptrade_users (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_secret text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE snaptrade_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE snaptrade_users FORCE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS broker_connections_user_provider_external_account_uidx
  ON broker_connections (user_id, provider, external_account_id);
