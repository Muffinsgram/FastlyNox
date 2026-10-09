-- Realtime reliability additions. Safe to rerun; this migration keeps existing
-- message, friendship, notification, and presence records intact.

-- Per-window presence prevents one tab closing from marking other live tabs offline.
CREATE TABLE IF NOT EXISTS public.user_presence_sessions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('online', 'idle', 'dnd', 'offline')),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS user_presence_sessions_heartbeat_idx
  ON public.user_presence_sessions (heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS user_presence_sessions_user_heartbeat_idx
  ON public.user_presence_sessions (user_id, heartbeat_at DESC);

ALTER TABLE public.user_presence_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_presence_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presence_sessions TO authenticated;

DROP POLICY IF EXISTS "Users read permitted presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Users read permitted presence sessions"
ON public.user_presence_sessions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = user_presence_sessions.user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = user_presence_sessions.user_id))
  )
  OR EXISTS (
    SELECT 1 FROM public.server_members viewer
    JOIN public.server_members target ON target.server_id = viewer.server_id
    WHERE viewer.user_id = auth.uid() AND target.user_id = user_presence_sessions.user_id
  )
);

DROP POLICY IF EXISTS "Users create their own presence session" ON public.user_presence_sessions;
CREATE POLICY "Users create their own presence session"
ON public.user_presence_sessions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update their own presence session" ON public.user_presence_sessions;
CREATE POLICY "Users update their own presence session"
ON public.user_presence_sessions FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users remove their own stale presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Users remove their own stale presence sessions"
ON public.user_presence_sessions FOR DELETE TO authenticated
USING (user_id = auth.uid());

ALTER TABLE public.user_presence_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_channels REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.dm_message_reactions REPLICA IDENTITY FULL;

-- Keep new requests unique in either direction when legacy data permits it.
-- Existing duplicates are reported and left untouched for manual reconciliation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    GROUP BY LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS friendships_undirected_pair_key
      ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
  ELSE
    RAISE NOTICE 'Skipped friendships_undirected_pair_key: duplicate legacy pairs exist; rows were preserved.';
  END IF;
END;
$$;

-- Persist DM unread notifications in the existing notification center.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dm_channel_id uuid REFERENCES public.dm_channels(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notifications_dm_unread_idx
  ON public.notifications (user_id, dm_channel_id, created_at DESC)
  WHERE is_read = false AND dm_channel_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_dm_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recipient_id uuid;
  sender_name text;
  message_preview text;
BEGIN
  SELECT CASE WHEN d.user1_id = NEW.user_id THEN d.user2_id ELSE d.user1_id END
    INTO recipient_id
  FROM public.dm_channels d
  WHERE d.id = NEW.dm_channel_id AND NEW.user_id IN (d.user1_id, d.user2_id);

  IF recipient_id IS NULL OR (coalesce(trim(NEW.content), '') = '' AND NEW.image_url IS NULL) THEN
    RETURN NEW;
  END IF;

  SELECT p.username INTO sender_name FROM public.profiles p WHERE p.id = NEW.user_id;
  message_preview := left(coalesce(nullif(trim(NEW.content), ''), '🖼️ Fotoğraf'), 180);

  INSERT INTO public.notifications (user_id, type, title, body, sender_id, dm_channel_id)
  VALUES (
    recipient_id,
    'dm_message',
    coalesce(sender_name, 'Yeni özel mesaj'),
    message_preview,
    NEW.user_id,
    NEW.dm_channel_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_dm_message_insert ON public.dm_messages;
CREATE TRIGGER notify_dm_message_insert
AFTER INSERT ON public.dm_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_dm_message();

-- Enable the tables whose changes are consumed by authenticated, RLS-scoped clients.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'messages', 'dm_messages', 'dm_channels', 'friendships', 'notifications',
    'user_presence_sessions', 'user_presence_status', 'message_reactions', 'dm_message_reactions'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
      ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
