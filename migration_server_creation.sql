-- Run once in Supabase SQL Editor to install the server creation/deletion RPCs.
-- Creation is atomic: either the server and its starter channels all exist, or none do.
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

CREATE OR REPLACE FUNCTION public.delete_server(server_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.servers WHERE id = server_uuid AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the server owner can delete this server';
  END IF;

  DELETE FROM public.messages
  WHERE channel_id IN (SELECT id FROM public.channels WHERE server_id = server_uuid);
  DELETE FROM public.channels WHERE server_id = server_uuid;
  DELETE FROM public.categories WHERE server_id = server_uuid;
  DELETE FROM public.server_bans WHERE server_id = server_uuid;
  DELETE FROM public.server_members WHERE server_id = server_uuid;
  DELETE FROM public.servers WHERE id = server_uuid AND owner_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.delete_server(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_server(uuid) TO authenticated;
