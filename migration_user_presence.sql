-- Shared account status and online friend list. Run once in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS public.user_presence_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'idle', 'dnd', 'invisible', 'offline')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_presence_status_updated_idx
  ON public.user_presence_status (updated_at DESC);

ALTER TABLE public.user_presence_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_presence_status FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_presence_status TO authenticated;

DROP POLICY IF EXISTS "Users can read own and friends presence" ON public.user_presence_status;
DROP POLICY IF EXISTS "Users can insert own presence" ON public.user_presence_status;
DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence_status;

CREATE POLICY "Users can read own and friends presence"
ON public.user_presence_status FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = user_presence_status.user_id)
        OR (f.addressee_id = auth.uid() AND f.requester_id = user_presence_status.user_id))
  )
  OR EXISTS (
    SELECT 1
    FROM public.server_members viewer
    JOIN public.server_members target ON target.server_id = viewer.server_id
    WHERE viewer.user_id = auth.uid()
      AND target.user_id = user_presence_status.user_id
  )
);

CREATE POLICY "Users can insert own presence"
ON public.user_presence_status FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own presence"
ON public.user_presence_status FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'user_presence_status'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence_status;
  END IF;
END;
$$;
