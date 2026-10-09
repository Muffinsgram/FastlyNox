import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { SignJWT } from 'jose'
import { createClient } from '@supabase/supabase-js'

const livekitTokenPlugin = (env) => ({
  name: 'livekit-token-plugin',
  configureServer: (server) => installLiveKitTokenRoute(server, env),
  configurePreviewServer: (server) => installLiveKitTokenRoute(server, env),
});

function installLiveKitTokenRoute(server, env) {
  server.middlewares.use(async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/livekit-token') return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const respond = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (req.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY || !env.VITE_LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return respond(503, { error: 'Voice token service is not configured.' });
    }

    const accessToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return respond(401, { error: 'Authentication required.' });

    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) return respond(413, { error: 'Request is too large.' });
      }
      const { channelId, dmChannelId } = JSON.parse(body || '{}');
      if (typeof (dmChannelId || channelId) !== 'string' || (dmChannelId || channelId).length > 128) return respond(400, { error: 'Invalid channel.' });

      const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError || !authData.user) return respond(401, { error: 'Authentication expired. Sign in again.' });

      let roomId;
      if (dmChannelId) {
        const { data: dm, error: dmError } = await supabase.from('dm_channels').select('id, user1_id, user2_id').eq('id', dmChannelId).maybeSingle();
        if (dmError) throw dmError;
        if (!dm) return respond(404, { error: 'DM call room not found.' });
        if (![dm.user1_id, dm.user2_id].includes(authData.user.id)) return respond(403, { error: 'You are not a participant in this DM.' });
        roomId = `direct-${dm.id}`;
      } else {
        const { data: channel, error: channelError } = await supabase
          .from('channels').select('id, server_id, type').eq('id', channelId).maybeSingle();
        if (channelError) throw channelError;
        if (!channel || channel.type !== 'voice') return respond(404, { error: 'Voice channel not found.' });

        const { data: membership, error: membershipError } = await supabase
          .from('server_members').select('user_id').eq('server_id', channel.server_id)
          .eq('user_id', authData.user.id).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) return respond(403, { error: 'You are not a member of this server.' });
        roomId = channel.id;
      }

      const { data: profile } = await supabase
        .from('profiles').select('username').eq('id', authData.user.id).maybeSingle();
      const token = await new SignJWT({
        name: profile?.username || authData.user.email || 'User',
        video: { room: roomId, roomJoin: true, canPublish: true, canSubscribe: true },
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(env.VITE_LIVEKIT_API_KEY)
        .setSubject(authData.user.id)
        .setExpirationTime('10m')
        .sign(new TextEncoder().encode(env.LIVEKIT_API_SECRET));

      return respond(200, { token });
    } catch {
      return respond(500, { error: 'Could not authorize this voice session.' });
    }
  });
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), livekitTokenPlugin(env)],
  }
})
