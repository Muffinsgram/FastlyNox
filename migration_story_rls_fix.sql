-- Repair story publishing when Supabase reports:
-- "new row violates row-level security policy"
-- Run this file in the Supabase SQL Editor as a project owner.

ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stories TO authenticated;

DROP POLICY IF EXISTS "Users manage their own stories" ON public.user_stories;
DROP POLICY IF EXISTS "Users can publish their own stories" ON public.user_stories;
DROP POLICY IF EXISTS "Users can edit their own stories" ON public.user_stories;
DROP POLICY IF EXISTS "Users can delete their own stories" ON public.user_stories;
DROP POLICY IF EXISTS "Signed-in users can see current stories" ON public.user_stories;

CREATE POLICY "Signed-in users can see current stories" ON public.user_stories
  FOR SELECT TO authenticated USING (expires_at > now());
CREATE POLICY "Users can publish their own stories" ON public.user_stories
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
CREATE POLICY "Users can edit their own stories" ON public.user_stories
  FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Users can delete their own stories" ON public.user_stories
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- Story images use this bucket. The first path segment is the authenticated user's UUID.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('social-media', 'social-media', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

DROP POLICY IF EXISTS "Social media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users upload their own social media" ON storage.objects;
DROP POLICY IF EXISTS "Users delete their own social media" ON storage.objects;
CREATE POLICY "Social media is publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'social-media');
CREATE POLICY "Users upload their own social media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'social-media' AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users delete their own social media" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'social-media' AND (storage.foldername(name))[1] = auth.uid()::text
  );
