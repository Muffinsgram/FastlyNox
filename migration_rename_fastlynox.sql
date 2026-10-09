-- Update persisted branding while keeping existing database identifiers intact.
BEGIN;

UPDATE public.fastcord_plans
SET display_name = CASE plan_key
  WHEN 'plus' THEN 'Fastlynox Plus'
  ELSE 'Fastlynox'
END
WHERE plan_key IN ('free', 'plus');

UPDATE public.profile_badge_definitions
SET name = replace(name, 'FastCord', 'Fastlynox'),
    description = replace(description, 'FastCord', 'Fastlynox')
WHERE name LIKE '%FastCord%' OR description LIKE '%FastCord%';

COMMIT;
