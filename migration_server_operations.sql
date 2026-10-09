-- Modular server permissions, audit history, compact invites, and voice moderation.
-- Run once in the Supabase SQL Editor after migration_server_roles_permissions.sql.

ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS vanity_url text;
ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS group_members_by_role boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS servers_vanity_url_uidx ON public.servers (lower(vanity_url)) WHERE vanity_url IS NOT NULL;

-- Older role editors stored unchecked permissions as false. Normalize those to
-- inheritance so an explicit false in the new tri-state editor can mean deny.
UPDATE public.server_roles AS role
SET permissions = coalesce((
  SELECT jsonb_object_agg(permission.key, permission.value)
  FROM jsonb_each(role.permissions) AS permission(key, value)
  WHERE permission.value <> 'false'::jsonb
), '{}'::jsonb)
WHERE role.permissions ?| ARRAY['manage_server','manage_roles','kick_members','ban_members','view_audit_log','manage_channels','manage_messages','view_channel','send_messages','attach_files','add_reactions','connect','speak','mute_members','deafen_members','move_members'];

CREATE OR REPLACE FUNCTION public.has_server_permission(server_uuid uuid, permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_uuid AND s.owner_id = auth.uid()) THEN true
    WHEN EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_uuid AND sm.user_id = auth.uid() AND sm.role = 'admin') THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_uuid AND sm.user_id = auth.uid()) THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.server_member_roles smr JOIN public.server_roles sr ON sr.id = smr.role_id AND sr.server_id = smr.server_id
      WHERE smr.server_id = server_uuid AND smr.user_id = auth.uid() AND jsonb_typeof(sr.permissions -> permission_key) = 'boolean' AND sr.permissions ->> permission_key = 'false'
    ) THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.server_member_roles smr JOIN public.server_roles sr ON sr.id = smr.role_id AND sr.server_id = smr.server_id
      WHERE smr.server_id = server_uuid AND smr.user_id = auth.uid() AND jsonb_typeof(sr.permissions -> permission_key) = 'boolean' AND sr.permissions ->> permission_key = 'true'
    ) THEN true
    ELSE permission_key IN ('view_channel','send_messages','attach_files','connect','speak','add_reactions')
  END;
$$;
REVOKE ALL ON FUNCTION public.has_server_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_server_permission(uuid, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.server_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-zA-Z0-9_-]{5,32}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS server_invites_server_idx ON public.server_invites(server_id, created_at DESC);
ALTER TABLE public.server_invites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.server_invites TO authenticated;
REVOKE UPDATE, DELETE ON public.server_invites FROM authenticated, anon;
REVOKE ALL ON public.server_invites FROM anon;
DROP POLICY IF EXISTS "Managers view server invites" ON public.server_invites;
CREATE POLICY "Managers view server invites" ON public.server_invites FOR SELECT TO authenticated
  USING (public.has_server_permission(server_id, 'manage_server'));
DROP POLICY IF EXISTS "Managers create server invites" ON public.server_invites;
CREATE POLICY "Managers create server invites" ON public.server_invites FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.has_server_permission(server_id, 'manage_server'));
DROP POLICY IF EXISTS "Managers update server invites" ON public.server_invites;
CREATE POLICY "Managers update server invites" ON public.server_invites FOR UPDATE TO authenticated
  USING (public.has_server_permission(server_id, 'manage_server'))
  WITH CHECK (public.has_server_permission(server_id, 'manage_server'));

