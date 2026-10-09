-- Run once in the Supabase SQL editor. Profile pictures and banners are public
-- profile assets; each signed-in user can upload only into their own folder.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS banner_position_x integer NOT NULL DEFAULT 50 CHECK (banner_position_x BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS banner_position_y integer NOT NULL DEFAULT 50 CHECK (banner_position_y BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS banner_zoom numeric(3,2) NOT NULL DEFAULT 1 CHECK (banner_zoom BETWEEN 1 AND 2);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-media', 'profile-media', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Profile media is publicly readable" ON storage.objects;
CREATE POLICY "Profile media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-media');

DROP POLICY IF EXISTS "Users upload their own profile media" ON storage.objects;
CREATE POLICY "Users upload their own profile media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users update their own profile media" ON storage.objects;
CREATE POLICY "Users update their own profile media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete their own profile media" ON storage.objects;
CREATE POLICY "Users delete their own profile media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.set_server_member_role(
  server_uuid uuid,
  target_user uuid,
  new_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  server_owner uuid;
BEGIN
  SELECT owner_id INTO server_owner FROM public.servers WHERE id = server_uuid;
  IF auth.uid() IS NULL OR auth.uid() <> server_owner THEN
    RAISE EXCEPTION 'Only the server owner can change member roles';
  END IF;
  IF target_user = server_owner OR new_role IS NULL OR new_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Invalid member role update';
  END IF;
  UPDATE public.server_members
    SET role = new_role
    WHERE server_id = server_uuid AND user_id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Server member not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_server_member_role(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_server_member_role(uuid, uuid, text) TO authenticated;
