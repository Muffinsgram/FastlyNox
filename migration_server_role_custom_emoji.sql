-- Allows server role emoji values to store a profile-media public URL.
-- Run once in Supabase SQL Editor after migration_server_role_features.sql.
ALTER TABLE public.server_roles
  DROP CONSTRAINT IF EXISTS server_roles_emoji_length_check;

ALTER TABLE public.server_roles
  ADD CONSTRAINT server_roles_emoji_length_check
  CHECK (emoji IS NULL OR length(emoji) <= 512);
