-- Apply once in the Supabase SQL Editor if migration_server_operations.sql
-- was already run before the gen_random_bytes compatibility fix.

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS group_members_by_role boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_server_invite(server_uuid uuid, invite_expiry_hours integer DEFAULT NULL, invite_max_uses integer DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE new_code text;
BEGIN
  IF NOT public.has_server_permission(server_uuid, 'manage_server') THEN RAISE EXCEPTION 'Davet oluşturma iznin yok'; END IF;
  IF invite_expiry_hours IS NOT NULL AND invite_expiry_hours NOT IN (1, 6, 12, 24, 168) THEN RAISE EXCEPTION 'Geçersiz davet süresi'; END IF;
  IF invite_max_uses IS NOT NULL AND invite_max_uses NOT IN (1, 5, 10, 25, 50, 100) THEN RAISE EXCEPTION 'Geçersiz kullanım sınırı'; END IF;

  -- PostgreSQL/Supabase supplies gen_random_uuid() without enabling pgcrypto.
  new_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  INSERT INTO public.server_invites(server_id, code, created_by, expires_at, max_uses)
    VALUES(server_uuid, new_code, auth.uid(), CASE WHEN invite_expiry_hours IS NULL THEN NULL ELSE now() + make_interval(hours => invite_expiry_hours) END, invite_max_uses);
  RETURN new_code;
END;
$$;
REVOKE ALL ON FUNCTION public.create_server_invite(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_server_invite(uuid, integer, integer) TO authenticated;

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
