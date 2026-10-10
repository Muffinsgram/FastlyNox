-- Shared profile connections and opt-in activity presence.
-- Idempotent: safe to re-run from the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.user_profile_activities (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('game', 'spotify', 'music')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  details text,
  external_url text,
  album_art_url text,
  spotify_uri text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_type)
);

ALTER TABLE public.user_profile_activities ADD COLUMN IF NOT EXISTS album_art_url text;
ALTER TABLE public.user_profile_activities ADD COLUMN IF NOT EXISTS spotify_uri text;
ALTER TABLE public.user_profile_activities DROP CONSTRAINT IF EXISTS user_profile_activities_activity_type_check;
ALTER TABLE public.user_profile_activities ADD CONSTRAINT user_profile_activities_activity_type_check CHECK (activity_type IN ('game', 'spotify', 'music'));

ALTER TABLE public.user_profile_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can publish their own profile activities" ON public.user_profile_activities;
CREATE POLICY "Users can publish their own profile activities"
  ON public.user_profile_activities FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Friends and server peers can view profile activities" ON public.user_profile_activities;
CREATE POLICY "Friends and server peers can view profile activities"
  ON public.user_profile_activities FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = user_profile_activities.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = user_profile_activities.user_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.server_members mine
      JOIN public.server_members theirs ON theirs.server_id = mine.server_id
      WHERE mine.user_id = auth.uid() AND theirs.user_id = user_profile_activities.user_id
    )
  );

CREATE OR REPLACE FUNCTION public.get_profile_connections(target_user uuid)
RETURNS TABLE(connection_type text, connection_id uuid, display_name text, icon_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH mutual_friends AS (
    SELECT CASE WHEN f.requester_id = target_user THEN f.addressee_id ELSE f.requester_id END AS friend_id
    FROM public.friendships f
    WHERE f.status = 'accepted' AND target_user <> auth.uid()
      AND target_user IN (f.requester_id, f.addressee_id)
      AND (CASE WHEN f.requester_id = target_user THEN f.addressee_id ELSE f.requester_id END) <> auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.friendships mine
        WHERE mine.status = 'accepted'
          AND auth.uid() IN (mine.requester_id, mine.addressee_id)
          AND (CASE WHEN mine.requester_id = auth.uid() THEN mine.addressee_id ELSE mine.requester_id END)
              = (CASE WHEN f.requester_id = target_user THEN f.addressee_id ELSE f.requester_id END)
      )
  ), mutual_servers AS (
    SELECT s.id, s.name, s.icon_url
    FROM public.server_members mine
    JOIN public.server_members theirs ON theirs.server_id = mine.server_id
    JOIN public.servers s ON s.id = mine.server_id
    WHERE mine.user_id = auth.uid() AND theirs.user_id = target_user AND target_user <> auth.uid()
  )
  SELECT 'friend'::text, p.id, p.username, p.avatar_url FROM mutual_friends mf JOIN public.profiles p ON p.id = mf.friend_id
  UNION ALL
  SELECT 'server'::text, ms.id, ms.name, ms.icon_url FROM mutual_servers ms;
$$;

REVOKE ALL ON FUNCTION public.get_profile_connections(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_connections(uuid) TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profile_activities;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_social_links (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('spotify', 'listenbrainz', 'steam', 'youtube', 'instagram')),
  profile_url text NOT NULL CHECK (char_length(profile_url) BETWEEN 8 AND 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  visibility text NOT NULL DEFAULT 'connections' CHECK (visibility IN ('connections', 'friends', 'everyone')),
  PRIMARY KEY (user_id, platform),
  CONSTRAINT user_social_links_platform_url_check CHECK (
    (platform = 'spotify' AND profile_url ~* '^https://([a-z0-9-]+\.)*spotify\.com(/|$)') OR
    (platform = 'listenbrainz' AND profile_url ~* '^https://([a-z0-9-]+\.)*listenbrainz\.org/user/[^/]+/?$') OR
    (platform = 'steam' AND profile_url ~* '^https://([a-z0-9-]+\.)*(steamcommunity\.com|steampowered\.com)(/|$)') OR
    (platform = 'youtube' AND profile_url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be)(/|$)') OR
    (platform = 'instagram' AND profile_url ~* '^https://([a-z0-9-]+\.)*instagram\.com(/|$)')
  )
);

ALTER TABLE public.user_social_links ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'connections';
ALTER TABLE public.user_social_links DROP CONSTRAINT IF EXISTS user_social_links_platform_check;
ALTER TABLE public.user_social_links ADD CONSTRAINT user_social_links_platform_check CHECK (platform IN ('spotify', 'listenbrainz', 'steam', 'youtube', 'instagram'));
ALTER TABLE public.user_social_links DROP CONSTRAINT IF EXISTS user_social_links_platform_url_check;
ALTER TABLE public.user_social_links ADD CONSTRAINT user_social_links_platform_url_check CHECK (
  (platform = 'spotify' AND profile_url ~* '^https://([a-z0-9-]+\.)*spotify\.com(/|$)') OR
  (platform = 'listenbrainz' AND profile_url ~* '^https://([a-z0-9-]+\.)*listenbrainz\.org/user/[^/]+/?$') OR
  (platform = 'steam' AND profile_url ~* '^https://([a-z0-9-]+\.)*(steamcommunity\.com|steampowered\.com)(/|$)') OR
  (platform = 'youtube' AND profile_url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be)(/|$)') OR
  (platform = 'instagram' AND profile_url ~* '^https://([a-z0-9-]+\.)*instagram\.com(/|$)')
);
ALTER TABLE public.user_social_links DROP CONSTRAINT IF EXISTS user_social_links_visibility_check;
ALTER TABLE public.user_social_links ADD CONSTRAINT user_social_links_visibility_check CHECK (visibility IN ('connections', 'friends', 'everyone'));

ALTER TABLE public.user_social_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own social links" ON public.user_social_links;
CREATE POLICY "Users manage their own social links" ON public.user_social_links FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Friends and server peers view social links" ON public.user_social_links;
CREATE POLICY "Friends and server peers view social links" ON public.user_social_links FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (visibility = 'everyone')
    OR (visibility IN ('connections', 'friends') AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = auth.uid() AND f.addressee_id = user_social_links.user_id)
          OR (f.addressee_id = auth.uid() AND f.requester_id = user_social_links.user_id))
    ))
    OR (visibility = 'connections' AND EXISTS (
      SELECT 1 FROM public.server_members mine
      JOIN public.server_members theirs ON theirs.server_id = mine.server_id
      WHERE mine.user_id = auth.uid() AND theirs.user_id = user_social_links.user_id
    ))
  );

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_social_links;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;
