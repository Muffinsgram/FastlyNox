-- User facing privacy, block controls, and temporary profile status.
-- Run in Supabase SQL Editor after the base RLS/auth migrations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.user_privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dm_policy text NOT NULL DEFAULT 'everyone' CHECK (dm_policy IN ('everyone','friends','nobody')),
  show_online boolean NOT NULL DEFAULT true,
  read_receipts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_privacy_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_privacy_settings TO authenticated;
REVOKE DELETE ON public.user_privacy_settings FROM anon, authenticated;
DROP POLICY IF EXISTS "Privacy settings are visible to signed in users" ON public.user_privacy_settings;
CREATE POLICY "Privacy settings are visible to signed in users" ON public.user_privacy_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users manage their own privacy settings" ON public.user_privacy_settings;
CREATE POLICY "Users manage their own privacy settings" ON public.user_privacy_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update their own privacy settings" ON public.user_privacy_settings;
CREATE POLICY "Users update their own privacy settings" ON public.user_privacy_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx ON public.user_blocks (blocked_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
REVOKE UPDATE ON public.user_blocks FROM anon, authenticated;
DROP POLICY IF EXISTS "Users read their own block list" ON public.user_blocks;
CREATE POLICY "Users read their own block list" ON public.user_blocks FOR SELECT TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS "Users block accounts themselves" ON public.user_blocks;
CREATE POLICY "Users block accounts themselves" ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());
DROP POLICY IF EXISTS "Users unblock accounts themselves" ON public.user_blocks;
CREATE POLICY "Users unblock accounts themselves" ON public.user_blocks FOR DELETE TO authenticated USING (blocker_id = auth.uid());

CREATE OR REPLACE FUNCTION public.can_contact_user(sender_id uuid, target_id uuid, for_dm boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() = sender_id AND sender_id <> target_id
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = sender_id AND b.blocked_id = target_id)
         OR (b.blocker_id = target_id AND b.blocked_id = sender_id)
    )
    AND (NOT for_dm OR coalesce((SELECT settings.dm_policy FROM public.user_privacy_settings settings WHERE settings.user_id = target_id), 'everyone') = 'everyone'
      OR (coalesce((SELECT settings.dm_policy FROM public.user_privacy_settings settings WHERE settings.user_id = target_id), 'everyone') = 'friends'
        AND EXISTS (SELECT 1 FROM public.friendships f WHERE f.status = 'accepted' AND ((f.requester_id = sender_id AND f.addressee_id = target_id) OR (f.requester_id = target_id AND f.addressee_id = sender_id)))))
$$;
REVOKE ALL ON FUNCTION public.can_contact_user(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_contact_user(uuid, uuid, boolean) TO authenticated;

DROP POLICY IF EXISTS "DM participants can create channels" ON public.dm_channels;
CREATE POLICY "DM participants can create channels" ON public.dm_channels FOR INSERT TO authenticated WITH CHECK (
  auth.uid() IN (user1_id, user2_id) AND user1_id <> user2_id
  AND public.can_contact_user(auth.uid(), CASE WHEN auth.uid() = user1_id THEN user2_id ELSE user1_id END, true)
);
DROP POLICY IF EXISTS "Sadece sohbettekiler DM mesajı atabilir" ON public.dm_messages;
CREATE POLICY "Sadece sohbettekiler DM mesajı atabilir" ON public.dm_messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.dm_channels d
    WHERE d.id = dm_channel_id AND auth.uid() IN (d.user1_id, d.user2_id)
      AND public.can_contact_user(auth.uid(), CASE WHEN auth.uid() = d.user1_id THEN d.user2_id ELSE d.user1_id END, true)
  )
);
DROP POLICY IF EXISTS "Users can send their own friend requests" ON public.friendships;
CREATE POLICY "Users can send their own friend requests" ON public.friendships FOR INSERT TO authenticated WITH CHECK (
  requester_id = auth.uid() AND addressee_id <> auth.uid() AND status = 'pending'
  AND public.can_contact_user(requester_id, addressee_id, false)
);
