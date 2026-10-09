-- Custom server roles, channel privacy/age flags, and permission-aware RLS.
-- Run this once in Supabase SQL Editor after the base server tables exist.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nsfw boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slowmode_seconds integer NOT NULL DEFAULT 0 CHECK (slowmode_seconds BETWEEN 0 AND 21600);
DO $$
DECLARE needs_category_order boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'sort_order') INTO needs_category_order;
  ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
  IF needs_category_order THEN
    WITH ordered AS (
      SELECT id, row_number() OVER (PARTITION BY server_id ORDER BY ctid) - 1 AS position
      FROM public.categories
    )
    UPDATE public.categories AS category SET sort_order = ordered.position::integer FROM ordered WHERE category.id = ordered.id;
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS categories_server_sort_order_idx ON public.categories (server_id, sort_order);

-- Keep this migration self-contained when the older RLS helper migration was
-- not installed, or when a project uses a reduced helper-function set.
CREATE OR REPLACE FUNCTION public.is_server_member(server_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_uuid AND sm.user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.has_server_role(server_uuid uuid, required_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_uuid AND sm.user_id = auth.uid() AND sm.role = required_role);
$$;
CREATE OR REPLACE FUNCTION public.is_server_owner(server_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_uuid AND s.owner_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_server_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_server_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_server_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_server_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_server_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_server_owner(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.server_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 64),
  color text NOT NULL DEFAULT '#8b9cff' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  mentionable boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, name)
);
CREATE INDEX IF NOT EXISTS server_roles_server_position_idx ON public.server_roles (server_id, position DESC);
ALTER TABLE public.server_roles ADD COLUMN IF NOT EXISTS mentionable boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.server_member_roles (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.server_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id, role_id)
);
CREATE INDEX IF NOT EXISTS server_member_roles_user_idx ON public.server_member_roles (user_id, server_id);

CREATE TABLE IF NOT EXISTS public.channel_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  role_id uuid REFERENCES public.server_roles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  allow_permissions text[] NOT NULL DEFAULT '{}',
  deny_permissions text[] NOT NULL DEFAULT '{}',
  CHECK ((role_id IS NOT NULL) <> (user_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS channel_override_role_unique ON public.channel_permission_overrides (channel_id, role_id) WHERE role_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS channel_override_user_unique ON public.channel_permission_overrides (channel_id, user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_permission_overrides ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_roles, public.server_member_roles, public.channel_permission_overrides TO authenticated;
REVOKE ALL ON public.server_roles, public.server_member_roles, public.channel_permission_overrides FROM anon;

CREATE OR REPLACE FUNCTION public.has_server_permission(server_uuid uuid, permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_uuid AND s.owner_id = auth.uid()) THEN true
    WHEN EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_uuid AND sm.user_id = auth.uid() AND sm.role = 'admin') THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_uuid AND sm.user_id = auth.uid()) THEN false
    WHEN permission_key IN ('view_channel','send_messages','attach_files','connect','speak','add_reactions') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.server_member_roles smr
      JOIN public.server_roles sr ON sr.id = smr.role_id AND sr.server_id = smr.server_id
      WHERE smr.server_id = server_uuid AND smr.user_id = auth.uid()
        AND jsonb_typeof(sr.permissions -> permission_key) = 'boolean'
        AND sr.permissions ->> permission_key = 'true'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_channel_permission(channel_uuid uuid, permission_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  server_uuid uuid;
  channel_is_private boolean;
  member_allowed boolean;
  explicit_allowed boolean;
  explicit_denied boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT c.server_id, c.is_private INTO server_uuid, channel_is_private
  FROM public.channels c WHERE c.id = channel_uuid;
  IF server_uuid IS NULL OR NOT public.is_server_member(server_uuid) THEN RETURN false; END IF;
  IF public.is_server_owner(server_uuid) OR public.has_server_role(server_uuid, 'admin') THEN RETURN true; END IF;
  IF public.has_server_permission(server_uuid, 'manage_channels') THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.channel_permission_overrides o
    WHERE o.channel_id = channel_uuid AND o.user_id = auth.uid() AND permission_key = ANY(o.deny_permissions)
  ) INTO explicit_denied;
  IF explicit_denied THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.channel_permission_overrides o
    WHERE o.channel_id = channel_uuid AND o.user_id = auth.uid() AND permission_key = ANY(o.allow_permissions)
  ) INTO explicit_allowed;
  IF explicit_allowed THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.channel_permission_overrides o
    JOIN public.server_member_roles smr ON smr.role_id = o.role_id AND smr.server_id = server_uuid AND smr.user_id = auth.uid()
    WHERE o.channel_id = channel_uuid AND permission_key = ANY(o.deny_permissions)
  ) INTO explicit_denied;
  IF explicit_denied THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.channel_permission_overrides o
    JOIN public.server_member_roles smr ON smr.role_id = o.role_id AND smr.server_id = server_uuid AND smr.user_id = auth.uid()
    WHERE o.channel_id = channel_uuid AND permission_key = ANY(o.allow_permissions)
  ) INTO explicit_allowed;
  IF explicit_allowed THEN RETURN true; END IF;

  IF permission_key = 'view_channel' AND channel_is_private THEN
    SELECT EXISTS (
      SELECT 1 FROM public.server_member_roles smr JOIN public.server_roles sr ON sr.id = smr.role_id
      WHERE smr.server_id = server_uuid AND smr.user_id = auth.uid()
        AND jsonb_typeof(sr.permissions -> 'view_channel') = 'boolean'
        AND sr.permissions ->> 'view_channel' = 'true'
    ) INTO member_allowed;
    RETURN member_allowed;
  END IF;

  RETURN public.has_server_permission(server_uuid, permission_key);
