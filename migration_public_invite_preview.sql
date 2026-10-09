-- Safe anonymous metadata for public invite landing pages and the public sitemap.
-- Run once in the Supabase SQL editor before deploying to Vercel.

CREATE OR REPLACE FUNCTION public.get_server_invite_preview(invite_code text)
RETURNS TABLE(server_name text, server_icon_url text, member_count bigint, is_vanity boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.name,
         s.icon_url,
         (SELECT count(*) FROM public.server_members AS sm WHERE sm.server_id = s.id),
         lower(coalesce(s.vanity_url, '')) = lower(trim(coalesce(invite_code, '')))
  FROM public.servers AS s
  WHERE length(trim(coalesce(invite_code, ''))) BETWEEN 3 AND 32
    AND (
      lower(coalesce(s.vanity_url, '')) = lower(trim(invite_code))
      OR EXISTS (
        SELECT 1
        FROM public.server_invites AS i
        WHERE i.server_id = s.id
          AND lower(i.code) = lower(trim(invite_code))
          AND i.revoked_at IS NULL
          AND (i.expires_at IS NULL OR i.expires_at > now())
          AND (i.max_uses IS NULL OR i.uses < i.max_uses)
      )
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_server_invite_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_server_invite_preview(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_server_invites()
RETURNS TABLE(invite_slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.vanity_url
  FROM public.servers AS s
  WHERE s.vanity_url IS NOT NULL
    AND s.vanity_url ~ '^[a-z0-9][a-z0-9-]{2,23}$'
  ORDER BY s.vanity_url;
$$;

REVOKE ALL ON FUNCTION public.list_public_server_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_server_invites() TO anon, authenticated;
