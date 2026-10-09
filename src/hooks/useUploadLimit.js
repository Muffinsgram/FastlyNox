import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const DEFAULT_LIMITS = {
  attachments: 10 * 1024 * 1024,
  'social-media': 10 * 1024 * 1024,
  'profile-media': 8 * 1024 * 1024,
};

export async function getUploadLimit(bucket) {
  const fallback = DEFAULT_LIMITS[bucket] || 10 * 1024 * 1024;
  const { data, error } = await supabase.rpc('get_fastcord_upload_limit', { bucket_name: bucket });
  return !error && Number.isFinite(Number(data)) && Number(data) > 0 ? Number(data) : fallback;
}

export function useUploadLimit(bucket, userId) {
  const [limit, setLimit] = useState(DEFAULT_LIMITS[bucket] || 10 * 1024 * 1024);

  useEffect(() => {
    let active = true;
    if (!userId) {
      return () => { active = false; };
    }
    const refresh = () => {
      void supabase.rpc('get_fastcord_upload_limit', { bucket_name: bucket }).then(({ data, error }) => {
        if (active && !error && Number.isFinite(Number(data)) && Number(data) > 0) setLimit(Number(data));
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('fastcord:upload-limits-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('fastcord:upload-limits-changed', refresh);
    };
  }, [bucket, userId]);

  return userId ? limit : (DEFAULT_LIMITS[bucket] || 10 * 1024 * 1024);
}
