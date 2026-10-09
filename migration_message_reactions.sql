-- Adds real, per-user reactions for server channels and direct messages.
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🎉')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_channel_message_idx
  ON public.message_reactions (channel_id, message_id);

CREATE TABLE IF NOT EXISTS public.dm_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_channel_id uuid NOT NULL REFERENCES public.dm_channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.dm_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🎉')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS dm_message_reactions_channel_message_idx
  ON public.dm_message_reactions (dm_channel_id, message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_message_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.dm_message_reactions TO authenticated;

DROP POLICY IF EXISTS "Members can read channel reactions" ON public.message_reactions;
CREATE POLICY "Members can read channel reactions" ON public.message_reactions
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.channels c ON c.id = m.channel_id
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE m.id = message_reactions.message_id
      AND c.id = message_reactions.channel_id
      AND sm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Members can react in visible channels" ON public.message_reactions;
CREATE POLICY "Members can react in visible channels" ON public.message_reactions
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.channels c ON c.id = m.channel_id
    JOIN public.server_members sm ON sm.server_id = c.server_id
    WHERE m.id = message_reactions.message_id
      AND c.id = message_reactions.channel_id
      AND sm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can remove their own channel reactions" ON public.message_reactions;
CREATE POLICY "Users can remove their own channel reactions" ON public.message_reactions
FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "DM participants can read reactions" ON public.dm_message_reactions;
CREATE POLICY "DM participants can read reactions" ON public.dm_message_reactions
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.dm_messages m
    JOIN public.dm_channels d ON d.id = m.dm_channel_id
    WHERE m.id = dm_message_reactions.message_id
      AND d.id = dm_message_reactions.dm_channel_id
      AND auth.uid() IN (d.user1_id, d.user2_id)
  )
);

DROP POLICY IF EXISTS "DM participants can react" ON public.dm_message_reactions;
CREATE POLICY "DM participants can react" ON public.dm_message_reactions
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.dm_messages m
    JOIN public.dm_channels d ON d.id = m.dm_channel_id
    WHERE m.id = dm_message_reactions.message_id
      AND d.id = dm_message_reactions.dm_channel_id
      AND auth.uid() IN (d.user1_id, d.user2_id)
  )
);

DROP POLICY IF EXISTS "Users can remove their own DM reactions" ON public.dm_message_reactions;
CREATE POLICY "Users can remove their own DM reactions" ON public.dm_message_reactions
FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.dm_message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_message_reactions;
  END IF;
END $$;
