-- Community feature tables for events, polls, scheduled messages, threads,
-- story activity, and per-server welcome cards. Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.server_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_events_upcoming_idx ON public.server_events (server_id, starts_at);
ALTER TABLE public.server_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_events TO authenticated;
DROP POLICY IF EXISTS "Server members can read events" ON public.server_events;
DROP POLICY IF EXISTS "Members can create events" ON public.server_events;
DROP POLICY IF EXISTS "Event creators and moderators manage events" ON public.server_events;
CREATE POLICY "Server members can read events" ON public.server_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_events.server_id AND sm.user_id = auth.uid()));
CREATE POLICY "Members can create events" ON public.server_events FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid() AND EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_events.server_id AND sm.user_id = auth.uid()) AND (channel_id IS NULL OR EXISTS (SELECT 1 FROM public.channels c WHERE c.id = server_events.channel_id AND c.server_id = server_events.server_id)));
CREATE POLICY "Event creators and moderators manage events" ON public.server_events FOR UPDATE TO authenticated
  USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_events.server_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','admin')))
  WITH CHECK (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_events.server_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','admin')));
CREATE POLICY "Event creators and moderators delete events" ON public.server_events FOR DELETE TO authenticated
  USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_events.server_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','admin')));

CREATE TABLE IF NOT EXISTS public.server_event_rsvps (
  event_id uuid NOT NULL REFERENCES public.server_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going','interested','declined')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
ALTER TABLE public.server_event_rsvps ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_event_rsvps TO authenticated;
DROP POLICY IF EXISTS "Members can see event RSVPs" ON public.server_event_rsvps;
DROP POLICY IF EXISTS "Users manage their own RSVP" ON public.server_event_rsvps;
CREATE POLICY "Members can see event RSVPs" ON public.server_event_rsvps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.server_events e JOIN public.server_members sm ON sm.server_id = e.server_id WHERE e.id = server_event_rsvps.event_id AND sm.user_id = auth.uid()));
CREATE POLICY "Users manage their own RSVP" ON public.server_event_rsvps FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.server_events e JOIN public.server_members sm ON sm.server_id = e.server_id WHERE e.id = server_event_rsvps.event_id AND sm.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.channel_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (length(trim(question)) BETWEEN 1 AND 500),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 8),
  closes_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.channel_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.channel_polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL CHECK (option_index BETWEEN 0 AND 7),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
ALTER TABLE public.channel_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_poll_votes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_polls, public.channel_poll_votes TO authenticated;
DROP POLICY IF EXISTS "Channel members can read polls" ON public.channel_polls;
DROP POLICY IF EXISTS "Members can create polls" ON public.channel_polls;
DROP POLICY IF EXISTS "Creators can delete polls" ON public.channel_polls;
CREATE POLICY "Channel members can read polls" ON public.channel_polls FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = channel_polls.server_id AND sm.user_id = auth.uid()));
CREATE POLICY "Members can create polls" ON public.channel_polls FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid() AND EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = channel_polls.server_id AND sm.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_polls.channel_id AND c.server_id = channel_polls.server_id AND c.type = 'text'));
CREATE POLICY "Creators can delete polls" ON public.channel_polls FOR DELETE TO authenticated USING (creator_id = auth.uid());
DROP POLICY IF EXISTS "Members can read poll votes" ON public.channel_poll_votes;
DROP POLICY IF EXISTS "Users manage their poll vote" ON public.channel_poll_votes;
CREATE POLICY "Members can read poll votes" ON public.channel_poll_votes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.channel_polls p JOIN public.server_members sm ON sm.server_id = p.server_id WHERE p.id = channel_poll_votes.poll_id AND sm.user_id = auth.uid()));
CREATE POLICY "Users manage their poll vote" ON public.channel_poll_votes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.channel_polls p JOIN public.server_members sm ON sm.server_id = p.server_id WHERE p.id = channel_poll_votes.poll_id AND sm.user_id = auth.uid() AND option_index < jsonb_array_length(p.options) AND (p.closes_at IS NULL OR p.closes_at > now())));

CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 4000),
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
DROP POLICY IF EXISTS "Users manage their scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users manage their scheduled messages" ON public.scheduled_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.server_members sm JOIN public.channels c ON c.server_id = sm.server_id WHERE c.id = scheduled_messages.channel_id AND sm.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.message_thread_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_thread_replies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.message_threads, public.message_thread_replies TO authenticated;
DROP POLICY IF EXISTS "Members can read threads" ON public.message_threads;
DROP POLICY IF EXISTS "Members can create threads" ON public.message_threads;
DROP POLICY IF EXISTS "Members can read thread replies" ON public.message_thread_replies;
DROP POLICY IF EXISTS "Members can reply in threads" ON public.message_thread_replies;
CREATE POLICY "Members can read threads" ON public.message_threads FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.channels c JOIN public.server_members sm ON sm.server_id = c.server_id WHERE c.id = channel_id AND sm.user_id = auth.uid()));
CREATE POLICY "Members can create threads" ON public.message_threads FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.channels c JOIN public.server_members sm ON sm.server_id = c.server_id WHERE c.id = message_threads.channel_id AND sm.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_threads.root_message_id AND m.channel_id = message_threads.channel_id));
CREATE POLICY "Members can read thread replies" ON public.message_thread_replies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.message_threads t JOIN public.channels c ON c.id = t.channel_id JOIN public.server_members sm ON sm.server_id = c.server_id WHERE t.id = message_thread_replies.thread_id AND sm.user_id = auth.uid()));
CREATE POLICY "Members can reply in threads" ON public.message_thread_replies FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.message_threads t JOIN public.channels c ON c.id = t.channel_id JOIN public.server_members sm ON sm.server_id = c.server_id WHERE t.id = message_thread_replies.thread_id AND sm.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.user_story_views (
  story_id uuid NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
CREATE TABLE IF NOT EXISTS public.user_story_reactions (
  story_id uuid NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('❤️','😂','🔥','👏','😍','😮')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.user_story_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.user_stories(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_story_replies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE, UPDATE ON public.user_story_views, public.user_story_reactions TO authenticated;
GRANT SELECT, INSERT ON public.user_story_replies TO authenticated;
DROP POLICY IF EXISTS "Viewers and authors can see story views" ON public.user_story_views;
DROP POLICY IF EXISTS "Users can mark stories viewed" ON public.user_story_views;
CREATE POLICY "Viewers and authors can see story views" ON public.user_story_views FOR SELECT TO authenticated USING (viewer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_stories s WHERE s.id = user_story_views.story_id AND s.author_id = auth.uid()));
CREATE POLICY "Users can mark stories viewed" ON public.user_story_views FOR INSERT TO authenticated WITH CHECK (viewer_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_stories s WHERE s.id = user_story_views.story_id AND s.expires_at > now()));
DROP POLICY IF EXISTS "Signed-in users can see story reactions" ON public.user_story_reactions;
DROP POLICY IF EXISTS "Users manage their story reaction" ON public.user_story_reactions;
CREATE POLICY "Signed-in users can see story reactions" ON public.user_story_reactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_stories s WHERE s.id = user_story_reactions.story_id AND s.expires_at > now()));
CREATE POLICY "Users manage their story reaction" ON public.user_story_reactions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_stories s WHERE s.id = user_story_reactions.story_id AND s.expires_at > now()));
DROP POLICY IF EXISTS "Story authors and reply authors can read replies" ON public.user_story_replies;
DROP POLICY IF EXISTS "Users can reply to active stories" ON public.user_story_replies;
CREATE POLICY "Story authors and reply authors can read replies" ON public.user_story_replies FOR SELECT TO authenticated USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_stories s WHERE s.id = user_story_replies.story_id AND s.author_id = auth.uid()));
CREATE POLICY "Users can reply to active stories" ON public.user_story_replies FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_stories s WHERE s.id = user_story_replies.story_id AND s.expires_at > now()));

CREATE TABLE IF NOT EXISTS public.server_welcome_settings (
  server_id uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  title text NOT NULL DEFAULT 'Sunucuya hoş geldin!' CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL DEFAULT 'Kanalları keşfet, topluluğa katıl ve kendini tanıt.' CHECK (length(body) <= 1000),
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.server_welcome_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_welcome_settings TO authenticated;
DROP POLICY IF EXISTS "Members can read welcome settings" ON public.server_welcome_settings;
DROP POLICY IF EXISTS "Server moderators manage welcome settings" ON public.server_welcome_settings;
CREATE POLICY "Members can read welcome settings" ON public.server_welcome_settings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_welcome_settings.server_id AND sm.user_id = auth.uid()));
CREATE POLICY "Server moderators manage welcome settings" ON public.server_welcome_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_welcome_settings.server_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','admin'))) WITH CHECK (EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_welcome_settings.server_id AND sm.user_id = auth.uid() AND sm.role IN ('owner','admin')) AND (channel_id IS NULL OR EXISTS (SELECT 1 FROM public.channels c WHERE c.id = server_welcome_settings.channel_id AND c.server_id = server_welcome_settings.server_id)));

-- Existing servers get a sensible welcome card; new servers get one when their owner joins.
INSERT INTO public.server_welcome_settings (server_id)
SELECT id FROM public.servers
ON CONFLICT (server_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_default_server_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'owner' THEN
    INSERT INTO public.server_welcome_settings (server_id) VALUES (NEW.server_id)
    ON CONFLICT (server_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS create_default_server_welcome_on_owner_join ON public.server_members;
CREATE TRIGGER create_default_server_welcome_on_owner_join
  AFTER INSERT ON public.server_members
  FOR EACH ROW EXECUTE FUNCTION public.create_default_server_welcome();

DO $$
DECLARE table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['server_events','server_event_rsvps','channel_polls','channel_poll_votes','message_threads','message_thread_replies','user_story_views','user_story_reactions','user_story_replies'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
      END IF;
    END LOOP;
  END IF;
END $$;
