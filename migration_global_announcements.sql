-- Global announcements. Apply this migration in the Supabase SQL Editor.
-- Promote the intended publisher account with:
-- INSERT INTO public.app_admins (user_id) VALUES ('AUTH_USER_UUID') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_admins FROM anon, authenticated;
GRANT SELECT ON public.app_admins TO authenticated;
DROP POLICY IF EXISTS "App admins can read their own grant" ON public.app_admins;
CREATE POLICY "App admins can read their own grant" ON public.app_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.global_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS global_announcements_created_at_idx
  ON public.global_announcements (created_at DESC);
ALTER TABLE public.global_announcements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.global_announcements TO authenticated;
DROP POLICY IF EXISTS "Signed-in users can read announcements" ON public.global_announcements;
CREATE POLICY "Signed-in users can read announcements" ON public.global_announcements
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "App admins can publish announcements" ON public.global_announcements;
CREATE POLICY "App admins can publish announcements" ON public.global_announcements
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "App admins can delete announcements" ON public.global_announcements;
CREATE POLICY "App admins can delete announcements" ON public.global_announcements
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.user_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_reminders_owner_due_idx
  ON public.user_reminders (user_id, due_at) WHERE completed_at IS NULL;
ALTER TABLE public.user_reminders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reminders TO authenticated;
DROP POLICY IF EXISTS "Users manage only their reminders" ON public.user_reminders;
CREATE POLICY "Users manage only their reminders" ON public.user_reminders
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS user_follows_followed_idx ON public.user_follows (followed_id, created_at DESC);
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;
DROP POLICY IF EXISTS "Signed-in users can view follows" ON public.user_follows;
CREATE POLICY "Signed-in users can view follows" ON public.user_follows
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can follow from their own account" ON public.user_follows;
CREATE POLICY "Users can follow from their own account" ON public.user_follows
  FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid() AND follower_id <> followed_id);
DROP POLICY IF EXISTS "Users can unfollow from their own account" ON public.user_follows;
CREATE POLICY "Users can unfollow from their own account" ON public.user_follows
  FOR DELETE TO authenticated USING (follower_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(content) <= 5000),
  CHECK (length(trim(content)) > 0 OR media_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS user_posts_created_at_idx ON public.user_posts (created_at DESC);
CREATE TABLE IF NOT EXISTS public.user_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CHECK (length(content) <= 500),
  CHECK (length(trim(content)) > 0 OR media_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS user_stories_expires_at_idx ON public.user_stories (expires_at DESC);
ALTER TABLE public.user_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_posts, public.user_stories TO authenticated;
DROP POLICY IF EXISTS "Signed-in users can see posts" ON public.user_posts;
CREATE POLICY "Signed-in users can see posts" ON public.user_posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users manage their own posts" ON public.user_posts;
CREATE POLICY "Users manage their own posts" ON public.user_posts FOR ALL TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS "Signed-in users can see current stories" ON public.user_stories;
CREATE POLICY "Signed-in users can see current stories" ON public.user_stories FOR SELECT TO authenticated USING (expires_at > now());
DROP POLICY IF EXISTS "Users manage their own stories" ON public.user_stories;
DROP POLICY IF EXISTS "Users can publish their own stories" ON public.user_stories;
DROP POLICY IF EXISTS "Users can edit their own stories" ON public.user_stories;
DROP POLICY IF EXISTS "Users can delete their own stories" ON public.user_stories;
CREATE POLICY "Users can publish their own stories" ON public.user_stories FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "Users can edit their own stories" ON public.user_stories FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Users can delete their own stories" ON public.user_stories FOR DELETE TO authenticated USING (author_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('social-media', 'social-media', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];
DROP POLICY IF EXISTS "Social media is publicly readable" ON storage.objects;
CREATE POLICY "Social media is publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'social-media');
DROP POLICY IF EXISTS "Users upload their own social media" ON storage.objects;
CREATE POLICY "Users upload their own social media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-media' AND (storage.foldername(name))[1] = auth.uid()::text
    AND COALESCE((metadata->>'size')::bigint, 0) BETWEEN 1 AND 10485760
    AND metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif'));
DROP POLICY IF EXISTS "Users delete their own social media" ON storage.objects;
CREATE POLICY "Users delete their own social media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'social-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'global_announcements') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.global_announcements;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_reminders') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_reminders;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_follows') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_follows;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_posts') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_posts;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_stories') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_stories;
    END IF;
  END IF;
END;
$$;
