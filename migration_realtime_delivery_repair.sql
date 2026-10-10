-- Repairs the authorization and publication prerequisites used by live chat.
-- Safe to rerun. It does not change or delete existing messages.

-- Realtime Postgres Changes is authorized using the subscriber's SELECT policy.
-- Keep access limited to channel members and DM participants.
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

GRANT SELECT ON public.messages, public.dm_messages, public.notifications TO authenticated;

DROP POLICY IF EXISTS "Realtime server members can read messages" ON public.messages;
CREATE POLICY "Realtime server members can read messages"
ON public.messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = messages.channel_id
      AND public.is_server_member(c.server_id)
  )
);

DROP POLICY IF EXISTS "Realtime DM participants can read messages" ON public.dm_messages;
CREATE POLICY "Realtime DM participants can read messages"
ON public.dm_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dm_channels d
    WHERE d.id = dm_messages.dm_channel_id
      AND auth.uid() IN (d.user1_id, d.user2_id)
  )
);

DROP POLICY IF EXISTS "Realtime users can read own notifications" ON public.notifications;
CREATE POLICY "Realtime users can read own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- A publication entry and a SELECT grant/policy are all required. Having only
-- the websocket subscription in the client does not enable database events.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'messages', 'dm_messages', 'dm_channels', 'friendships', 'notifications',
    'message_reactions', 'dm_message_reactions', 'server_members'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
