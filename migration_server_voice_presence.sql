-- Shared voice roster for channel sidebars. Run after
-- migration_server_roles_permissions.sql and migration_server_operations.sql.
CREATE TABLE IF NOT EXISTS public.server_voice_presence (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  microphone_enabled boolean NOT NULL DEFAULT false,
  deafened boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS server_voice_presence_server_updated_idx
  ON public.server_voice_presence(server_id, updated_at DESC);

ALTER TABLE public.server_voice_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view voice presence" ON public.server_voice_presence;
CREATE POLICY "Members can view voice presence" ON public.server_voice_presence
  FOR SELECT TO authenticated USING (public.has_channel_permission(channel_id, 'view_channel'));
DROP POLICY IF EXISTS "Users manage own voice presence" ON public.server_voice_presence;
REVOKE INSERT, UPDATE, DELETE ON public.server_voice_presence FROM authenticated, anon;
GRANT SELECT ON public.server_voice_presence TO authenticated;

CREATE OR REPLACE FUNCTION public.set_server_voice_presence(
  server_uuid uuid,
  channel_uuid uuid,
  mic_enabled boolean,
  is_deafened boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_server_member(server_uuid) THEN
    RAISE EXCEPTION 'Sunucu üyeliği gerekli';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = channel_uuid AND c.server_id = server_uuid AND c.type = 'voice'
  ) OR NOT public.has_channel_permission(channel_uuid, 'view_channel')
    OR NOT public.has_channel_permission(channel_uuid, 'connect') THEN
    RAISE EXCEPTION 'Bu ses kanalına erişim iznin yok';
  END IF;
  INSERT INTO public.server_voice_presence(server_id, channel_id, user_id, microphone_enabled, deafened, updated_at)
  VALUES(server_uuid, channel_uuid, auth.uid(), coalesce(mic_enabled, false), coalesce(is_deafened, false), now())
  ON CONFLICT (channel_id, user_id) DO UPDATE SET
    server_id = EXCLUDED.server_id,
    microphone_enabled = EXCLUDED.microphone_enabled,
    deafened = EXCLUDED.deafened,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_server_voice_presence(uuid, uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_server_voice_presence(uuid, uuid, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_server_voice_presence(channel_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
  DELETE FROM public.server_voice_presence WHERE channel_id = channel_uuid AND user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.clear_server_voice_presence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_server_voice_presence(uuid) TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.server_voice_presence;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Remove abandoned rows after clients have not refreshed for one minute.
DELETE FROM public.server_voice_presence WHERE updated_at < now() - interval '1 minute';
