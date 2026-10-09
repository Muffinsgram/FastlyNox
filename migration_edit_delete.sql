-- ==========================================
-- FASTCORD P0: DATABASE MIGRATIONS FOR EDIT/DELETE
-- Run this script in the Supabase SQL Editor.
-- ==========================================

-- 1. Add is_edited to messages if it doesn't exist
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;

-- 2. Add is_edited to dm_messages if it doesn't exist
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;

-- Store attachment object paths instead of public URLs, and keep DM files private.
UPDATE public.messages
SET image_url = replace(regexp_replace(image_url, '^.*/storage/v1/object/public/attachments/', ''), '%2F', '/')
WHERE image_url LIKE '%/storage/v1/object/public/attachments/%';
UPDATE public.dm_messages
SET image_url = replace(regexp_replace(image_url, '^.*/storage/v1/object/public/attachments/', ''), '%2F', '/')
WHERE image_url LIKE '%/storage/v1/object/public/attachments/%';
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

DROP POLICY IF EXISTS "Herkes dosyaları okuyabilir" ON storage.objects;
DROP POLICY IF EXISTS "Users can read attachments in visible messages" ON storage.objects;
CREATE POLICY "Users can read attachments in visible messages" ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (SELECT 1 FROM public.messages m WHERE m.image_url = storage.objects.name) OR
    EXISTS (SELECT 1 FROM public.dm_messages m WHERE m.image_url = storage.objects.name)
  )
);

-- 3. Ensure users can update their own messages
DROP POLICY IF EXISTS "Mesaj sahibi güncelleyebilir" ON public.messages;
CREATE POLICY "Mesaj sahibi güncelleyebilir" ON public.messages 
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.channels c JOIN public.server_members sm ON sm.server_id = c.server_id
  WHERE c.id = channel_id AND sm.user_id = auth.uid()
));

-- 4. Ensure users can update their own DM messages
DROP POLICY IF EXISTS "Mesaj sahibi güncelleyebilir (DM)" ON public.dm_messages;
CREATE POLICY "Mesaj sahibi güncelleyebilir (DM)" ON public.dm_messages 
FOR UPDATE USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.dm_channels d
  WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id)
));

-- 5. Ensure users can delete their own DM messages
DROP POLICY IF EXISTS "Mesaj sahibi silebilir (DM)" ON public.dm_messages;
CREATE POLICY "Mesaj sahibi silebilir (DM)" ON public.dm_messages 
FOR DELETE USING (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.dm_channels d
  WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id)
));

-- Direct messages are authorized by the two participants stored on dm_channels.
ALTER TABLE public.dm_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants can view their DM channels" ON public.dm_channels;
CREATE POLICY "Participants can view their DM channels" ON public.dm_channels
FOR SELECT USING (auth.uid() IN (user1_id, user2_id));
DROP POLICY IF EXISTS "Participants can create their DM channels" ON public.dm_channels;
CREATE POLICY "Participants can create their DM channels" ON public.dm_channels
FOR INSERT WITH CHECK (auth.uid() IN (user1_id, user2_id) AND user1_id <> user2_id);

DROP POLICY IF EXISTS "Sadece sohbettekiler DM mesajlarını görebilir" ON public.dm_messages;
CREATE POLICY "DM participants can read messages" ON public.dm_messages
FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.dm_channels d
  WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id)
));
DROP POLICY IF EXISTS "Sadece sohbettekiler DM mesajı atabilir" ON public.dm_messages;
CREATE POLICY "DM participants can send messages" ON public.dm_messages
FOR INSERT WITH CHECK (auth.uid() = user_id AND EXISTS (
  SELECT 1 FROM public.dm_channels d
  WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id)
));