END;
$$;

REVOKE ALL ON FUNCTION public.has_server_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_channel_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_server_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_channel_permission(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Members read server roles" ON public.server_roles;
DROP POLICY IF EXISTS "Managers manage server roles" ON public.server_roles;
CREATE POLICY "Members read server roles" ON public.server_roles FOR SELECT TO authenticated
  USING (public.is_server_member(server_id));
CREATE POLICY "Managers manage server roles" ON public.server_roles FOR ALL TO authenticated
  USING (public.is_server_owner(server_id) OR public.has_server_role(server_id, 'admin'))
  WITH CHECK (public.is_server_owner(server_id) OR public.has_server_role(server_id, 'admin'));

DROP POLICY IF EXISTS "Members read assigned roles" ON public.server_member_roles;
DROP POLICY IF EXISTS "Managers assign roles" ON public.server_member_roles;
CREATE POLICY "Members read assigned roles" ON public.server_member_roles FOR SELECT TO authenticated
  USING (public.is_server_member(server_id));
CREATE POLICY "Managers assign roles" ON public.server_member_roles FOR ALL TO authenticated
  USING (public.is_server_owner(server_id) OR public.has_server_role(server_id, 'admin'))
  WITH CHECK (
    (public.is_server_owner(server_member_roles.server_id) OR public.has_server_role(server_member_roles.server_id, 'admin'))
    AND EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_member_roles.server_id AND sm.user_id = server_member_roles.user_id)
    AND EXISTS (SELECT 1 FROM public.server_roles sr WHERE sr.server_id = server_member_roles.server_id AND sr.id = server_member_roles.role_id)
  );

DROP POLICY IF EXISTS "Members read channel overrides" ON public.channel_permission_overrides;
DROP POLICY IF EXISTS "Managers configure channel overrides" ON public.channel_permission_overrides;
CREATE POLICY "Members read channel overrides" ON public.channel_permission_overrides FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND public.is_server_member(c.server_id)));
CREATE POLICY "Managers configure channel overrides" ON public.channel_permission_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_permission_overrides.channel_id AND public.has_server_permission(c.server_id, 'manage_channels')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_permission_overrides.channel_id AND public.has_server_permission(c.server_id, 'manage_channels'))
    AND (role_id IS NULL OR EXISTS (SELECT 1 FROM public.server_roles sr JOIN public.channels c ON c.server_id = sr.server_id WHERE sr.id = channel_permission_overrides.role_id AND c.id = channel_permission_overrides.channel_id))
    AND (user_id IS NULL OR EXISTS (SELECT 1 FROM public.channels c JOIN public.server_members sm ON sm.server_id = c.server_id WHERE c.id = channel_permission_overrides.channel_id AND sm.user_id = channel_permission_overrides.user_id))
    AND (
      EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_permission_overrides.channel_id AND (public.is_server_owner(c.server_id) OR public.has_server_role(c.server_id, 'admin')))
      OR (
        allow_permissions <@ ARRAY['view_channel','send_messages','attach_files','add_reactions']::text[]
        AND deny_permissions <@ ARRAY['view_channel','send_messages','attach_files','add_reactions']::text[]
      )
    )
  );

DROP POLICY IF EXISTS "Adminler kanal açabilir" ON public.channels;
DROP POLICY IF EXISTS "Channels with manage permission" ON public.channels;
CREATE POLICY "Channels with manage permission" ON public.channels FOR ALL TO authenticated
  USING (public.has_server_permission(server_id, 'manage_channels'))
  WITH CHECK (public.has_server_permission(server_id, 'manage_channels'));
DROP POLICY IF EXISTS "Adminler kategori açabilir" ON public.categories;
DROP POLICY IF EXISTS "Categories with manage permission" ON public.categories;
CREATE POLICY "Categories with manage permission" ON public.categories FOR ALL TO authenticated
  USING (public.has_server_permission(server_id, 'manage_channels'))
  WITH CHECK (public.has_server_permission(server_id, 'manage_channels'));