CREATE OR REPLACE FUNCTION public.set_server_vanity_url(server_uuid uuid, vanity text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE normalized text := lower(trim(coalesce(vanity, '')));
BEGIN
  IF NOT public.has_server_permission(server_uuid, 'manage_server') THEN RAISE EXCEPTION 'Sunucu bağlantısını düzenleme iznin yok'; END IF;
  IF normalized <> '' AND normalized !~ '^[a-z0-9][a-z0-9-]{2,23}$' THEN RAISE EXCEPTION 'Özel bağlantı 3–24 karakter olmalı; harf, sayı ve tire kullan'; END IF;
  UPDATE public.servers SET vanity_url = nullif(normalized, '') WHERE id = server_uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sunucu bulunamadı'; END IF;
  RETURN nullif(normalized, '');
END;
$$;
REVOKE ALL ON FUNCTION public.set_server_vanity_url(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_server_vanity_url(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_server_member_role_grouping(server_uuid uuid, enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_server_permission(server_uuid, 'manage_server') THEN RAISE EXCEPTION 'Üye listesi görünümünü düzenleme iznin yok'; END IF;
  UPDATE public.servers SET group_members_by_role = enabled WHERE id = server_uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sunucu bulunamadı'; END IF;
  RETURN enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.set_server_member_role_grouping(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_server_member_role_grouping(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_server_role(server_uuid uuid, role_uuid uuid, direction text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ordered_roles uuid[]; current_index integer; total_roles integer; swap_index integer;
BEGIN
  IF NOT public.has_server_permission(server_uuid, 'manage_roles') THEN RAISE EXCEPTION 'Rolleri düzenleme iznin yok'; END IF;
  IF direction NOT IN ('up', 'down') THEN RAISE EXCEPTION 'Geçersiz sıralama yönü'; END IF;
  SELECT array_agg(id ORDER BY position DESC, id) INTO ordered_roles FROM public.server_roles WHERE server_id = server_uuid;
  total_roles := coalesce(array_length(ordered_roles, 1), 0);
  current_index := array_position(ordered_roles, role_uuid);
  IF current_index IS NULL THEN RAISE EXCEPTION 'Rol bulunamadı'; END IF;
  swap_index := CASE WHEN direction = 'up' THEN current_index - 1 ELSE current_index + 1 END;
  IF swap_index < 1 OR swap_index > total_roles THEN RETURN; END IF;
  ordered_roles[current_index] := ordered_roles[swap_index];
  ordered_roles[swap_index] := role_uuid;
  FOR current_index IN 1..total_roles LOOP
    UPDATE public.server_roles SET position = total_roles - current_index
      WHERE id = ordered_roles[current_index] AND server_id = server_uuid;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.move_server_role(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_server_role(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_server_roles(server_uuid uuid, ordered_role_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing_ids uuid[]; role_total integer; role_index integer;
BEGIN
  IF NOT public.has_server_permission(server_uuid, 'manage_roles') THEN RAISE EXCEPTION 'Rolleri düzenleme iznin yok'; END IF;
  SELECT array_agg(id ORDER BY position DESC, id) INTO existing_ids FROM public.server_roles WHERE server_id = server_uuid;
  role_total := coalesce(array_length(existing_ids, 1), 0);
  IF coalesce(array_length(ordered_role_ids, 1), 0) <> role_total
     OR (SELECT count(DISTINCT role_id) FROM unnest(ordered_role_ids) AS input_roles(role_id)) <> role_total
     OR EXISTS (SELECT 1 FROM unnest(ordered_role_ids) AS input_roles(role_id) WHERE NOT (role_id = ANY(coalesce(existing_ids, ARRAY[]::uuid[])))) THEN
    RAISE EXCEPTION 'Sıralama listesi bu sunucudaki rollerle eşleşmiyor';
  END IF;
  FOR role_index IN 1..role_total LOOP
    UPDATE public.server_roles SET position = role_total - role_index
      WHERE id = ordered_role_ids[role_index] AND server_id = server_uuid;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_server_roles(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_server_roles(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_server_invite(server_uuid uuid, invite_expiry_hours integer DEFAULT NULL, invite_max_uses integer DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE new_code text;
BEGIN
  IF NOT public.has_server_permission(server_uuid, 'manage_server') THEN RAISE EXCEPTION 'Davet oluşturma iznin yok'; END IF;
  IF invite_expiry_hours IS NOT NULL AND invite_expiry_hours NOT IN (1, 6, 12, 24, 168) THEN RAISE EXCEPTION 'Geçersiz davet süresi'; END IF;
  IF invite_max_uses IS NOT NULL AND invite_max_uses NOT IN (1, 5, 10, 25, 50, 100) THEN RAISE EXCEPTION 'Geçersiz kullanım sınırı'; END IF;
  -- gen_random_uuid() is available in Supabase PostgreSQL without pgcrypto setup.
  new_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  INSERT INTO public.server_invites(server_id, code, created_by, expires_at, max_uses)
    VALUES(server_uuid, new_code, auth.uid(), CASE WHEN invite_expiry_hours IS NULL THEN NULL ELSE now() + make_interval(hours => invite_expiry_hours) END, invite_max_uses);
  RETURN new_code;
END;
$$;
REVOKE ALL ON FUNCTION public.create_server_invite(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_server_invite(uuid, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_server_invite(invite_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_server uuid;
BEGIN
  SELECT server_id INTO target_server FROM public.server_invites WHERE id = invite_uuid;
  IF target_server IS NULL OR NOT public.has_server_permission(target_server, 'manage_server') THEN RAISE EXCEPTION 'Davet bağlantısını iptal etme yetkin yok'; END IF;
  UPDATE public.server_invites SET revoked_at = now() WHERE id = invite_uuid AND revoked_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_server_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_server_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_server_by_invite(invite_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE matched_server uuid; matched_invite uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
  SELECT i.server_id, i.id INTO matched_server, matched_invite FROM public.server_invites i
    WHERE lower(i.code) = lower(trim(invite_code)) AND i.revoked_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at > now()) AND (i.max_uses IS NULL OR i.uses < i.max_uses)
    FOR UPDATE;
  IF matched_server IS NULL THEN
    SELECT s.id INTO matched_server FROM public.servers s WHERE lower(s.vanity_url) = lower(trim(invite_code));
  END IF;
  IF matched_server IS NULL THEN RAISE EXCEPTION 'Davet bağlantısı geçersiz veya süresi dolmuş'; END IF;
  IF EXISTS (SELECT 1 FROM public.server_bans b WHERE b.server_id = matched_server AND b.user_id = auth.uid()) THEN RAISE EXCEPTION 'Bu sunucuya katılman yasaklanmış'; END IF;
  INSERT INTO public.server_members(server_id, user_id, role) VALUES(matched_server, auth.uid(), 'member') ON CONFLICT (server_id, user_id) DO NOTHING;
  IF matched_invite IS NOT NULL THEN UPDATE public.server_invites SET uses = uses + 1 WHERE id = matched_invite; END IF;
  RETURN matched_server;
END;
$$;
REVOKE ALL ON FUNCTION public.join_server_by_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_server_by_invite(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_server_member(server_uuid uuid, target_user uuid, should_ban boolean, ban_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; required_permission text;
BEGIN
  SELECT s.owner_id INTO owner_id FROM public.servers s WHERE s.id = server_uuid;
  required_permission := CASE WHEN should_ban THEN 'ban_members' ELSE 'kick_members' END;
  IF auth.uid() IS NULL OR owner_id IS NULL OR NOT public.has_server_permission(server_uuid, required_permission) THEN
    RAISE EXCEPTION 'Bu üye işlemi için sunucu yetkin yok';
  END IF;
  IF target_user = owner_id OR target_user = auth.uid() OR EXISTS (
    SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_uuid AND sm.user_id = target_user AND sm.role = 'admin'
  ) THEN RAISE EXCEPTION 'Sunucu sahibi ve yöneticiler bu işlemle çıkarılamaz'; END IF;
  IF should_ban THEN
    INSERT INTO public.server_bans(server_id, user_id, banned_by, reason)
      VALUES(server_uuid, target_user, auth.uid(), left(coalesce(ban_reason, 'Sunucu moderasyonu'), 500));
  END IF;
  DELETE FROM public.server_members WHERE server_id = server_uuid AND user_id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sunucu üyesi bulunamadı'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_server_member(uuid, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_server_member(uuid, uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unban_server_member(ban_uuid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_server uuid;
BEGIN
  SELECT b.server_id INTO target_server FROM public.server_bans b WHERE b.id = ban_uuid;
  IF target_server IS NULL OR NOT public.has_server_permission(target_server, 'ban_members') THEN RAISE EXCEPTION 'Yasak kaldırma yetkin yok'; END IF;
  DELETE FROM public.server_bans WHERE id = ban_uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.unban_server_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unban_server_member(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.server_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_audit_log_server_created_idx ON public.server_audit_log(server_id, created_at DESC);
ALTER TABLE public.server_audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.server_audit_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.server_audit_log FROM authenticated, anon;
DROP POLICY IF EXISTS "Members with audit permission view history" ON public.server_audit_log;
CREATE POLICY "Members with audit permission view history" ON public.server_audit_log FOR SELECT TO authenticated
  USING (public.has_server_permission(server_id, 'view_audit_log'));

CREATE OR REPLACE FUNCTION public.write_server_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data jsonb; old_data jsonb; new_data jsonb; server_uuid uuid; entity_key text;
BEGIN
  old_data := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  new_data := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN old_data ELSE new_data END;
  server_uuid := nullif(row_data ->> 'server_id', '')::uuid;
  IF server_uuid IS NULL AND TG_TABLE_NAME = 'servers' THEN server_uuid := nullif(row_data ->> 'id', '')::uuid; END IF;
  IF server_uuid IS NULL AND TG_TABLE_NAME = 'server_member_roles' THEN server_uuid := nullif(row_data ->> 'server_id', '')::uuid; END IF;
  IF server_uuid IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  entity_key := coalesce(row_data ->> 'public_id', row_data ->> 'id', row_data ->> 'user_id', row_data ->> 'role_id');
  INSERT INTO public.server_audit_log(server_id, actor_id, action, entity_type, entity_id, details)
    VALUES(server_uuid, coalesce(auth.uid(), nullif(row_data ->> 'updated_by', '')::uuid, nullif(row_data ->> 'created_by', '')::uuid, nullif(row_data ->> 'banned_by', '')::uuid), lower(TG_TABLE_NAME || '.' || TG_OP), TG_TABLE_NAME, entity_key,
      jsonb_build_object('before', old_data, 'after', new_data));
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS audit_server_channels ON public.channels;
CREATE TRIGGER audit_server_channels AFTER INSERT OR UPDATE OR DELETE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();
DROP TRIGGER IF EXISTS audit_server_categories ON public.categories;
CREATE TRIGGER audit_server_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();
DROP TRIGGER IF EXISTS audit_server_roles ON public.server_roles;
CREATE TRIGGER audit_server_roles AFTER INSERT OR UPDATE OR DELETE ON public.server_roles FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();
DROP TRIGGER IF EXISTS audit_server_member_roles ON public.server_member_roles;
CREATE TRIGGER audit_server_member_roles AFTER INSERT OR UPDATE OR DELETE ON public.server_member_roles FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();
DROP TRIGGER IF EXISTS audit_server_members ON public.server_members;
CREATE TRIGGER audit_server_members AFTER INSERT OR UPDATE OR DELETE ON public.server_members FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();
DROP TRIGGER IF EXISTS audit_server_bans ON public.server_bans;
CREATE TRIGGER audit_server_bans AFTER INSERT OR UPDATE OR DELETE ON public.server_bans FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();
DROP TRIGGER IF EXISTS audit_server_invites ON public.server_invites;
CREATE TRIGGER audit_server_invites AFTER INSERT OR UPDATE OR DELETE ON public.server_invites FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();
DROP TRIGGER IF EXISTS audit_servers ON public.servers;
CREATE TRIGGER audit_servers AFTER UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();

CREATE TABLE IF NOT EXISTS public.server_voice_moderation (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  server_muted boolean NOT NULL DEFAULT false,
  server_deafened boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
ALTER TABLE public.server_voice_moderation ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.server_voice_moderation TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.server_voice_moderation FROM authenticated, anon;
DROP POLICY IF EXISTS "Server members view voice moderation markers" ON public.server_voice_moderation;
CREATE POLICY "Server members view voice moderation markers" ON public.server_voice_moderation FOR SELECT TO authenticated
  USING (public.is_server_member(server_id));
DROP TRIGGER IF EXISTS audit_server_voice_moderation ON public.server_voice_moderation;
CREATE TRIGGER audit_server_voice_moderation AFTER INSERT OR UPDATE OR DELETE ON public.server_voice_moderation FOR EACH ROW EXECUTE FUNCTION public.write_server_audit_log();

DROP POLICY IF EXISTS "Managers manage server roles" ON public.server_roles;
CREATE POLICY "Managers manage server roles" ON public.server_roles FOR ALL TO authenticated
  USING (public.has_server_permission(server_id, 'manage_roles'))
  WITH CHECK (public.has_server_permission(server_id, 'manage_roles'));

DROP POLICY IF EXISTS "Managers assign roles" ON public.server_member_roles;
CREATE POLICY "Managers assign roles" ON public.server_member_roles FOR ALL TO authenticated
  USING (public.has_server_permission(server_id, 'manage_roles'))
  WITH CHECK (
    public.has_server_permission(server_id, 'manage_roles')
    AND EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = server_member_roles.server_id AND sm.user_id = server_member_roles.user_id)
    AND EXISTS (SELECT 1 FROM public.server_roles sr WHERE sr.server_id = server_member_roles.server_id AND sr.id = server_member_roles.role_id)
  );

DROP POLICY IF EXISTS "Managers configure channel overrides" ON public.channel_permission_overrides;
CREATE POLICY "Managers configure channel overrides" ON public.channel_permission_overrides FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_permission_overrides.channel_id AND public.has_server_permission(c.server_id, 'manage_channels')))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_permission_overrides.channel_id AND public.has_server_permission(c.server_id, 'manage_channels'))
    AND (role_id IS NULL OR EXISTS (SELECT 1 FROM public.server_roles sr JOIN public.channels c ON c.server_id = sr.server_id WHERE sr.id = channel_permission_overrides.role_id AND c.id = channel_permission_overrides.channel_id))
    AND (user_id IS NULL OR EXISTS (SELECT 1 FROM public.channels c JOIN public.server_members sm ON sm.server_id = c.server_id WHERE c.id = channel_permission_overrides.channel_id AND sm.user_id = channel_permission_overrides.user_id))
    AND (
      EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_permission_overrides.channel_id AND (public.is_server_owner(c.server_id) OR public.has_server_role(c.server_id, 'admin')))
      OR (
        allow_permissions <@ ARRAY['view_channel','send_messages','attach_files','add_reactions','connect','speak','manage_messages']::text[]
        AND deny_permissions <@ ARRAY['view_channel','send_messages','attach_files','add_reactions','connect','speak','manage_messages']::text[]
      )
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'server_voice_moderation') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.server_voice_moderation;
  END IF;
END;
$$;
