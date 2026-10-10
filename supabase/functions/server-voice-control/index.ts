import { createClient } from 'npm:@supabase/supabase-js@2';
import { RoomServiceClient } from 'npm:livekit-server-sdk@2.19.1';
import { TrackSource } from 'npm:@livekit/protocol@1.50.4';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return respond(401, { error: 'Giriş yapmalısın.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const liveKitUrl = Deno.env.get('LIVEKIT_URL') || Deno.env.get('VITE_LIVEKIT_URL');
  const liveKitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const liveKitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !liveKitUrl || !liveKitApiKey || !liveKitApiSecret) {
    return respond(503, { error: 'Ses yönetimi sunucu tarafında yapılandırılmamış.' });
  }

  try {
    const body = await request.json();
    const { serverId, channelId, targetUserId, action, destinationChannelId } = body ?? {};
    const memberAction = action === 'kick_member' || action === 'ban_member';
    const invalidIdentity = ![serverId, channelId, targetUserId]
      .every(value => typeof value === 'string' && value.length <= 128);
    const invalidAction = ![
      'server_mute', 'server_unmute', 'server_deafen', 'server_undeafen',
      'kick_member', 'ban_member', 'move_member',
    ].includes(action);
    const invalidDestination = action === 'move_member'
      && (typeof destinationChannelId !== 'string' || destinationChannelId.length > 128 || destinationChannelId === channelId);
    const invalidReason = memberAction
      && typeof body?.reason === 'string'
      && body.reason.length > 500;
    const invalidBanDuration = action === 'ban_member'
      && body?.banDurationHours != null
      && ![1, 24, 168, 720].includes(Number(body.banDurationHours));
    if (invalidIdentity || invalidAction || invalidDestination || invalidReason || invalidBanDuration) {
      return respond(400, { error: 'Ses işlemi geçersiz.' });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !user) return respond(401, { error: 'Oturum doğrulanamadı.' });
    if (user.id === targetUserId) return respond(400, { error: 'Kendi ses durumunu sunucu yönetimiyle değiştiremezsin.' });

    const permission = action === 'kick_member' ? 'kick_members'
      : action === 'ban_member' ? 'ban_members'
        : action === 'move_member' ? 'move_members'
        : action.includes('deafen') ? 'deafen_members' : 'mute_members';
    const { data: allowed, error: permissionError } = await userClient.rpc('has_server_permission', {
      server_uuid: serverId,
      permission_key: permission,
    });
    if (permissionError) return respond(503, { error: 'Sunucu izinleri okunamadı. migration_server_operations.sql dosyasını çalıştır.' });
    if (!allowed) return respond(403, { error: 'Bu ses işlemi için sunucu yetkin yok.' });

    const { data: channel, error: channelError } = await userClient.from('channels')
      .select('id,server_id,type').eq('id', channelId).eq('server_id', serverId).maybeSingle();
    if (channelError || !channel || channel.type !== 'voice') return respond(404, { error: 'Ses kanalı bulunamadı.' });
    const { data: target, error: targetError } = await userClient.from('server_members')
      .select('user_id').eq('server_id', serverId).eq('user_id', targetUserId).maybeSingle();
    if (targetError || !target) return respond(404, { error: 'Üye bu sunucuda bulunamadı.' });

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (action === 'move_member') {
      const { data: destination, error: destinationError } = await userClient.from('channels')
        .select('id,server_id,type,name,is_private').eq('id', destinationChannelId).eq('server_id', serverId).maybeSingle();
      if (destinationError || !destination || destination.type !== 'voice') return respond(404, { error: 'Hedef ses kanalı bulunamadı.' });
      const [{ data: canView }, { data: targetPresence }] = await Promise.all([
        userClient.rpc('has_channel_permission', { channel_uuid: destination.id, permission_key: 'view_channel' }),
        admin.from('server_voice_presence').select('microphone_enabled,deafened').eq('server_id', serverId).eq('channel_id', channelId).eq('user_id', targetUserId).maybeSingle(),
      ]);
      if (!canView) return respond(403, { error: 'Hedef kanalı görme yetkin yok.' });
      if (!targetPresence) return respond(409, { error: 'Üye artık bu ses kanalında görünmüyor.' });
      const roomServiceUrl = liveKitUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
      try {
        await new RoomServiceClient(roomServiceUrl, liveKitApiKey, liveKitApiSecret).moveParticipant(channelId, targetUserId, destination.id);
      } catch (error) {
        console.error('LiveKit participant move failed:', error);
        return respond(502, { error: 'Üye LiveKit ses odasına taşınamadı. Bağlantısı kesilmiş olabilir.' });
      }
      await admin.from('server_voice_presence').delete().eq('channel_id', channelId).eq('user_id', targetUserId);
      const { error: presenceError } = await admin.from('server_voice_presence').upsert({
        server_id: serverId, channel_id: destination.id, user_id: targetUserId,
        microphone_enabled: targetPresence.microphone_enabled, deafened: targetPresence.deafened,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'channel_id,user_id' });
      if (presenceError) console.warn('Moved voice presence could not be refreshed:', presenceError.message);
      return respond(200, { success: true, moved: true, destinationChannelId: destination.id, destinationChannelName: destination.name });
    }
    if (memberAction) {
      const { error: moderationError } = await userClient.rpc('moderate_server_member_with_expiry', {
        server_uuid: serverId,
        target_user: targetUserId,
        should_ban: action === 'ban_member',
        ban_reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null,
        ban_duration_hours: action === 'ban_member' && body.banDurationHours != null ? Number(body.banDurationHours) : null,
      });
      if (moderationError) return respond(403, { error: moderationError.message || 'Üye işlemi yapılamadı.' });
      let activeSessionUpdated = true;
      const roomServiceUrl = liveKitUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
      try { await new RoomServiceClient(roomServiceUrl, liveKitApiKey, liveKitApiSecret).removeParticipant(channelId, targetUserId); }
      catch { activeSessionUpdated = false; }
      return respond(200, { success: true, activeSessionUpdated });
    }

    const { data: current } = await admin.from('server_voice_moderation').select('server_muted,server_deafened')
      .eq('channel_id', channelId).eq('user_id', targetUserId).maybeSingle();
    const serverMuted = action === 'server_mute' ? true : action === 'server_unmute' ? false : Boolean(current?.server_muted);
    const serverDeafened = action === 'server_deafen' ? true : action === 'server_undeafen' ? false : Boolean(current?.server_deafened);
    const { error: stateError } = await admin.from('server_voice_moderation').upsert({
      server_id: serverId,
      channel_id: channelId,
      user_id: targetUserId,
      server_muted: serverMuted,
      server_deafened: serverDeafened,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'channel_id,user_id' });
    if (stateError) return respond(503, { error: 'Ses moderasyonu kaydedilemedi. migration_server_operations.sql dosyasını çalıştır.' });

    const roomServiceUrl = liveKitUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
    const roomService = new RoomServiceClient(roomServiceUrl, liveKitApiKey, liveKitApiSecret);
    let activeSessionUpdated = true;
    try {
      await roomService.updateParticipant(channelId, targetUserId, {
        permission: {
          canPublish: true,
          canPublishSources: serverMuted
            ? [TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
            : [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
          canSubscribe: !serverDeafened,
        },
      });
      if (serverMuted) {
        const participant = await roomService.getParticipant(channelId, targetUserId);
        const microphoneTrack = participant.tracks?.find(track => track.source === TrackSource.MICROPHONE);
        if (microphoneTrack?.sid) await roomService.mutePublishedTrack(channelId, targetUserId, microphoneTrack.sid, true);
      }
    } catch {
      // Moderation is persisted and the participant's room permissions take effect when they reconnect.
      activeSessionUpdated = false;
    }

    return respond(200, { success: true, serverMuted, serverDeafened, activeSessionUpdated });
  } catch (error) {
    console.error('Voice moderation failed:', error);
    return respond(500, { error: 'Ses moderasyonu uygulanamadı.' });
  }
});
