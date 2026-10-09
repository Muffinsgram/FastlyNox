-- Staff badge assignment is checked against the trusted JWT app_metadata claim.
-- Set platform_staff=true for trusted operators through Supabase Auth Admin;
-- client-editable user_metadata is intentionally not accepted.
CREATE TABLE IF NOT EXISTS public.profile_badge_definitions (
  badge_key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#9baaff',
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.profile_badge_definitions (badge_key, name, description, color, sort_order) VALUES
  ('staff', 'Fastlynox Ekibi', 'Fastlynox ekibinin doğrulanmış üyesi.', '#a78bfa', 10),
  ('bug_hunter', 'Hata Avcısı', 'Fastlynox hatalarının bulunmasına ve düzeltilmesine katkı sağladı.', '#fb7185', 20),
  ('early_supporter', 'İlk Destekçiler', 'Fastlynox topluluğuna ilk dönemlerinde katıldı.', '#fbbf24', 30),
  ('community_builder', 'Topluluk Elçisi', 'Topluluğun büyümesine ve iyi kalmasına katkı sağladı.', '#34d399', 40),
  ('voice_pioneer', 'Ses Öncüsü', 'Fastlynox ses özelliklerinin geliştirilmesine katkı sağladı.', '#22d3ee', 50),
  ('creator', 'İçerik Üreticisi', 'Fastlynox topluluğunda doğrulanmış içerik üreticisi.', '#f472b6', 60),
  ('verified', 'Doğrulanmış', 'Fastlynox tarafından doğrulanmış profil.', '#60a5fa', 70),
  ('server_owner', 'Sunucu Sahibi', 'Bir Fastlynox sunucusunun sahibi.', '#fb923c', 80)
ON CONFLICT (badge_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.profile_badges (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL REFERENCES public.profile_badge_definitions(badge_key) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  awarded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS profile_badges_user_awarded_idx
  ON public.profile_badges (user_id, awarded_at DESC);

ALTER TABLE public.profile_badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Badge catalog is readable" ON public.profile_badge_definitions;
CREATE POLICY "Badge catalog is readable" ON public.profile_badge_definitions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Profiles badges are readable" ON public.profile_badges;
CREATE POLICY "Profiles badges are readable" ON public.profile_badges
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
GRANT SELECT ON public.profile_badge_definitions, public.profile_badges TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.profile_badge_definitions, public.profile_badges FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_profile_badge(target_user uuid, target_badge text, should_award boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(auth.jwt() -> 'app_metadata' ->> 'platform_staff', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Only verified Fastlynox staff can manage profile badges';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profile_badge_definitions WHERE badge_key = target_badge) THEN
    RAISE EXCEPTION 'Unknown profile badge';
  END IF;
  IF should_award THEN
    INSERT INTO public.profile_badges (user_id, badge_key, awarded_by)
    VALUES (target_user, target_badge, auth.uid())
    ON CONFLICT (user_id, badge_key) DO NOTHING;
  ELSE
    DELETE FROM public.profile_badges WHERE user_id = target_user AND badge_key = target_badge;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_profile_badge(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_badge(uuid, text, boolean) TO authenticated;
