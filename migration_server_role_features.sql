-- Custom role appearance, hierarchy-safe role management, bulk assignment,
-- and complete role ordering. Run once after migration_server_operations.sql.

ALTER TABLE public.server_roles ADD COLUMN IF NOT EXISTS emoji text;
ALTER TABLE public.server_roles ADD COLUMN IF NOT EXISTS gradient_color text;
ALTER TABLE public.server_roles ADD COLUMN IF NOT EXISTS animated boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'server_roles_emoji_length_check') THEN
    ALTER TABLE public.server_roles ADD CONSTRAINT server_roles_emoji_length_check CHECK (emoji IS NULL OR length(emoji) <= 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'server_roles_gradient_color_check') THEN
    ALTER TABLE public.server_roles ADD CONSTRAINT server_roles_gradient_color_check CHECK (gradient_color IS NULL OR gradient_color ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_manage_server_role_position(server_uuid uuid, target_position integer)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_top_position integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.servers WHERE id = server_uuid AND owner_id = auth.uid()) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.server_members WHERE server_id = server_uuid AND user_id = auth.uid() AND role = 'admin') THEN RETURN true; END IF;
  IF NOT public.has_server_permission(server_uuid, 'manage_roles') THEN RETURN false; END IF;

  SELECT max(role.position) INTO actor_top_position
  FROM public.server_member_roles AS assignment
  JOIN public.server_roles AS role ON role.id = assignment.role_id AND role.server_id = assignment.server_id
  WHERE assignment.server_id = server_uuid AND assignment.user_id = auth.uid()
    AND role.permissions ->> 'manage_roles' = 'true';
  RETURN actor_top_position IS NOT NULL AND target_position < actor_top_position;
END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_server_role_position(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_server_role_position(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_server_member_roles(server_uuid uuid, target_user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_top_position integer; target_top_position integer; target_system_role text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = server_uuid AND user_id = target_user) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.servers WHERE id = server_uuid AND owner_id = auth.uid()) THEN RETURN true; END IF;

  SELECT role INTO target_system_role FROM public.server_members WHERE server_id = server_uuid AND user_id = target_user;
  IF target_system_role IN ('owner', 'admin') THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.server_members WHERE server_id = server_uuid AND user_id = auth.uid() AND role = 'admin') THEN RETURN true; END IF;
  IF NOT public.has_server_permission(server_uuid, 'manage_roles') THEN RETURN false; END IF;

  SELECT max(role.position) INTO actor_top_position
  FROM public.server_member_roles AS assignment
  JOIN public.server_roles AS role ON role.id = assignment.role_id AND role.server_id = assignment.server_id
  WHERE assignment.server_id = server_uuid AND assignment.user_id = auth.uid()
    AND role.permissions ->> 'manage_roles' = 'true';
  SELECT max(role.position) INTO target_top_position
  FROM public.server_member_roles AS assignment
  JOIN public.server_roles AS role ON role.id = assignment.role_id AND role.server_id = assignment.server_id
  WHERE assignment.server_id = server_uuid AND assignment.user_id = target_user;
  RETURN actor_top_position IS NOT NULL AND coalesce(target_top_position, -2147483648) < actor_top_position;
END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_server_member_roles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_server_member_roles(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_server_role_assignment(server_uuid uuid, target_user uuid, role_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_roles AS role
    WHERE role.id = role_uuid AND role.server_id = server_uuid
      AND public.can_manage_server_role_position(server_uuid, role.position)
      AND public.can_manage_server_member_roles(server_uuid, target_user)
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_server_role_assignment(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_server_role_assignment(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Managers manage server roles" ON public.server_roles;
CREATE POLICY "Managers manage server roles" ON public.server_roles FOR ALL TO authenticated
  USING (public.has_server_permission(server_id, 'manage_roles') AND public.can_manage_server_role_position(server_id, position))
  WITH CHECK (public.has_server_permission(server_id, 'manage_roles') AND public.can_manage_server_role_position(server_id, position));

DROP POLICY IF EXISTS "Managers assign roles" ON public.server_member_roles;
CREATE POLICY "Managers assign roles" ON public.server_member_roles FOR ALL TO authenticated
  USING (public.can_manage_server_role_assignment(server_id, user_id, role_id))
  WITH CHECK (public.can_manage_server_role_assignment(server_id, user_id, role_id));

CREATE OR REPLACE FUNCTION public.reorder_server_roles(server_uuid uuid, ordered_role_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing_ids uuid[]; role_total integer; role_index integer; requested_position integer; current_position integer;
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
    requested_position := role_total - role_index;
    SELECT position INTO current_position FROM public.server_roles WHERE id = ordered_role_ids[role_index] AND server_id = server_uuid;
    IF NOT public.can_manage_server_role_position(server_uuid, requested_position)
       OR (NOT public.can_manage_server_role_position(server_uuid, current_position) AND current_position <> requested_position) THEN
      RAISE EXCEPTION 'Yalnızca kendi rolünün altındaki rolleri sıralayabilirsin';
    END IF;
    UPDATE public.server_roles SET position = requested_position
      WHERE id = ordered_role_ids[role_index] AND server_id = server_uuid;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_server_roles(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_server_roles(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_server_role_for_members(server_uuid uuid, target_users uuid[], role_uuid uuid, should_assign boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_count integer; changed_count integer;
BEGIN
  target_count := coalesce(array_length(target_users, 1), 0);
  IF target_count < 1 OR target_count > 100 THEN RAISE EXCEPTION 'Bir seferde 1–100 üye seçebilirsin'; END IF;
  IF (SELECT count(DISTINCT target_user) FROM unnest(target_users) AS selected(target_user)) <> target_count THEN RAISE EXCEPTION 'Üye listesinde tekrar eden seçim var'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.server_roles WHERE id = role_uuid AND server_id = server_uuid) THEN RAISE EXCEPTION 'Rol bulunamadı'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(target_users) AS selected(target_user)
    WHERE NOT public.can_manage_server_role_assignment(server_uuid, target_user, role_uuid)
  ) THEN RAISE EXCEPTION 'Seçimde rol hiyerarşisi gereği işlem yapamayacağın bir üye veya rol var'; END IF;

  IF should_assign THEN
    INSERT INTO public.server_member_roles(server_id, user_id, role_id)
      SELECT server_uuid, selected.target_user, role_uuid FROM unnest(target_users) AS selected(target_user)
      ON CONFLICT (server_id, user_id, role_id) DO NOTHING;
  ELSE
    DELETE FROM public.server_member_roles WHERE server_id = server_uuid AND role_id = role_uuid AND user_id = ANY(target_users);
  END IF;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;
REVOKE ALL ON FUNCTION public.set_server_role_for_members(uuid, uuid[], uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_server_role_for_members(uuid, uuid[], uuid, boolean) TO authenticated;
