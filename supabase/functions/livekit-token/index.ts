import { createClient } from 'npm:@supabase/supabase-js@2';
import { SignJWT } from 'npm:jose@6';
import { RoomServiceClient } from 'npm:livekit-server-sdk@2.19.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
  if (Number(request.headers.get('content-length') || 0) > 8192) {
    return respond(413, { error: 'Request is too large.' });
  }

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return respond(401, { error: 'Authentication required.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  const liveKitUrl = Deno.env.get('LIVEKIT_URL') || Deno.env.get('VITE_LIVEKIT_URL');
  if (!supabaseUrl || !anonKey || !apiKey || !apiSecret) {
    return respond(503, { error: 'Voice token service is not configured.' });
  }

  try {
    const body = await request.json();
    const channelId = body?.channelId;
    const dmChannelId = body?.dmChannelId;
    const action = body?.action;
    if (typeof (dmChannelId || channelId) !== 'string' || (dmChannelId || channelId).length > 128) {
      return respond(400, { error: 'Invalid channel.' });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return respond(401, { error: 'Authentication expired. Sign in again.' });

    if (action === 'list_participants') {
      if (dmChannelId) return respond(400, { error: 'DM roster is not supported by this action.' });
      const { data: channel, error: channelError } = await supabase
        .from('channels').select('id, server_id, type').eq('id', channelId).maybeSingle();
      if (channelError) throw channelError;
      if (!channel || channel.type !== 'voice') return respond(404, { error: 'Voice channel not found.' });
      const { data: membership, error: membershipError } = await supabase.from('server_members')
        .select('user_id').eq('server_id', channel.server_id).eq('user_id', user.id).maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return respond(403, { error: 'You are not a member of this server.' });
      const { data: canView, error: viewError } = await supabase.rpc('has_channel_permission', {
        channel_uuid: channel.id,
        permission_key: 'view_channel',
      });
      if (viewError) return respond(503, { error: 'Voice channel permissions are unavailable. Apply the server permissions migrations.' });
      if (!canView) return respond(403, { error: 'You do not have permission to view this voice channel.' });
      if (!liveKitUrl) return respond(503, { error: 'LiveKit server URL is not configured.' });
      const roomServiceUrl = liveKitUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
      const roomService = new RoomServiceClient(roomServiceUrl, apiKey, apiSecret);
      // LiveKit returns an error when asked to list participants for a room that
      // has never been created (or has already closed). Treat that as a valid
      // empty roster; only query participants when the room exists.
      const rooms = await roomService.listRooms([channel.id]);
      if (!rooms.some(room => room.name === channel.id)) return respond(200, { participants: [] });
      const liveParticipants = await roomService.listParticipants(channel.id);
      const userIds = liveParticipants.map(participant => participant.identity).filter(Boolean);
      // Roster visibility must not depend on the optional moderation marker query.
      // A policy/schema issue there should only omit the extra icons, never hide everyone.
      const moderationResult = userIds.length
        ? await supabase.from('server_voice_moderation').select('user_id,server_muted,server_deafened').eq('channel_id', channel.id).in('user_id', userIds)
        : { data: [], error: null };
      const moderationByUser = new Map((moderationResult.data || []).map(row => [row.user_id, row]));
      const participants = liveParticipants.map(participant => {
        const moderation = moderationByUser.get(participant.identity) || {};
        const microphoneTrack = participant.tracks?.find(track => Number(track.source) === 2);
        return {
          id: participant.identity,
          microphoneEnabled: Boolean(microphoneTrack && !microphoneTrack.muted && !moderation.server_muted),
          deafened: false,
          serverMuted: Boolean(moderation.server_muted),
          serverDeafened: Boolean(moderation.server_deafened),
        };
      });
      return respond(200, { participants });
    }

    let roomId: string;
    let canSubscribe = true;
    let canPublishSources = ['microphone', 'camera', 'screen_share', 'screen_share_audio'];
    if (dmChannelId) {
      const { data: dm, error: dmError } = await supabase.from('dm_channels')
        .select('id, user1_id, user2_id').eq('id', dmChannelId).maybeSingle();
      if (dmError) throw dmError;
      if (!dm) return respond(404, { error: 'DM call room not found.' });
      if (![dm.user1_id, dm.user2_id].includes(user.id)) return respond(403, { error: 'You are not a participant in this DM.' });
      roomId = `direct-${dm.id}`;
    } else {
      const { data: channel, error: channelError } = await supabase
        .from('channels').select('id, server_id, type').eq('id', channelId).maybeSingle();
      if (channelError) throw channelError;
      if (!channel || channel.type !== 'voice') return respond(404, { error: 'Voice channel not found.' });

      const { data: membership, error: membershipError } = await supabase
        .from('server_members').select('user_id').eq('server_id', channel.server_id)
        .eq('user_id', user.id).maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return respond(403, { error: 'You are not a member of this server.' });
      const [viewResult, connectResult] = await Promise.all([
        supabase.rpc('has_channel_permission', { channel_uuid: channel.id, permission_key: 'view_channel' }),
        supabase.rpc('has_channel_permission', { channel_uuid: channel.id, permission_key: 'connect' }),
      ]);
      if (viewResult.error || connectResult.error) return respond(503, { error: 'Voice channel permissions are unavailable. Apply the server permissions migrations.' });
      if (!viewResult.data || !connectResult.data) return respond(403, { error: 'You do not have permission to view or join this voice channel.' });
      const { data: moderation } = await supabase.from('server_voice_moderation').select('server_muted,server_deafened')
        .eq('channel_id', channel.id).eq('user_id', user.id).maybeSingle();
      if (moderation?.server_muted) canPublishSources = ['camera', 'screen_share', 'screen_share_audio'];
      if (moderation?.server_deafened) canSubscribe = false;
      roomId = channel.id;
    }

    const { data: profile } = await supabase
      .from('profiles').select('username').eq('id', user.id).maybeSingle();
    const token = await new SignJWT({
      name: profile?.username || user.email || 'User',
      video: { room: roomId, roomJoin: true, canPublish: true, canPublishSources, canSubscribe },
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(apiKey)
      .setSubject(user.id)
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(apiSecret));

    return respond(200, { token });
  } catch (error) {
    console.error('LiveKit token/roster request failed:', error);
    return respond(500, {
      error: 'Could not authorize this voice session.',
      detail: error instanceof Error ? error.message.slice(0, 240) : 'Unknown LiveKit error.',
    });
  }
});
