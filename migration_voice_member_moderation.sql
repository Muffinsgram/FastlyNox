-- Timed bans and permission-checked moderation from voice-member context menus.
-- Run after migration_server_operations.sql in Supabase SQL Editor.
ALTER TABLE public.server_bans
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_current_user_server_banned(server_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_bans b
    WHERE b.server_id = server_uuid
      AND b.user_id = auth.uid()
      AND (b.expires_at IS NULL OR b.expires_at > now())
  );
$$;
REVOKE ALL ON FUNCTION public.is_current_user_server_banned(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_server_banned(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_server_member_with_expiry(
  server_uuid uuid,
  target_user uuid,
  should_ban boolean,
  ban_reason text DEFAULT NULL,
  ban_duration_hours integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  required_permission text;
  target_server_role text;
  expiry timestamptz;
BEGIN
  required_permission := CASE WHEN should_ban THEN 'ban_members' ELSE 'kick_members' END;
  IF auth.uid() IS NULL OR NOT public.has_server_permission(server_uuid, required_permission) THEN
    RAISE EXCEPTION 'Bu üye işlemi için sunucu yetkin yok';
  END IF;
  IF target_user IS NULL OR target_user = auth.uid() THEN
    RAISE EXCEPTION 'Kendini sunucudan atamaz veya yasaklayamazsın';
  END IF;

  SELECT sm.role INTO target_server_role FROM public.server_members sm
  WHERE sm.server_id = server_uuid AND sm.user_id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sunucu üyesi bulunamadı'; END IF;
  IF target_server_role IN ('owner', 'admin')
    OR EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_uuid AND s.owner_id = target_user) THEN
    RAISE EXCEPTION 'Sunucu sahibi ve yöneticiler bu işlemle çıkarılamaz';
  END IF;

  IF should_ban THEN
    IF ban_duration_hours IS NOT NULL AND ban_duration_hours NOT IN (1, 24, 168, 720) THEN
      RAISE EXCEPTION 'Yasaklama süresi geçersiz';
    END IF;
    expiry := CASE WHEN ban_duration_hours IS NULL THEN NULL ELSE now() + make_interval(hours => ban_duration_hours) END;
    INSERT INTO public.server_bans(server_id, user_id, banned_by, reason, expires_at)
      VALUES(server_uuid, target_user, auth.uid(), left(coalesce(nullif(trim(ban_reason), ''), 'Sunucu moderasyonu'), 500), expiry);
  ELSIF ban_duration_hours IS NOT NULL THEN
    RAISE EXCEPTION 'Atma işleminde yasaklama süresi kullanılamaz';
  END IF;

  DELETE FROM public.server_members WHERE server_id = server_uuid AND user_id = target_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sunucu üyesi bulunamadı'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.moderate_server_member_with_expiry(uuid, uuid, boolean, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_server_member_with_expiry(uuid, uuid, boolean, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_server_by_invite(invite_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  matched_server uuid;
  matched_invite uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Giriş yapmalısın'; END IF;
  SELECT i.server_id, i.id INTO matched_server, matched_invite
  FROM public.server_invites i
  WHERE lower(i.code) = lower(trim(invite_code))
    AND i.revoked_at IS NULL
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (i.max_uses IS NULL OR i.uses < i.max_uses)
  FOR UPDATE;
  IF matched_server IS NULL THEN
    SELECT s.id INTO matched_server FROM public.servers s
    WHERE lower(s.vanity_url) = lower(trim(invite_code));
  END IF;
  IF matched_server IS NULL THEN RAISE EXCEPTION 'Davet bağlantısı geçersiz veya süresi dolmuş'; END IF;
  IF public.is_current_user_server_banned(matched_server) THEN RAISE EXCEPTION 'Bu sunucuya katılman yasaklanmış'; END IF;
  INSERT INTO public.server_members(server_id, user_id, role)
    VALUES(matched_server, auth.uid(), 'member')
    ON CONFLICT (server_id, user_id) DO NOTHING;
  IF matched_invite IS NOT NULL THEN
    UPDATE public.server_invites SET uses = uses + 1 WHERE id = matched_invite;
  END IF;
  RETURN matched_server;
END;
$$;
REVOKE ALL ON FUNCTION public.join_server_by_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_server_by_invite(text) TO authenticated;
