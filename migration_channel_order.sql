-- Run after the existing channel/server RLS policies in the Supabase SQL editor.
DO $$
DECLARE
  needs_initial_order boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'channels' AND column_name = 'sort_order'
  ) INTO needs_initial_order;

  ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

  IF needs_initial_order THEN
    WITH ordered AS (
      SELECT id, row_number() OVER (PARTITION BY category_id ORDER BY ctid) - 1 AS position
      FROM public.channels
    )
    UPDATE public.channels AS channel
    SET sort_order = ordered.position::integer
    FROM ordered
    WHERE channel.id = ordered.id;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS channels_category_sort_order_idx
  ON public.channels (category_id, sort_order);

CREATE OR REPLACE FUNCTION public.reorder_server_channels(
  server_uuid uuid,
  category_uuid uuid,
  ordered_channel_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  expected_count integer;
  changed_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_server_role(server_uuid, 'owner') OR
    public.has_server_role(server_uuid, 'admin')
  ) THEN
    RAISE EXCEPTION 'Only server owners and admins can reorder channels';
  END IF;

  SELECT count(*) INTO expected_count
  FROM public.channels
  WHERE server_id = server_uuid AND category_id = category_uuid;

  IF ordered_channel_ids IS NULL OR cardinality(ordered_channel_ids) <> expected_count OR
     (SELECT count(DISTINCT channel_id) FROM unnest(ordered_channel_ids) AS items(channel_id)) <> expected_count THEN
    RAISE EXCEPTION 'Channel order is incomplete or contains duplicates';
  END IF;

  UPDATE public.channels AS channel
  SET sort_order = ordering.position::integer - 1
  FROM unnest(ordered_channel_ids) WITH ORDINALITY AS ordering(channel_id, position)
  WHERE channel.id = ordering.channel_id
    AND channel.server_id = server_uuid
    AND channel.category_id = category_uuid;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_count THEN
    RAISE EXCEPTION 'Channel order does not match this category';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_server_channels(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_server_channels(uuid, uuid, uuid[]) TO authenticated;

DO $$
DECLARE
  relation_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH relation_name IN ARRAY ARRAY['channels', 'categories', 'servers'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = relation_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', relation_name);
      END IF;
    END LOOP;
  END IF;
END;
$$;
