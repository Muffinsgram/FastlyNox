-- Apply once in Supabase SQL Editor to enable role ordering controls.
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
