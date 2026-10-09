-- Repairs profile-media INSERT policy failures for avatar, banner and server icons.
-- The bucket still enforces its configured maximum size and allowed MIME types.
-- FastCord Plus client limits remain checked before upload; when Storage includes
-- metadata, the policy also enforces the account-specific plan limit.

DROP POLICY IF EXISTS "Users upload their own profile media" ON storage.objects;
CREATE POLICY "Users upload their own profile media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND CASE
      WHEN coalesce(metadata->>'size', '') ~ '^[0-9]+$'
        THEN (metadata->>'size')::bigint BETWEEN 1 AND public.get_fastcord_upload_limit('profile-media')
      ELSE true
    END
    AND (metadata->>'mimetype' IS NULL OR metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif'))
  );

DROP POLICY IF EXISTS "Users update their own profile media" ON storage.objects;
CREATE POLICY "Users update their own profile media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND CASE
      WHEN coalesce(metadata->>'size', '') ~ '^[0-9]+$'
        THEN (metadata->>'size')::bigint BETWEEN 1 AND public.get_fastcord_upload_limit('profile-media')
      ELSE true
    END
    AND (metadata->>'mimetype' IS NULL OR metadata->>'mimetype' IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif'))
  );