DROP POLICY IF EXISTS "Üyeler kanalları görebilir" ON public.channels;
DROP POLICY IF EXISTS "Members can view permitted channels" ON public.channels;
CREATE POLICY "Members can view permitted channels" ON public.channels FOR SELECT TO authenticated
  USING (public.has_channel_permission(id, 'view_channel'));

DROP POLICY IF EXISTS "Üyeler mesaj okuyabilir" ON public.messages;
DROP POLICY IF EXISTS "Members can read permitted channel messages" ON public.messages;
CREATE POLICY "Members can read permitted channel messages" ON public.messages FOR SELECT TO authenticated
  USING (public.has_channel_permission(channel_id, 'view_channel'));
DROP POLICY IF EXISTS "Üyeler mesaj gönderebilir" ON public.messages;
DROP POLICY IF EXISTS "Members can send permitted channel messages" ON public.messages;
CREATE POLICY "Members can send permitted channel messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_channel_permission(channel_id, 'send_messages'));
DROP POLICY IF EXISTS "Mesaj sahibi güncelleyebilir" ON public.messages;
DROP POLICY IF EXISTS "Authors can update messages with permission" ON public.messages;
CREATE POLICY "Authors can update messages with permission" ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND public.has_channel_permission(channel_id, 'send_messages'))
  WITH CHECK (auth.uid() = user_id AND public.has_channel_permission(channel_id, 'send_messages'));
DROP POLICY IF EXISTS "Mesaj sahibi veya Admin silebilir" ON public.messages;
DROP POLICY IF EXISTS "Authors or message managers can delete messages" ON public.messages;
CREATE POLICY "Authors or message managers can delete messages" ON public.messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.channels c WHERE c.id = messages.channel_id
      AND public.has_server_permission(c.server_id, 'manage_messages')
  ));

-- Keep auxiliary channel data behind the same private-channel boundary.
DROP POLICY IF EXISTS "Members can read channel reactions" ON public.message_reactions;
CREATE POLICY "Members can read channel reactions" ON public.message_reactions FOR SELECT TO authenticated
  USING (public.has_channel_permission(channel_id, 'view_channel') AND EXISTS (
    SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id AND m.channel_id = message_reactions.channel_id
  ));
DROP POLICY IF EXISTS "Members can react in visible channels" ON public.message_reactions;
CREATE POLICY "Members can react in visible channels" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_channel_permission(channel_id, 'view_channel') AND EXISTS (
    SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id AND m.channel_id = message_reactions.channel_id
  ));

DROP POLICY IF EXISTS "Members can read threads" ON public.message_threads;
CREATE POLICY "Members can read threads" ON public.message_threads FOR SELECT TO authenticated
  USING (public.has_channel_permission(channel_id, 'view_channel'));
DROP POLICY IF EXISTS "Members can create threads" ON public.message_threads;
CREATE POLICY "Members can create threads" ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.has_channel_permission(channel_id, 'send_messages') AND EXISTS (
    SELECT 1 FROM public.messages m WHERE m.id = message_threads.root_message_id AND m.channel_id = message_threads.channel_id
  ));
DROP POLICY IF EXISTS "Members can read thread replies" ON public.message_thread_replies;
CREATE POLICY "Members can read thread replies" ON public.message_thread_replies FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.message_threads t WHERE t.id = message_thread_replies.thread_id AND public.has_channel_permission(t.channel_id, 'view_channel')));
DROP POLICY IF EXISTS "Members can reply in threads" ON public.message_thread_replies;
CREATE POLICY "Members can reply in threads" ON public.message_thread_replies FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.message_threads t WHERE t.id = message_thread_replies.thread_id AND public.has_channel_permission(t.channel_id, 'send_messages')));

DROP POLICY IF EXISTS "Members can read polls" ON public.channel_polls;
DROP POLICY IF EXISTS "Channel members can read polls" ON public.channel_polls;
CREATE POLICY "Members can read polls" ON public.channel_polls FOR SELECT TO authenticated
  USING (public.has_channel_permission(channel_id, 'view_channel'));
