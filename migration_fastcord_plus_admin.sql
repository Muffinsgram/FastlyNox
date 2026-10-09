-- Run after the base server/profile/storage migrations and migration_profile_badges.sql.
-- Plus is currently provisioned by Fastlynox staff; no payment provider is wired yet.
CREATE TABLE IF NOT EXISTS public.fastcord_plans (
  plan_key text PRIMARY KEY,
  display_name text NOT NULL,
  attachment_limit_bytes bigint NOT NULL,
  social_limit_bytes bigint NOT NULL,
  profile_media_limit_bytes bigint NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CHECK (attachment_limit_bytes BETWEEN 1048576 AND 104857600),
  CHECK (social_limit_bytes BETWEEN 1048576 AND 104857600),
  CHECK (profile_media_limit_bytes BETWEEN 1048576 AND 26214400)
);

INSERT INTO public.fastcord_plans (plan_key, display_name, attachment_limit_bytes, social_limit_bytes, profile_media_limit_bytes, sort_order) VALUES
  ('free', 'Fastlynox', 10485760, 10485760, 8388608, 0),
  ('plus', 'Fastlynox Plus', 104857600, 104857600, 26214400, 1)
ON CONFLICT (plan_key) DO UPDATE SET display_name = EXCLUDED.display_name, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.fastcord_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES public.fastcord_plans(plan_key),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fastcord_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fastcord_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "FastCord plans are readable" ON public.fastcord_plans;
CREATE POLICY "FastCord plans are readable" ON public.fastcord_plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users and staff can read FastCord subscriptions" ON public.fastcord_subscriptions;
CREATE POLICY "Users and staff can read FastCord subscriptions" ON public.fastcord_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR coalesce(auth.jwt() -> 'app_metadata' ->> 'platform_staff', 'false') = 'true');
GRANT SELECT ON public.fastcord_plans, public.fastcord_subscriptions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fastcord_plans, public.fastcord_subscriptions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_fastcord_account_plan(target_user uuid DEFAULT auth.uid())
RETURNS TABLE (
  plan_key text,
  display_name text,
  attachment_limit_bytes bigint,
  social_limit_bytes bigint,
  profile_media_limit_bytes bigint,
  expires_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR (target_user <> auth.uid() AND coalesce(auth.jwt() -> 'app_metadata' ->> 'platform_staff', 'false') <> 'true') THEN
    RAISE EXCEPTION 'Not allowed to inspect this Fastlynox account';
  END IF;
  RETURN QUERY
    SELECT plan.plan_key, plan.display_name, plan.attachment_limit_bytes, plan.social_limit_bytes, plan.profile_media_limit_bytes, subscription.expires_at
    FROM public.fastcord_plans AS plan
    LEFT JOIN public.fastcord_subscriptions AS subscription
      ON subscription.plan_key = plan.plan_key AND subscription.user_id = target_user
      AND subscription.status = 'active' AND (subscription.expires_at IS NULL OR subscription.expires_at > now())
    WHERE plan.plan_key = coalesce(subscription.plan_key, 'free')
    LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.get_fastcord_account_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fastcord_account_plan(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_fastcord_upload_limit(bucket_name text)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE limits record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO limits FROM public.get_fastcord_account_plan(auth.uid());
  RETURN CASE bucket_name
    WHEN 'attachments' THEN limits.attachment_limit_bytes
    WHEN 'social-media' THEN limits.social_limit_bytes
    WHEN 'profile-media' THEN limits.profile_media_limit_bytes
    ELSE NULL
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.get_fastcord_upload_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fastcord_upload_limit(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_fastcord_subscription(target_user uuid, target_plan text, subscription_expiry timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt() -> 'app_metadata' ->> 'platform_staff', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Only verified Fastlynox staff can manage Plus';
  END IF;
  IF target_plan = 'free' THEN
    DELETE FROM public.fastcord_subscriptions WHERE user_id = target_user;
    RETURN;
  END IF;
  IF target_plan <> 'plus' OR NOT EXISTS (SELECT 1 FROM public.fastcord_plans WHERE plan_key = target_plan) THEN
    RAISE EXCEPTION 'Unknown Fastlynox plan';
  END IF;
  INSERT INTO public.fastcord_subscriptions (user_id, plan_key, status, expires_at, granted_by, updated_at)
  VALUES (target_user, target_plan, 'active', subscription_expiry, auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET plan_key = EXCLUDED.plan_key, status = 'active', expires_at = EXCLUDED.expires_at, granted_by = EXCLUDED.granted_by, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_fastcord_subscription(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_fastcord_subscription(uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_fastcord_plan_limits(target_plan text, attachment_mb integer, social_mb integer, profile_media_mb integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt() -> 'app_metadata' ->> 'platform_staff', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Only verified Fastlynox staff can change plan limits';
  END IF;
  IF attachment_mb NOT BETWEEN 1 AND 100 OR social_mb NOT BETWEEN 1 AND 100 OR profile_media_mb NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Limits are outside the allowed storage range';
  END IF;
  UPDATE public.fastcord_plans SET
    attachment_limit_bytes = attachment_mb::bigint * 1048576,
    social_limit_bytes = social_mb::bigint * 1048576,
    profile_media_limit_bytes = profile_media_mb::bigint * 1048576
  WHERE plan_key = target_plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Fastlynox plan'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_fastcord_plan_limits(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_fastcord_plan_limits(text, integer, integer, integer) TO authenticated;

-- The bucket limit is the hard cap; RLS checks the user's plan-specific cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('attachments', 'attachments', false, 104857600, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]),
  ('social-media', 'social-media', true, 104857600, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]),
  ('profile-media', 'profile-media', true, 26214400, ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload attachments to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Giriş yapanlar dosya yükleyebilir" ON storage.objects;
CREATE POLICY "Users upload attachments to their own folder" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text
  AND coalesce((metadata->>'size')::bigint, 0) BETWEEN 1 AND public.get_fastcord_upload_limit('attachments')
  AND metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/gif')
);

DROP POLICY IF EXISTS "Users upload their own social media" ON storage.objects;
CREATE POLICY "Users upload their own social media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'social-media' AND (storage.foldername(name))[1] = auth.uid()::text
  AND coalesce((metadata->>'size')::bigint, 0) BETWEEN 1 AND public.get_fastcord_upload_limit('social-media')
  AND metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/gif')
);

DROP POLICY IF EXISTS "Users upload their own profile media" ON storage.objects;
CREATE POLICY "Users upload their own profile media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text
  AND coalesce((metadata->>'size')::bigint, 0) BETWEEN 1 AND public.get_fastcord_upload_limit('profile-media')
  AND metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/gif')
);

-- Keep the plan cap in force if a future upload path uses Storage upsert/update.
DROP POLICY IF EXISTS "Users update their own profile media" ON storage.objects;
CREATE POLICY "Users update their own profile media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (
  bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text
  AND coalesce((metadata->>'size')::bigint, 0) BETWEEN 1 AND public.get_fastcord_upload_limit('profile-media')
  AND metadata->>'mimetype' IN ('image/jpeg','image/png','image/webp','image/gif')
);
