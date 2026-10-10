-- Publish speaking transitions to the server member list without requiring
-- every viewer to join the LiveKit room. Apply once in Supabase SQL Editor.
ALTER TABLE public.server_voice_presence
  ADD COLUMN IF NOT EXISTS speaking boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.set_server_voice_presence(uuid, uuid, boolean, boolean);

CREATE OR REPLACE FUNCTION public.set_server_voice_presence(
  server_uuid uuid,
  channel_uuid uuid,
  mic_enabled boolean,
  is_deafened boolean,
  is_speaking boolean
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
  INSERT INTO public.server_voice_presence(server_id, channel_id, user_id, microphone_enabled, deafened, speaking, updated_at)
  VALUES(server_uuid, channel_uuid, auth.uid(), coalesce(mic_enabled, false), coalesce(is_deafened, false), coalesce(is_speaking, false), now())
  ON CONFLICT (channel_id, user_id) DO UPDATE SET
    server_id = EXCLUDED.server_id,
    microphone_enabled = EXCLUDED.microphone_enabled,
    deafened = EXCLUDED.deafened,
    speaking = EXCLUDED.speaking,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_server_voice_presence(uuid, uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_server_voice_presence(uuid, uuid, boolean, boolean, boolean) TO authenticated;

-- Keep old clients working during rollout; their calls simply report silent.
CREATE OR REPLACE FUNCTION public.set_server_voice_presence(
  server_uuid uuid,
  channel_uuid uuid,
  mic_enabled boolean,
  is_deafened boolean
)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.set_server_voice_presence(server_uuid, channel_uuid, mic_enabled, is_deafened, false);
$$;
REVOKE ALL ON FUNCTION public.set_server_voice_presence(uuid, uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_server_voice_presence(uuid, uuid, boolean, boolean) TO authenticated;

UPDATE public.server_voice_presence SET speaking = false;