DROP POLICY IF EXISTS "Members can create polls" ON public.channel_polls;
CREATE POLICY "Members can create polls" ON public.channel_polls FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid() AND public.has_channel_permission(channel_id, 'send_messages'));
DROP POLICY IF EXISTS "Members can read poll votes" ON public.channel_poll_votes;
CREATE POLICY "Members can read poll votes" ON public.channel_poll_votes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.channel_polls p WHERE p.id = channel_poll_votes.poll_id AND public.has_channel_permission(p.channel_id, 'view_channel')));
DROP POLICY IF EXISTS "Users manage their poll vote" ON public.channel_poll_votes;
CREATE POLICY "Users manage their poll vote" ON public.channel_poll_votes FOR ALL TO authenticated
  USING (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.channel_polls p WHERE p.id = channel_poll_votes.poll_id AND public.has_channel_permission(p.channel_id, 'view_channel')))
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.channel_polls p WHERE p.id = channel_poll_votes.poll_id AND public.has_channel_permission(p.channel_id, 'view_channel') AND option_index < jsonb_array_length(p.options) AND (p.closes_at IS NULL OR p.closes_at > now())));

CREATE OR REPLACE FUNCTION public.reorder_server_channels(server_uuid uuid, category_uuid uuid, ordered_channel_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE expected_count integer; changed_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_server_permission(server_uuid, 'manage_channels') THEN
    RAISE EXCEPTION 'You do not have permission to reorder channels';
  END IF;
  SELECT count(*) INTO expected_count FROM public.channels WHERE server_id = server_uuid AND category_id = category_uuid;
  IF ordered_channel_ids IS NULL OR cardinality(ordered_channel_ids) <> expected_count OR
     (SELECT count(DISTINCT channel_id) FROM unnest(ordered_channel_ids) AS items(channel_id)) <> expected_count THEN
    RAISE EXCEPTION 'Channel order is incomplete or contains duplicates';
  END IF;
  UPDATE public.channels AS channel SET sort_order = ordering.position::integer - 1
  FROM unnest(ordered_channel_ids) WITH ORDINALITY AS ordering(channel_id, position)
  WHERE channel.id = ordering.channel_id AND channel.server_id = server_uuid AND channel.category_id = category_uuid;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_count THEN RAISE EXCEPTION 'Channel order does not match this category'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_server_channels(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_server_channels(uuid, uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_server_category(server_uuid uuid, category_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE category_server uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_server_permission(server_uuid, 'manage_channels') THEN
    RAISE EXCEPTION 'You do not have permission to delete categories';
  END IF;
  SELECT c.server_id INTO category_server FROM public.categories c WHERE c.id = category_uuid;
  IF category_server IS NULL OR category_server <> server_uuid THEN RAISE EXCEPTION 'Category not found in this server'; END IF;
  DELETE FROM public.channels WHERE server_id = server_uuid AND category_id = category_uuid;
  DELETE FROM public.categories WHERE id = category_uuid AND server_id = server_uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category could not be deleted'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_server_category(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_server_category(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_server_categories(server_uuid uuid, ordered_category_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE expected_count integer; changed_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_server_permission(server_uuid, 'manage_channels') THEN RAISE EXCEPTION 'You do not have permission to reorder categories'; END IF;
  SELECT count(*) INTO expected_count FROM public.categories WHERE server_id = server_uuid;
  IF ordered_category_ids IS NULL OR cardinality(ordered_category_ids) <> expected_count OR
     (SELECT count(DISTINCT category_id) FROM unnest(ordered_category_ids) AS items(category_id)) <> expected_count THEN
    RAISE EXCEPTION 'Category order is incomplete or contains duplicates';
  END IF;
  UPDATE public.categories AS category SET sort_order = ordering.position::integer - 1
  FROM unnest(ordered_category_ids) WITH ORDINALITY AS ordering(category_id, position)
  WHERE category.id = ordering.category_id AND category.server_id = server_uuid;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_count THEN RAISE EXCEPTION 'Category order does not match this server'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_server_categories(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_server_categories(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_server_channel_slowmode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE delay_seconds integer; latest_message_at timestamptz;
BEGIN
  SELECT c.slowmode_seconds INTO delay_seconds FROM public.channels c WHERE c.id = NEW.channel_id;
  IF coalesce(delay_seconds, 0) <= 0 OR public.has_server_permission(
    (SELECT c.server_id FROM public.channels c WHERE c.id = NEW.channel_id), 'manage_messages'
  ) THEN RETURN NEW; END IF;
  SELECT m.created_at INTO latest_message_at FROM public.messages m
    WHERE m.channel_id = NEW.channel_id AND m.user_id = NEW.user_id
    ORDER BY m.created_at DESC LIMIT 1;
  IF latest_message_at IS NOT NULL AND latest_message_at > now() - make_interval(secs => delay_seconds) THEN
    RAISE EXCEPTION 'Bu kanalda yavaş mod açık. Biraz bekleyip tekrar gönder.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS server_channel_slowmode_before_message ON public.messages;
CREATE TRIGGER server_channel_slowmode_before_message BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_server_channel_slowmode();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'server_roles') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.server_roles; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'server_member_roles') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.server_member_roles; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'channel_permission_overrides') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_permission_overrides; END IF;
  END IF;
END;
$$;
