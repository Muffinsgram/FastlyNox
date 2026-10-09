import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const matchesSecret = async (provided: string, expected: string) => {
  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedDigest);
  const right = new Uint8Array(expectedDigest);
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const cronSecret = Deno.env.get('ATTACHMENT_CLEANUP_SECRET');
  const providedSecret = request.headers.get('x-cleanup-secret') || '';
  if (!cronSecret || !await matchesSecret(providedSecret, cronSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Cleanup service is not configured' }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expired, error: queryError } = await supabase
    .schema('storage')
    .from('objects')
    .select('name')
    .eq('bucket_id', 'attachments')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(500);

  if (queryError) return json({ error: 'Could not find expired attachments' }, 500);
  const paths = (expired || []).map(({ name }) => name);
  if (paths.length) {
    const { error: deleteError } = await supabase.storage.from('attachments').remove(paths);
    if (deleteError) return json({ error: 'Could not delete expired attachment files' }, 500);

    // Remove dead references from both chat types so clients stop requesting deleted files.
    const [serverUpdate, dmUpdate] = await Promise.all([
      supabase.from('messages').update({ image_url: null }).in('image_url', paths),
      supabase.from('dm_messages').update({ image_url: null }).in('image_url', paths),
    ]);
    if (serverUpdate.error || dmUpdate.error) {
      return json({ deleted: paths.length, warning: 'Files deleted; some old message references could not be cleared.' }, 207);
    }
  }

  // GIPHY-hosted GIFs cannot be deleted from the provider, but their chat links expire at the same 7-day cutoff.
  const [serverGifCleanup, dmGifCleanup] = await Promise.all([
    supabase.from('messages').update({ image_url: null }).lt('created_at', cutoff).ilike('image_url', 'https://%.giphy.com/%'),
    supabase.from('dm_messages').update({ image_url: null }).lt('created_at', cutoff).ilike('image_url', 'https://%.giphy.com/%'),
  ]);
  if (serverGifCleanup.error || dmGifCleanup.error) {
    return json({ deleted: paths.length, warning: 'Some expired GIF links could not be cleared.' }, 207);
  }

  // Stories disappear from the feed after 24 hours. Remove their backing image
  // objects on the same scheduled sweep so expired stories do not consume storage.
  const { data: expiredStories, error: storyQueryError } = await supabase
    .from('user_stories')
    .select('id, media_url')
    .lte('expires_at', new Date().toISOString())
    .limit(500);
  const missingStoriesTable = storyQueryError?.code === '42P01' || storyQueryError?.code === 'PGRST205';
  if (storyQueryError && !missingStoriesTable) return json({ error: 'Could not find expired stories' }, 500);

  let removedStories = 0;
  if (expiredStories?.length) {
    const prefix = '/storage/v1/object/public/social-media/';
    const storyPaths = expiredStories.flatMap(({ media_url }) => {
      if (!media_url) return [];
      try {
        const pathname = new URL(media_url).pathname;
        const markerIndex = pathname.indexOf(prefix);
        return markerIndex < 0 ? [] : [decodeURIComponent(pathname.slice(markerIndex + prefix.length))];
      } catch { return []; }
    });
    if (storyPaths.length) {
      const { error: storyMediaError } = await supabase.storage.from('social-media').remove(storyPaths);
      if (storyMediaError) return json({ deleted: paths.length, warning: 'Expired stories were found, but some media files could not be removed.' }, 207);
    }
    const { error: storyDeleteError } = await supabase.from('user_stories').delete().in('id', expiredStories.map(({ id }) => id));
    if (storyDeleteError) return json({ deleted: paths.length, warning: 'Expired story media was deleted, but story records remain.' }, 207);
    removedStories = expiredStories.length;
  }

  return json({ deleted: paths.length, removedStories });
});
