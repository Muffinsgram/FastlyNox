-- Persistent per-user read cursors for server messages and @here mentions.
-- Run after migration_chat_mentions_notifications.sql and
-- migration_realtime_sync_reliability.sql and migration_server_roles_permissions.sql
-- in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.server_channel_read_states (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS messages_channel_created_at_idx
  ON public.messages (channel_id, created_at DESC);

ALTER TABLE public.server_channel_read_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.server_channel_read_states FROM anon, authenticated;

DROP POLICY IF EXISTS "Users read their server channel cursors" ON public.server_channel_read_states;
CREATE POLICY "Users read their server channel cursors"
  ON public.server_channel_read_states FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Existing members start with a clean unread baseline when this feature rolls out.
INSERT INTO public.server_channel_read_states (user_id, channel_id, last_read_at)
SELECT sm.user_id, c.id, now()
FROM public.server_members sm
JOIN public.channels c ON c.server_id = sm.server_id AND c.type = 'text'
ON CONFLICT (user_id, channel_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_server_channel_read_states()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'server_members' THEN
    INSERT INTO public.server_channel_read_states (user_id, channel_id, last_read_at)
    SELECT NEW.user_id, c.id, now()
    FROM public.channels c
    WHERE c.server_id = NEW.server_id AND c.type = 'text'
    ON CONFLICT (user_id, channel_id) DO NOTHING;
  ELSE
    INSERT INTO public.server_channel_read_states (user_id, channel_id, last_read_at)
    SELECT sm.user_id, NEW.id, now()
    FROM public.server_members sm
    WHERE NEW.type = 'text'
      AND sm.server_id = NEW.server_id
    ON CONFLICT (user_id, channel_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_read_states_for_server_member ON public.server_members;
CREATE TRIGGER seed_read_states_for_server_member
  AFTER INSERT ON public.server_members
  FOR EACH ROW EXECUTE FUNCTION public.seed_server_channel_read_states();

DROP TRIGGER IF EXISTS seed_read_states_for_text_channel ON public.channels;
CREATE TRIGGER seed_read_states_for_text_channel
  AFTER INSERT ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.seed_server_channel_read_states();

CREATE OR REPLACE FUNCTION public.get_my_server_unread_counts()
RETURNS TABLE (server_id uuid, channel_id uuid, unread_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.server_id, c.id, count(m.id)::bigint
  FROM public.channels c
  JOIN public.server_members sm ON sm.server_id = c.server_id AND sm.user_id = auth.uid()
  LEFT JOIN public.server_channel_read_states rs ON rs.channel_id = c.id AND rs.user_id = auth.uid()
  LEFT JOIN public.messages m ON m.channel_id = c.id
    AND m.user_id <> auth.uid()
    AND m.created_at > coalesce(rs.last_read_at, now())
  WHERE auth.uid() IS NOT NULL AND c.type = 'text'
    AND public.has_channel_permission(c.id, 'view_channel')
  GROUP BY c.server_id, c.id;
$$;

CREATE OR REPLACE FUNCTION public.mark_server_channel_read(channel_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target_server_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT c.server_id INTO target_server_id
  FROM public.channels c WHERE c.id = channel_uuid AND c.type = 'text';
  IF target_server_id IS NULL OR NOT public.is_server_member(target_server_id)
    OR NOT public.has_channel_permission(channel_uuid, 'view_channel') THEN
    RAISE EXCEPTION 'Channel access denied';
  END IF;
  INSERT INTO public.server_channel_read_states (user_id, channel_id, last_read_at)
  VALUES (auth.uid(), channel_uuid, now())
  ON CONFLICT (user_id, channel_id) DO UPDATE SET
    last_read_at = greatest(public.server_channel_read_states.last_read_at, EXCLUDED.last_read_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_server_channels_read()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.server_channel_read_states (user_id, channel_id, last_read_at)
  SELECT auth.uid(), c.id, now()
  FROM public.channels c
  JOIN public.server_members sm ON sm.server_id = c.server_id AND sm.user_id = auth.uid()
  WHERE c.type = 'text'
  ON CONFLICT (user_id, channel_id) DO UPDATE SET
    last_read_at = greatest(public.server_channel_read_states.last_read_at, EXCLUDED.last_read_at);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_server_unread_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_server_channel_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_server_channels_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_server_unread_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_server_channel_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_server_channels_read() TO authenticated;

-- Rebuild the server mention recipient set with @here support. @everyone and
-- @here require the same server-wide mention permission; @here targets only
-- members with a live online/idle/DND presence session.
CREATE OR REPLACE FUNCTION public.notify_server_message_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_server_id uuid;
  sender_name text;
  sender_role text;
  is_everyone boolean;
  is_here boolean;
BEGIN
  IF coalesce(trim(NEW.content), '') = '' THEN RETURN NEW; END IF;
  SELECT c.server_id INTO target_server_id FROM public.channels c WHERE c.id = NEW.channel_id;
  IF target_server_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.username, sm.role INTO sender_name, sender_role
  FROM public.profiles p
  JOIN public.server_members sm ON sm.user_id = p.id AND sm.server_id = target_server_id
  WHERE p.id = NEW.user_id;
  IF sender_name IS NULL THEN RETURN NEW; END IF;

  is_everyone := lower(NEW.content) ~ '(^|[^[:alnum:]_])@everyone([^[:alnum:]_]|$)'
    AND (sender_role IN ('owner', 'admin') OR EXISTS (
      SELECT 1 FROM public.servers s WHERE s.id = target_server_id AND s.owner_id = NEW.user_id
    ));
  is_here := lower(NEW.content) ~ '(^|[^[:alnum:]_])@here([^[:alnum:]_]|$)'
    AND (sender_role IN ('owner', 'admin') OR EXISTS (
      SELECT 1 FROM public.servers s WHERE s.id = target_server_id AND s.owner_id = NEW.user_id
    ));

  INSERT INTO public.notifications (user_id, type, title, body, server_id, channel_id, sender_id, message_id)
    SELECT DISTINCT p.id, 'mention',
      CASE WHEN is_everyone THEN '@everyone etiketi' WHEN is_here THEN '@here etiketi' ELSE 'Senden bahsedildi' END,
      CASE WHEN is_everyone THEN coalesce(sender_name, 'Bir kullanıcı') || ' sunucudaki herkesi etiketledi.'
        WHEN is_here THEN coalesce(sender_name, 'Bir kullanıcı') || ' çevrim içi üyeleri etiketledi.'
        ELSE coalesce(sender_name, 'Bir kullanıcı') || ' bir mesajda senden bahsetti.' END,
      target_server_id, NEW.channel_id, NEW.user_id, NEW.id
    FROM (
      SELECT sm.user_id
      FROM public.server_members sm
      WHERE is_everyone AND sm.server_id = target_server_id
      UNION
      SELECT sm.user_id
      FROM public.server_members sm
      WHERE is_here AND sm.server_id = target_server_id
        AND EXISTS (
          SELECT 1 FROM public.user_presence_sessions ups
          WHERE ups.user_id = sm.user_id
            AND ups.status IN ('online', 'idle', 'dnd')
            AND ups.heartbeat_at > now() - interval '90 seconds'
        )
      UNION
      SELECT tags.capture[1]::uuid AS user_id
      FROM regexp_matches(lower(NEW.content), '<@!?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') AS tags(capture)
      UNION
      SELECT p.id
      FROM regexp_matches(lower(NEW.content), '<@!?([0-9]+)>', 'g') AS tags(capture)
      JOIN public.profiles p ON p.public_id = tags.capture[1]::bigint
      UNION
      SELECT smr.user_id
      FROM regexp_matches(lower(NEW.content), '<@&([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') AS tags(capture)
      JOIN public.server_roles sr ON sr.id = tags.capture[1]::uuid AND sr.server_id = target_server_id
      JOIN public.server_member_roles smr ON smr.role_id = sr.id AND smr.server_id = target_server_id
      WHERE sr.mentionable OR sender_role IN ('owner', 'admin')
        OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = target_server_id AND s.owner_id = NEW.user_id)
      UNION
      SELECT smr.user_id
      FROM regexp_matches(lower(NEW.content), '<@&([0-9]+)>', 'g') AS tags(capture)
      JOIN public.server_roles sr ON sr.public_id = tags.capture[1]::bigint AND sr.server_id = target_server_id
      JOIN public.server_member_roles smr ON smr.role_id = sr.id AND smr.server_id = target_server_id
      WHERE sr.mentionable OR sender_role IN ('owner', 'admin')
        OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = target_server_id AND s.owner_id = NEW.user_id)
      UNION
      SELECT p.id
      FROM regexp_matches(NEW.content, '(^|[^[:alnum:]_])@([[:alnum:]_.-]+)', 'g') AS tags(capture)
      JOIN public.profiles p ON lower(p.username) = lower(tags.capture[2])
      WHERE lower(tags.capture[2]) NOT IN ('everyone', 'here')
    ) AS mentioned
    JOIN public.profiles p ON p.id = mentioned.user_id
    JOIN public.server_members sm ON sm.user_id = p.id AND sm.server_id = target_server_id
    WHERE p.id <> NEW.user_id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;