-- Enable realtime for both server and direct message changes.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['messages', 'dm_messages'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;

-- Search derives identity from the signed-in JWT; callers cannot search as another user.
DROP FUNCTION IF EXISTS public.search_all_messages(text, uuid);
DROP FUNCTION IF EXISTS public.search_all_messages(text);
CREATE FUNCTION public.search_all_messages(search_query text)
RETURNS TABLE (
  id uuid,
  source_type text,
  channel_id uuid,
  author_name text,
  author_avatar text,
  content text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH matches AS (
    SELECT m.id, 'server'::text AS source_type, c.id AS channel_id,
           p.username AS author_name, p.avatar_url AS author_avatar,
           m.content, m.created_at
    FROM public.messages m
    JOIN public.channels c ON c.id = m.channel_id
    JOIN public.server_members sm ON sm.server_id = c.server_id AND sm.user_id = auth.uid()
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE length(trim(search_query)) BETWEEN 3 AND 200
      AND m.content ILIKE '%' || trim(search_query) || '%'
    UNION ALL
    SELECT m.id, 'dm'::text, m.dm_channel_id,
           p.username, p.avatar_url, m.content, m.created_at
    FROM public.dm_messages m
    JOIN public.dm_channels d ON d.id = m.dm_channel_id
    JOIN public.profiles p ON p.id = m.user_id
    WHERE auth.uid() IN (d.user1_id, d.user2_id)
      AND length(trim(search_query)) BETWEEN 3 AND 200
      AND m.content ILIKE '%' || trim(search_query) || '%'
  )
  SELECT * FROM matches ORDER BY created_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.search_all_messages(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_all_messages(text) TO authenticated;

-- Create a server and its starter categories/channels as one atomic operation.
CREATE OR REPLACE FUNCTION public.create_server_with_defaults(server_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  created_server_id uuid;
  text_category_id uuid;
  voice_category_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF server_name IS NULL OR length(trim(server_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Server name must be between 1 and 100 characters';
  END IF;

  INSERT INTO public.servers (name, owner_id)
  VALUES (trim(server_name), auth.uid())
  RETURNING id INTO created_server_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (created_server_id, auth.uid(), 'owner');

  INSERT INTO public.categories (server_id, name)
  VALUES (created_server_id, 'METİN KANALLARI') RETURNING id INTO text_category_id;
  INSERT INTO public.categories (server_id, name)
  VALUES (created_server_id, 'SES KANALLARI') RETURNING id INTO voice_category_id;
  INSERT INTO public.channels (server_id, category_id, name, type)
  VALUES (created_server_id, text_category_id, 'genel-sohbet', 'text');
  INSERT INTO public.channels (server_id, category_id, name, type)
  VALUES (created_server_id, voice_category_id, 'Genel Odası', 'voice');

  RETURN created_server_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_server_with_defaults(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_server_with_defaults(text) TO authenticated;

-- Ban and kick operations stay consistent if either database write fails.
CREATE OR REPLACE FUNCTION public.moderate_server_member(
  server_uuid uuid,
  target_user uuid,
  should_ban boolean,
  ban_reason text DEFAULT NULL
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
    RAISE EXCEPTION 'Only the server owner can moderate members';
  END IF;
  IF target_user = server_owner OR target_user = auth.uid() THEN
    RAISE EXCEPTION 'The server owner cannot be removed or banned';
  END IF;

  IF should_ban THEN
    INSERT INTO public.server_bans (server_id, user_id, banned_by, reason)
    VALUES (server_uuid, target_user, auth.uid(), left(coalesce(ban_reason, 'Banned by the server owner'), 500));
  END IF;

  DELETE FROM public.server_members WHERE server_id = server_uuid AND user_id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Server member not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_server_member(uuid, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_server_member(uuid, uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unban_server_member(ban_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  ban_server_id uuid;
BEGIN
  SELECT server_id INTO ban_server_id FROM public.server_bans WHERE id = ban_uuid;
  IF ban_server_id IS NULL OR NOT public.is_server_owner(ban_server_id) THEN
    RAISE EXCEPTION 'Only the server owner can remove this ban';
  END IF;
  DELETE FROM public.server_bans WHERE id = ban_uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ban not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.unban_server_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unban_server_member(uuid) TO authenticated;
