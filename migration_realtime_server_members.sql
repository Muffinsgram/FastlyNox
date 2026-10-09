-- Keep server membership changes live in the client (member list and server rail).
-- Safe to run more than once in Supabase SQL Editor.
DO $$
BEGIN
  IF to_regclass('public.server_members') IS NOT NULL THEN
    -- Include user_id in DELETE payloads so filtered membership subscriptions
    -- can identify which signed-in account needs to refresh.
    ALTER TABLE public.server_members REPLICA IDENTITY FULL;

    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'server_members'
      ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;
    END IF;
  END IF;
END $$;
