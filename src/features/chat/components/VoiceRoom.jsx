import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AudioTrack, LiveKitRoom, VideoTrack, useConnectionQualityIndicator, useConnectionState, useLocalParticipant, useParticipants, useRoomContext, useSpeakingParticipants, useTracks } from '@livekit/components-react';
import '@livekit/components-styles';
import { AudioPresets, DisconnectReason, Room as LiveKitClientRoom, RoomEvent, Track, supportsAudioOutputSelection } from 'livekit-client';
import { Activity, AppWindow, AudioLines, Ban, Camera, CameraOff, Check, Expand, Headphones, HeadphoneOff, Loader2, Maximize2, MessageSquare, Mic, MicOff, Minimize2, Monitor, MonitorUp, MoreHorizontal, PhoneOff, RefreshCw, Settings2, Shield, ShieldAlert, Signal, UserMinus, Users, Volume2, VolumeX, X } from 'lucide-react';
import { generateLiveKitToken } from '../../../lib/livekit';
import { useAuthStore } from '../../../store/useAuthStore';
import { useServerStore } from '../../../store/useServerStore';
import { fetchProfiles, getAvatarUrl } from '../../../lib/profileMedia';
import { ChatArea } from './ChatArea';
import { playUiSound } from '../../../lib/uiSounds';
import { getAppPreferences, saveAppPreferences } from '../../../lib/appPreferences';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';
import { supabase } from '../../../lib/supabase';
import { getVoicePlayback, normalizeVoiceVolume } from '../../../lib/voicePlayback';

import { getScreenShareCaptureOptions, getScreenSharePublishOptions, supportsOwnAudioExclusion } from '../../../lib/screenCapture';
import { syncNoiseProcessor } from '../../../lib/microphoneNoiseProcessor';

const DEFAULT_VOICE_AUDIO_SETTINGS = { inputDeviceId: '', outputDeviceId: '', audioQuality: 'speech', echoCancellation: true, noiseSuppression: true, noiseProcessor: 'krisp', autoGainControl: true, voiceIsolation: false, inputSensitivityEnabled: false, inputSensitivityDb: -100, inputVolume: 100, outputVolume: 100 };

function getAudioCaptureOptions(settings = DEFAULT_VOICE_AUDIO_SETTINGS) {
  return {
    ...(settings.inputDeviceId ? { deviceId: { exact: settings.inputDeviceId } } : {}),
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: true,
    voiceIsolation: settings.noiseSuppression && settings.noiseProcessor !== 'standard' ? false : settings.voiceIsolation,
  };
}

function getAudioPublishOptions(settings = DEFAULT_VOICE_AUDIO_SETTINGS) {
  return { audioPreset: settings.audioQuality === 'high' ? AudioPresets.musicHighQuality : AudioPresets.speech };
}

function VoiceConnectionHealth() {
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const [stats, setStats] = useState({ latency: null, packetLoss: null });

  useEffect(() => {
    if (connectionState !== 'connected') { setStats({ latency: null, packetLoss: null }); return undefined; }
    let active = true;
    let checking = false;
    const refresh = async () => {
      if (checking) return;
      checking = true;
      try {
        const track = localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
        const report = await track?.getSenderStats?.();
        if (!active || !report) return;
        const packetsLost = Number(report.packetsLost);
        const packetsSent = Number(report.packetsSent);
        setStats({
          latency: Number.isFinite(Number(report.roundTripTime)) ? Math.round(Number(report.roundTripTime) * 1000) : null,
          packetLoss: Number.isFinite(packetsLost) && Number.isFinite(packetsSent) && packetsLost >= 0 && packetsSent > 0
            ? Math.min(100, Math.round((packetsLost / (packetsSent + packetsLost)) * 1000) / 10)
            : null,
        });
      } catch { if (active) setStats({ latency: null, packetLoss: null }); }
      finally { checking = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [connectionState, localParticipant]);

  const details = {
    excellent: { label: 'Çok iyi', className: 'border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-100' },
    good: { label: 'İyi', className: 'border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-100' },
    poor: { label: 'Zayıf', className: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100' },
    lost: { label: 'Kesiliyor', className: 'border-rose-300/20 bg-rose-300/[0.07] text-rose-100' },
    unknown: { label: connectionState === 'connected' ? 'Ölçülüyor' : 'Bağlı değil', className: 'border-white/10 bg-white/[0.04] text-slate-300' },
  }[quality] || { label: 'Ölçülüyor', className: 'border-white/10 bg-white/[0.04] text-slate-300' };
  return <div role="status" aria-label="Ses bağlantısı kalitesi" title={`Bağlantı: ${details.label} · Gidiş dönüş: ${stats.latency == null ? 'ölçülüyor' : `${stats.latency} ms`} · Mikrofon paket kaybı: ${stats.packetLoss == null ? 'ölçülüyor' : `%${stats.packetLoss}`}`} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${details.className}`}>
    <Signal className="h-3.5 w-3.5 shrink-0" />
    <span className="min-w-0 flex-1 text-[10px] font-semibold">{details.label}</span>
    {stats.latency != null && <span className="text-[9px] tabular-nums opacity-80">{stats.latency} ms</span>}
    {stats.packetLoss != null && stats.packetLoss > 0 && <span className="text-[9px] tabular-nums opacity-80">%{stats.packetLoss} kayıp</span>}
  </div>;
}

class VoiceRoomErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Ses odası arayüzü açılamadı:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center bg-[#0b0e14] p-6 text-center text-white">
        <h2 className="text-lg font-bold">Ses kontrolleri açılamadı</h2>
        <p className="mt-2 text-sm text-slate-400">Ses kontrolleri hata verdi. Oda bağlantısı kapanmış olabilir; yeniden bağlanmayı dene.</p>
        <button type="button" onClick={() => { this.setState({ hasError: false }); this.props.onRetry(); }} className="mt-5 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400">Kontrolleri yenile</button>
      </div>
    );
  }
}

function VoicePlayback({ volumes, shareVolumes, mutedShares, deafened, outputVolume = 100 }) {
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio, Track.Source.Unknown], { onlySubscribed: true });
  return <div hidden>{tracks.filter((track) => !track.participant.isLocal && track.publication.kind === Track.Kind.Audio).map((track) => {
    const playback = getVoicePlayback({ source: track.source, participantId: track.participant.identity, volumes, shareVolumes, mutedShares, deafened });
    playback.volume = Math.min(2, playback.volume * Math.max(0, Math.min(200, Number(outputVolume) || 0)) / 100);
    playback.muted = playback.muted || playback.volume === 0;
    return <AudioTrack key={`${track.participant.identity}:${track.publication.trackSid}`} trackRef={track} volume={playback.volume} muted={playback.muted} />;
  })}</div>;
}

function VoiceParticipants({ serverId, channelId, localDeafened, outputVolume, onPresenceError, onParticipantsChange, contextMenuRequest, onContextMenuRequestHandled }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const speakingParticipants = useSpeakingParticipants();
  const connectionState = useConnectionState();
  const videoTracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: true });
  const currentUser = useAuthStore((state) => state.user);
  const server = useServerStore((state) => state.servers.find((item) => item.id === serverId));
  const [profiles, setProfiles] = useState([]);
  const [expandedShareId, setExpandedShareId] = useState(null);
  const [shareFullscreenError, setShareFullscreenError] = useState('');
  const [moderationByUser, setModerationByUser] = useState({});
  const [deafenedByUser, setDeafenedByUser] = useState({});
  const [canModerateVoice, setCanModerateVoice] = useState({ mute: false, deafen: false, kick: false, ban: false, move: false });
  const [contextMenu, setContextMenu] = useState(null);
  const [moderationDialog, setModerationDialog] = useState(null);
  const [moderationReason, setModerationReason] = useState('');
  const [banDurationHours, setBanDurationHours] = useState('permanent');
  const [moderationBusy, setModerationBusy] = useState('');
  const [moderationNotice, setModerationNotice] = useState('');
  const shareStageRefs = useRef(new Map());
  const [savedVolumes, setSavedVolumes] = useState(() => getAppPreferences(currentUser?.id).voiceParticipantVolumes || {});
  const [mutedShares, setMutedShares] = useState(() => getAppPreferences(currentUser?.id).voiceScreenShareMuted || {});
  const [shareVolumes, setShareVolumes] = useState(() => getAppPreferences(currentUser?.id).voiceScreenShareVolumes || {});
  const participantIds = participants.map((participant) => participant.identity).filter(Boolean);
  const participantKey = participantIds.slice().sort().join(',');
  const previousRemoteParticipantsRef = useRef(null);
  const fullscreenShareRef = useRef(null);
  const screenShares = videoTracks.filter((track) => track.publication.source === Track.Source.ScreenShare);
  // LiveKit may keep a muted camera publication around after its video element
  // has stopped. Do not render an empty VideoTrack: it leaves a black tile behind.
  const cameraShares = videoTracks.filter((track) => track.publication.source === Track.Source.Camera
    && !track.publication.isMuted
    && track.publication.track?.mediaStreamTrack?.readyState === 'live');

  const isSpeaking = speakingParticipants.some(participant => participant.identity === currentUser?.id);
  const voiceStateRef = useRef({ microphoneEnabled: false, deafened: false, speaking: false });
  const presenceWarningShown = useRef(false);
  voiceStateRef.current = { microphoneEnabled: Boolean(isMicrophoneEnabled && !localDeafened), deafened: Boolean(localDeafened), speaking: Boolean(isSpeaking) };
  useEffect(() => {
    if (connectionState !== 'connected') {
      previousRemoteParticipantsRef.current = null;
      return;
    }
    const remoteParticipantIds = new Set(participantIds.filter((participantId) => participantId !== currentUser?.id));
    const previousRemoteParticipantIds = previousRemoteParticipantsRef.current;
    if (previousRemoteParticipantIds) {
      for (const participantId of remoteParticipantIds) {
        if (!previousRemoteParticipantIds.has(participantId)) playUiSound('join', currentUser?.id);
      }
      for (const participantId of previousRemoteParticipantIds) {
        if (!remoteParticipantIds.has(participantId)) playUiSound('leave', currentUser?.id);
      }
    }
    previousRemoteParticipantsRef.current = remoteParticipantIds;
  // participantKey changes only when room membership changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState, participantKey, currentUser?.id]);
  const publishShareViewingChange = (fullscreenKey, action) => {
    if (!fullscreenKey) return;
    const shareIdentity = fullscreenKey.slice(fullscreenKey.indexOf(':') + 1);
    if (!shareIdentity || shareIdentity === currentUser?.id) return;
    playUiSound(action === 'start' ? 'streamWatchStart' : 'streamWatchEnd', currentUser?.id);
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'fastlynox:screen-share-view', action, shareIdentity }));
    void room.localParticipant.publishData(payload, { reliable: true, topic: 'fastlynox:screen-share-view' }).catch(() => {});
  };
  useEffect(() => {
    const handleDataReceived = (payload, participant) => {
      if (!participant || participant.identity === currentUser?.id) return;
      try {
        const message = JSON.parse(new TextDecoder().decode(payload));
        if (message?.type !== 'fastlynox:screen-share-view' || message.shareIdentity !== currentUser?.id) return;
        if (message.action === 'start' || message.action === 'end') playUiSound(message.action === 'start' ? 'streamWatchStart' : 'streamWatchEnd', currentUser?.id);
      } catch { /* Ignore unrelated voice-room data packets. */ }
    };
    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => { room.off(RoomEvent.DataReceived, handleDataReceived); };
  }, [room, currentUser?.id]);
  const publishVoicePresence = () => {
    if (!serverId || !channelId || !currentUser?.id || connectionState !== 'connected') return;
    void supabase.rpc('set_server_voice_presence', {
      server_uuid: serverId,
      channel_uuid: channelId,
      mic_enabled: voiceStateRef.current.microphoneEnabled,
      is_deafened: voiceStateRef.current.deafened,
      is_speaking: voiceStateRef.current.speaking,
    }).then(({ error }) => {
      if (error) {
        if (!presenceWarningShown.current) {
          presenceWarningShown.current = true;
          const migrationMissing = /set_server_voice_presence|schema cache|function.*not found/i.test(error.message);
          onPresenceError?.(migrationMissing ? 'Ses kanalı durumu için migration_voice_speaking_presence.sql dosyasını Supabase SQL Editor’da çalıştır.' : `Ses durumu yayınlanamadı: ${error.message}`);
        }
      } else presenceWarningShown.current = false;
    });
  };
  useEffect(() => {
    if (!serverId || !channelId || !currentUser?.id || connectionState !== 'connected') return undefined;
    publishVoicePresence();
    const heartbeat = window.setInterval(publishVoicePresence, 12_000);
    return () => {
      window.clearInterval(heartbeat);
    };
  // Do not clear on every connection-state transition: LiveKit reconnects can
  // briefly leave the connected state, and an async delete can race the next heartbeat.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, channelId, currentUser?.id, connectionState]);
  useEffect(() => { publishVoicePresence(); }, [isMicrophoneEnabled, localDeafened, isSpeaking, connectionState, serverId, channelId, currentUser?.id]);
  const speakingIds = new Set(speakingParticipants.map((participant) => participant.identity));
  const rosterKey = participants.map((participant) => `${participant.identity}:${participant.isMicrophoneEnabled ? 1 : 0}:${speakingIds.has(participant.identity) ? 1 : 0}:${moderationByUser[participant.identity]?.server_muted ? 1 : 0}:${moderationByUser[participant.identity]?.server_deafened ? 1 : 0}`).sort().join('|');

  useEffect(() => {
    const syncFullscreenState = () => {
      const next = document.fullscreenElement?.dataset.mediaStage || null;
      const previous = fullscreenShareRef.current;
      fullscreenShareRef.current = next;
      setExpandedShareId(next);
      if (previous && previous !== next) publishShareViewingChange(previous, 'end');
      if (next && next !== previous) publishShareViewingChange(next, 'start');
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      if (fullscreenShareRef.current) publishShareViewingChange(fullscreenShareRef.current, 'end');
    };
  }, [currentUser?.id, room]);

  const toggleShareFullscreen = async (identity) => {
    setShareFullscreenError('');
    try {
      const stage = shareStageRefs.current.get(identity);
      if (!stage) return;
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {
      setShareFullscreenError('Tam ekran açılamadı. Tarayıcı izinlerini kontrol edip yeniden dene.');
    }
  };

  useEffect(() => {
    let active = true;
    if (!participantIds.length) { setProfiles([]); return () => { active = false; }; }
    fetchProfiles(participantIds).then((result) => { if (active) setProfiles(result); });
    return () => { active = false; };
  // The sorted key only changes when membership changes; participant track updates stay local.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantKey]);

  useEffect(() => {
    if (!serverId || !channelId) { setModerationByUser({}); setDeafenedByUser({}); setCanModerateVoice({ mute: false, deafen: false, kick: false, ban: false, move: false }); return undefined; }
    let active = true;
    void supabase.from('server_voice_moderation').select('user_id,server_muted,server_deafened').eq('channel_id', channelId)
      .then(({ data }) => { if (active) setModerationByUser(Object.fromEntries((data || []).map(row => [row.user_id, row]))); });
    void supabase.from('server_voice_presence').select('user_id,deafened').eq('channel_id', channelId)
      .then(({ data }) => { if (active) setDeafenedByUser(Object.fromEntries((data || []).map(row => [row.user_id, Boolean(row.deafened)]))); });
    Promise.all([
      supabase.rpc('has_server_permission', { server_uuid: serverId, permission_key: 'mute_members' }),
      supabase.rpc('has_server_permission', { server_uuid: serverId, permission_key: 'deafen_members' }),
      supabase.rpc('has_server_permission', { server_uuid: serverId, permission_key: 'kick_members' }),
      supabase.rpc('has_server_permission', { server_uuid: serverId, permission_key: 'ban_members' }),
      supabase.rpc('has_server_permission', { server_uuid: serverId, permission_key: 'move_members' }),
    ]).then(([muteResult, deafenResult, kickResult, banResult, moveResult]) => { if (active) setCanModerateVoice({ mute: Boolean(muteResult.data), deafen: Boolean(deafenResult.data), kick: Boolean(kickResult.data), ban: Boolean(banResult.data), move: Boolean(moveResult.data) }); });
    const subscription = supabase.channel(`voice-moderation:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_voice_presence', filter: `channel_id=eq.${channelId}` }, payload => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!row?.user_id) return;
        setDeafenedByUser(current => { const next = { ...current }; if (payload.eventType === 'DELETE') delete next[row.user_id]; else next[row.user_id] = Boolean(row.deafened); return next; });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_voice_moderation', filter: `channel_id=eq.${channelId}` }, payload => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
        if (!row?.user_id) return;
        setModerationByUser(current => {
          const next = { ...current };
          if (payload.eventType === 'DELETE' || (!row.server_muted && !row.server_deafened)) delete next[row.user_id];
          else next[row.user_id] = row;
          return next;
        });
      }).subscribe();
    return () => { active = false; void supabase.removeChannel(subscription); };
  }, [serverId, channelId]);

  useEffect(() => {
    if (!contextMenuRequest?.requestId) return;
    const participant = participants.find((item) => item.identity === contextMenuRequest.participantId);
    if (!participant) return;
    setContextMenu({ x: contextMenuRequest.x, y: contextMenuRequest.y, participantId: participant.identity });
    onContextMenuRequestHandled?.();
  }, [contextMenuRequest, participants, onContextMenuRequestHandled]);

  useEffect(() => {
    const refreshVolumes = event => {
      if (!event?.detail?.userId || event.detail.userId === currentUser?.id) {
        const preferences = getAppPreferences(currentUser?.id);
        setSavedVolumes(preferences.voiceParticipantVolumes || {});
        setMutedShares(preferences.voiceScreenShareMuted || {});
        setShareVolumes(preferences.voiceScreenShareVolumes || {});
      }
    };
    window.addEventListener('fastcord:preferences-updated', refreshVolumes);
    return () => window.removeEventListener('fastcord:preferences-updated', refreshVolumes);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = event => { if (event.type === 'keydown' && event.key === 'Escape') setContextMenu(null); else if (event.type === 'pointerdown' && !event.target.closest('[data-voice-user-menu]')) setContextMenu(null); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', close); };
  }, [contextMenu]);

  useEffect(() => {
    if (!moderationDialog) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !moderationBusy) setModerationDialog(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moderationDialog, moderationBusy]);

  const setLocalParticipantVolume = (participant, value) => {
    if (!participant || participant.isLocal) return;
    const volume = normalizeVoiceVolume(value);
    const preferences = getAppPreferences(currentUser?.id);
    const voiceParticipantVolumes = { ...(preferences.voiceParticipantVolumes || {}), [participant.identity]: volume };
    setSavedVolumes(voiceParticipantVolumes);
    saveAppPreferences(currentUser?.id, { ...preferences, voiceParticipantVolumes });
  };

  const toggleShareMute = (participant) => {
    if (participant.isLocal) return;
    const preferences = getAppPreferences(currentUser?.id);
    const volume = normalizeVoiceVolume(shareVolumes[participant.identity]);
    const wasMuted = Boolean(mutedShares[participant.identity]) || volume === 0;
    const voiceScreenShareMuted = { ...(preferences.voiceScreenShareMuted || {}), [participant.identity]: !wasMuted };
    const voiceScreenShareVolumes = { ...(preferences.voiceScreenShareVolumes || {}), [participant.identity]: wasMuted && volume === 0 ? 1 : volume };
    setMutedShares(voiceScreenShareMuted);
    setShareVolumes(voiceScreenShareVolumes);
    saveAppPreferences(currentUser?.id, { ...preferences, voiceScreenShareMuted, voiceScreenShareVolumes });
  };

  const setShareVolume = (participant, value) => {
    if (participant.isLocal) return;
    const preferences = getAppPreferences(currentUser?.id);
    const voiceScreenShareVolumes = { ...(preferences.voiceScreenShareVolumes || {}), [participant.identity]: normalizeVoiceVolume(value) };
    const voiceScreenShareMuted = { ...(preferences.voiceScreenShareMuted || {}), [participant.identity]: false };
    setShareVolumes(voiceScreenShareVolumes);
    setMutedShares(voiceScreenShareMuted);
    saveAppPreferences(currentUser?.id, { ...preferences, voiceScreenShareVolumes, voiceScreenShareMuted });
  };

  const openShareMenu = (event, participant) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    setContextMenu({ kind: 'screen', participantId: participant.identity, x: event.clientX || bounds.left, y: event.clientY || bounds.bottom });
  };

  const applyServerVoiceAction = async (participant, action) => {
    if (!serverId || !channelId || !participant?.identity) return;
    setModerationBusy(`${participant.identity}:${action}`);
    setModerationNotice('');
    const { data, error } = await supabase.functions.invoke('server-voice-control', { body: { serverId, channelId, targetUserId: participant.identity, action } });
    setModerationBusy('');
    if (error || !data?.success) {
      const detail = data?.error || error?.message || 'Sunucu ses işlemi uygulanamadı.';
      setModerationNotice(/failed to send a request|functionsfetcherror|failed to fetch/i.test(detail) ? 'Ses moderasyonu Edge Function’a ulaşamadı. Supabase projesinde `server-voice-control` fonksiyonunun deploy edildiğini ve function secret’larının tanımlı olduğunu kontrol et.' : detail);
      return;
    }
    setModerationByUser(current => ({ ...current, [participant.identity]: { user_id: participant.identity, server_muted: data.serverMuted, server_deafened: data.serverDeafened } }));
    setModerationNotice(data.activeSessionUpdated ? 'Sunucu ses durumu güncellendi.' : 'Durum kaydedildi; aktif bağlantıya ulaşılmadı, yeniden bağlanınca uygulanacak.');
    setContextMenu(null);
  };

  const moveMemberToVoiceChannel = async (participant, destinationChannelId) => {
    if (!serverId || !channelId || !participant?.identity || !destinationChannelId || moderationBusy) return;
    setModerationBusy(`${participant.identity}:move_member`);
    setModerationNotice('');
    const { data, error } = await supabase.functions.invoke('server-voice-control', {
      body: { serverId, channelId, targetUserId: participant.identity, action: 'move_member', destinationChannelId },
    });
    setModerationBusy('');
    if (error || !data?.success) {
      setModerationNotice(data?.error || error?.message || 'Üye başka ses kanalına taşınamadı.');
      return;
    }
    const destination = (server?.categories || []).flatMap(category => category.channels || []).find(item => item.id === destinationChannelId);
    setModerationNotice(`${participant.name || 'Üye'} ${destination?.name || 'başka bir ses kanalına'} taşındı.`);
    setContextMenu(null);
  };

  const applyMemberModeration = async () => {
    const participant = participants.find((item) => item.identity === moderationDialog?.participantId);
    if (!serverId || !channelId || !participant || participant.isLocal || moderationBusy) return;
    const { kind } = moderationDialog;
    setModerationBusy(`${participant.identity}:${kind}`);
    setModerationNotice('');
    const { data, error } = await supabase.functions.invoke('server-voice-control', {
      body: {
        serverId,
        channelId,
        targetUserId: participant.identity,
        action: kind === 'kick' ? 'kick_member' : 'ban_member',
        reason: moderationReason.trim() || null,
        banDurationHours: banDurationHours === 'permanent' ? null : Number(banDurationHours),
      },
    });
    setModerationBusy('');
    if (error || !data?.success) {
      const detail = data?.error || error?.message || 'Üye işlemi uygulanamadı.';
      setModerationNotice(/failed to send a request|functionsfetcherror|failed to fetch/i.test(detail) ? 'Üye işlemi Edge Function’a ulaşamadı. Supabase projesinde `server-voice-control` fonksiyonunu deploy et ve function secret’larını kontrol et.' : detail);
      return;
    }
    setModerationNotice(kind === 'ban' ? `${participant.name || 'Üye'} sunucudan yasaklandı.` : `${participant.name || 'Üye'} sunucudan çıkarıldı.`);
    setModerationDialog(null);
    setContextMenu(null);
  };

  useEffect(() => {
    onParticipantsChange(participants.map((participant) => {
      const profile = participant.identity === currentUser?.id ? currentUser : profiles.find((item) => item.id === participant.identity);
      return {
        id: participant.identity,
        username: profile?.username || participant.name || 'Fastlynox kullanıcısı',
        avatar_url: profile?.avatar_url || null,
        microphoneEnabled: participant.isMicrophoneEnabled,
        deafened: participant.identity === currentUser?.id ? localDeafened : Boolean(deafenedByUser[participant.identity]),
        speaking: speakingIds.has(participant.identity),
        serverMuted: Boolean(moderationByUser[participant.identity]?.server_muted),
        serverDeafened: Boolean(moderationByUser[participant.identity]?.server_deafened),
      };
    }));
  // rosterKey tracks live membership, mute, and speaking changes; profile updates refresh display names and avatars.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey, profiles, currentUser, moderationByUser, deafenedByUser, localDeafened, onParticipantsChange]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col text-slate-100">
      <VoicePlayback volumes={savedVolumes} shareVolumes={shareVolumes} mutedShares={mutedShares} deafened={localDeafened} outputVolume={outputVolume} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Ses odasındakiler</h2>
          <p className="mt-1 text-xs text-slate-500">{participants.length} kişi bağlı</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
        <span className={`h-2 w-2 rounded-full ${connectionState === 'connected' ? 'bg-emerald-400' : connectionState === 'reconnecting' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
        {connectionState === 'connected' ? 'Bağlandı' : connectionState === 'reconnecting' ? 'Yeniden bağlanıyor…' : 'Bağlantı kuruluyor…'}
        </div>
      </div>
      {(screenShares.length > 0 || cameraShares.length > 0) && <section aria-label="Canlı yayınlar" className="mb-5 grid gap-4">
        {screenShares.map((track) => <article key={`screen-${track.participant.identity}`} onContextMenu={(event) => openShareMenu(event, track.participant)} ref={(element) => { const key = `screen:${track.participant.identity}`; if (element) shareStageRefs.current.set(key, element); else shareStageRefs.current.delete(key); }} data-media-stage={`screen:${track.participant.identity}`} className="screen-share-card overflow-hidden rounded-[22px] border border-violet-300/20 bg-[#0b0e14] shadow-[0_20px_65px_rgba(0,0,0,.32)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[linear-gradient(100deg,rgba(139,92,246,.12),transparent)] px-4 py-3 text-xs font-semibold text-violet-100"><span className="flex min-w-0 items-center gap-2"><MonitorUp className="h-4 w-4 shrink-0"/><span className="truncate">{track.participant.name || track.participant.identity}<span className="ml-1.5 font-normal text-slate-400">ekranını paylaşıyor</span></span></span><button type="button" onClick={() => void toggleShareFullscreen(`screen:${track.participant.identity}`)} aria-label={expandedShareId === `screen:${track.participant.identity}` ? 'Ekran paylaşımını küçült' : 'Ekran paylaşımını büyüt'} title="Büyüt / tam ekran" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-200 transition hover:border-violet-200/25 hover:bg-violet-300/15"><Maximize2 className="h-4 w-4"/></button></div>
          <div onDoubleClick={(event) => { if (!event.target.closest('button')) void toggleShareFullscreen(`screen:${track.participant.identity}`); }} className="screen-share-stage relative aspect-video max-h-[min(68vh,760px)] bg-[#05070b]"><VideoTrack trackRef={track} className="h-full w-full object-contain"/>
            <button type="button" onClick={(event) => openShareMenu(event, track.participant)} aria-label="Yayın ses seçenekleri" title="Yayın ses seçenekleri · sağ tık" className="absolute bottom-3 right-3 flex items-center gap-2 rounded-xl border border-white/15 bg-[#111722]/90 px-3 py-2 text-xs text-slate-100 shadow-lg backdrop-blur-xl hover:bg-[#202839]">
              {track.participant.isLocal || mutedShares[track.participant.identity] || normalizeVoiceVolume(shareVolumes[track.participant.identity]) === 0 ? <VolumeX className="h-4 w-4 text-rose-200" /> : <Volume2 className="h-4 w-4 text-violet-200" />}
              {track.participant.isLocal ? 'Önizleme sessiz' : mutedShares[track.participant.identity] || normalizeVoiceVolume(shareVolumes[track.participant.identity]) === 0 ? 'Yayın sende sessiz' : `Yayın sesi · %${Math.round(normalizeVoiceVolume(shareVolumes[track.participant.identity]) * 100)}`}
            </button>
          </div>
        </article>)}
        {cameraShares.map((track) => <article key={`camera-${track.participant.identity}`} ref={(element) => { const key = `camera:${track.participant.identity}`; if (element) shareStageRefs.current.set(key, element); else shareStageRefs.current.delete(key); }} data-media-stage={`camera:${track.participant.identity}`} className="camera-stage-card overflow-hidden rounded-[22px] border border-cyan-200/15 bg-[#0b0e14] shadow-[0_20px_65px_rgba(0,0,0,.3)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[linear-gradient(100deg,rgba(34,211,238,.09),transparent)] px-4 py-3 text-xs font-semibold text-cyan-100"><span className="flex min-w-0 items-center gap-2"><Camera className="h-4 w-4 shrink-0"/><span className="truncate">{track.participant.name || track.participant.identity}<span className="ml-1.5 font-normal text-slate-400">kamerada</span></span></span><button type="button" onClick={() => void toggleShareFullscreen(`camera:${track.participant.identity}`)} aria-label="Kamerayı büyüt" title="Büyüt / tam ekran" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-200 transition hover:border-cyan-200/25 hover:bg-cyan-300/10"><Maximize2 className="h-4 w-4"/></button></div>
          <div onDoubleClick={() => void toggleShareFullscreen(`camera:${track.participant.identity}`)} className="screen-share-stage relative aspect-video max-h-[min(58vh,640px)] bg-[#05070b]"><VideoTrack trackRef={track} className="h-full w-full object-contain"/></div>
        </article>)}
      </section>}
      {shareFullscreenError && <p role="alert" className="mb-3 text-center text-xs text-rose-300">{shareFullscreenError}</p>}

      {participants.length > 0 ? (
        <ul aria-label="Ses katılımcıları" className="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
          {participants.map((participant) => {
            const profile = participant.identity === currentUser?.id ? currentUser : profileById.get(participant.identity);
            const speaking = speakingIds.has(participant.identity);
            return (
              <li key={participant.identity} onContextMenu={event => { event.preventDefault(); if (!participant.isLocal) setContextMenu({ x: event.clientX, y: event.clientY, participantId: participant.identity }); }} className={`macos-surface relative min-h-36 overflow-hidden rounded-[22px] border bg-[#111722]/85 transition-all ${speaking && !moderationByUser[participant.identity]?.server_muted ? 'border-emerald-300/70 shadow-[0_0_0_1px_rgba(52,211,153,.16),0_0_32px_rgba(16,185,129,.12)]' : 'border-white/[0.08]'}`}>
                <div className="relative flex h-full min-h-36 flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,.08),transparent_65%)] p-5">
                  <div className={`relative rounded-full p-1 transition-all ${speaking ? 'bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,.13),0_0_26px_rgba(52,211,153,.48)]' : 'bg-white/10'}`}>
                    <img src={getAvatarUrl(profile?.avatar_url, profile?.username || participant.name || participant.identity)} alt={`${profile?.username || participant.name || 'Katılımcı'} profil fotoğrafı`} className="h-[4.5rem] w-[4.5rem] rounded-full border-2 border-[#111722] object-cover" />
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#080b10]/65 px-3 py-1.5 backdrop-blur-xl">
                    <span className="max-w-44 truncate text-sm font-semibold text-white">{profile?.username || participant.name || 'Fastlynox kullanıcısı'}{participant.identity === currentUser?.id ? ' (Sen)' : ''}</span>
                    {participant.isMicrophoneEnabled && !moderationByUser[participant.identity]?.server_muted ? <Mic className={`h-3.5 w-3.5 ${speaking ? 'text-emerald-300' : 'text-slate-400'}`} aria-label="Mikrofon açık" title="Mikrofon açık" /> : <MicOff className="h-3.5 w-3.5 text-rose-300" aria-label="Mikrofon kapalı" title="Mikrofon kapalı" />}
                    {moderationByUser[participant.identity]?.server_muted && <ShieldAlert className="h-3.5 w-3.5 text-rose-300" aria-label="Sunucuda susturuldu" title="Sunucuda susturuldu" />}
                    {moderationByUser[participant.identity]?.server_deafened ? <HeadphoneOff className="h-3.5 w-3.5 text-amber-300" aria-label="Sunucuda sağırlaştırıldı" title="Sunucuda sağırlaştırıldı" /> : deafenedByUser[participant.identity] ? <HeadphoneOff className="h-3.5 w-3.5 text-violet-300" aria-label="Kulaklığı kapalı" title="Kulaklığı kapalı" /> : <Headphones className="h-3.5 w-3.5 text-slate-500" aria-label="Kulaklığı açık" title="Kulaklığı açık" />}
                  </div>
                  {speaking && <span className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-300">Konuşuyor</span>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400"><Users className="h-6 w-6" /></div>
          <p className="font-semibold text-slate-200">Henüz kimse bağlanmadı</p>
          <p className="mt-1 text-xs text-slate-500">Odaya ilk katılan sen olabilirsin.</p>
        </div>
      )}
      {moderationNotice && <p role="status" className="mt-3 text-center text-[11px] text-slate-400">{moderationNotice}</p>}
      {contextMenu && (() => {
        const participant = participants.find(item => item.identity === contextMenu.participantId);
        if (!participant) return null;
        if (contextMenu.kind === 'screen') {
          if (!screenShares.some((track) => track.participant.identity === participant.identity)) return null;
          const volume = normalizeVoiceVolume(shareVolumes[participant.identity]);
          const muted = participant.isLocal || Boolean(mutedShares[participant.identity]) || volume === 0;
          return createPortal(<section data-voice-user-menu role="dialog" aria-label="Yayın ses seçenekleri" className="fixed z-[300] max-h-[calc(100vh-24px)] w-72 max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-violet-200/15 bg-[#151a24]/[.98] p-2 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl" style={{ left: Math.max(12, Math.min(contextMenu.x, window.innerWidth - 300)), top: Math.max(12, Math.min(contextMenu.y, window.innerHeight - 270)) }}>
            <p className="truncate px-3 pb-2 pt-1 text-[11px] font-semibold text-violet-200">{participant.name || 'Katılımcı'} · Yayın sesi</p>
            {!participant.isLocal && <div className="mb-1 rounded-xl border border-white/[0.06] bg-black/15 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-slate-300"><span>Yayın ses seviyesi</span><span className="font-semibold tabular-nums text-violet-200">{muted ? 'Sessiz' : `%${Math.round(volume * 100)}`}</span></div>
              <input type="range" min="0" max="2" step="0.01" value={volume} aria-label={`${participant.name || 'Katılımcı'} yayın ses seviyesi`} aria-valuetext={`%${Math.round(volume * 100)}${muted ? ' · sessiz' : ''}`} onChange={(event) => setShareVolume(participant, event.target.value)} className="w-full accent-violet-400" />
              <div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>%0</span><button type="button" onClick={() => setShareVolume(participant, 1)} title="Yayın sesini varsayılana döndür" className="hover:text-violet-200">%100 · Sıfırla</button><span>%200</span></div>
            </div>}
            <button type="button" autoFocus disabled={participant.isLocal} onClick={() => toggleShareMute(participant)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-100 transition hover:bg-violet-300/10 focus-visible:bg-violet-300/10 focus-visible:outline-none disabled:opacity-60">{muted ? <VolumeX className="h-4 w-4 text-rose-200" /> : <Volume2 className="h-4 w-4 text-violet-200" />}{participant.isLocal ? 'Kendi yayın önizlemen sessiz' : muted ? 'Yayın sesini kendimde aç' : 'Yayın sesini kendimde kapat'}</button>
            <p className="px-3 pb-1 pt-2 text-[10px] leading-4 text-slate-400">{participant.isLocal ? 'Kendi yayın sesin sana tekrar çalınmaz. İzleyiciler yayının sesini duymaya devam eder.' : 'Yalnızca senin duyduğun yayın sesini değiştirir. Mikrofon sesini ve diğer izleyicileri etkilemez.'}</p>
          </section>, document.fullscreenElement || document.body);
        }
        const moderation = moderationByUser[participant.identity] || {};
        const volume = normalizeVoiceVolume(savedVolumes[participant.identity]);
        const left = Math.min(contextMenu.x, Math.max(12, window.innerWidth - 304));
        const top = Math.min(contextMenu.y, Math.max(12, window.innerHeight - 410));
        return createPortal(
          <section data-voice-user-menu className="fixed z-[300] w-72 rounded-2xl border border-white/10 bg-[#151a24]/[.98] p-3 shadow-[0_20px_70px_rgba(0,0,0,.65)] backdrop-blur-2xl" style={{ left, top }} aria-label={`${participant.name || 'Kullanıcı'} ses menüsü`}>
            <header className="mb-3 flex items-center gap-2 border-b border-white/[0.07] pb-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><Volume2 className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{participant.name || 'Katılımcı'}{participant.isLocal ? ' · Sen' : ''}</span>
            </header>
            {!participant.isLocal && <div className="rounded-xl border border-white/[0.06] bg-black/15 p-2.5">
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-slate-300"><span className="flex items-center gap-1.5">{volume === 0 ? <VolumeX className="h-3.5 w-3.5 text-rose-300" /> : <Volume2 className="h-3.5 w-3.5 text-cyan-200" />} Yalnızca sende duyulan ses</span><span>{Math.round(volume * 100)}%</span></div>
              <input type="range" min="0" max="2" step="0.01" value={volume} aria-label={`${participant.name || 'Kullanıcı'} ses seviyesi`} aria-valuetext={`%${Math.round(volume * 100)}`} onChange={event => setLocalParticipantVolume(participant, event.target.value)} className="w-full accent-cyan-300" />
              <div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>%0</span><button type="button" onClick={() => setLocalParticipantVolume(participant, 1)} className="hover:text-cyan-200" title="Varsayılan ses seviyesine dön">%100 · Sıfırla</button><span>%200</span></div>
            </div>}
            {serverId && !participant.isLocal && (canModerateVoice.mute || canModerateVoice.deafen) && <div className="mt-2 space-y-1 border-t border-white/[0.07] pt-2">
              {canModerateVoice.mute && <button type="button" disabled={moderationBusy !== ''} onClick={() => void applyServerVoiceAction(participant, moderation.server_muted ? 'server_unmute' : 'server_mute')} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50"><ShieldAlert className="h-4 w-4 text-rose-300" />{moderation.server_muted ? 'Sunucu susturmasını kaldır' : 'Sunucuda sustur'}{moderationBusy.endsWith('server_mute') && <RefreshCw className="ml-auto h-3 w-3 animate-spin" />}</button>}
              {canModerateVoice.deafen && <button type="button" disabled={moderationBusy !== ''} onClick={() => void applyServerVoiceAction(participant, moderation.server_deafened ? 'server_undeafen' : 'server_deafen')} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50"><HeadphoneOff className="h-4 w-4 text-amber-300" />{moderation.server_deafened ? 'Sunucu sağırlaştırmasını kaldır' : 'Sunucuda sağırlaştır'}{moderationBusy.endsWith('server_deafen') && <RefreshCw className="ml-auto h-3 w-3 animate-spin" />}</button>}
            </div>}
            {serverId && !participant.isLocal && (canModerateVoice.kick || canModerateVoice.ban) && <div className="mt-2 space-y-1 border-t border-white/[0.07] pt-2">
              {canModerateVoice.kick && <button type="button" disabled={moderationBusy !== ''} onClick={() => { setModerationReason(''); setModerationDialog({ participantId: participant.identity, kind: 'kick' }); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-amber-100 transition hover:bg-amber-300/[0.08] disabled:opacity-50"><UserMinus className="h-4 w-4" />Sunucudan at</button>}
              {canModerateVoice.ban && <button type="button" disabled={moderationBusy !== ''} onClick={() => { setModerationReason(''); setBanDurationHours('permanent'); setModerationDialog({ participantId: participant.identity, kind: 'ban' }); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-rose-200 transition hover:bg-rose-300/[0.08] disabled:opacity-50"><Ban className="h-4 w-4" />Sunucudan yasakla…</button>}
            </div>}
            {serverId && !participant.isLocal && canModerateVoice.move && <div className="mt-2 border-t border-white/[0.07] pt-2">
              <div className="px-2.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">Başka ses kanalına taşı</div>
              <div className="max-h-32 space-y-0.5 overflow-y-auto">{(server?.categories || []).flatMap(category => (category.channels || []).map(channel => ({ ...channel, categoryName: category.name }))).filter(channel => channel.type === 'voice' && channel.id !== channelId).map(channel => <button key={channel.id} type="button" disabled={moderationBusy !== ''} onClick={() => void moveMemberToVoiceChannel(participant, channel.id)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs text-slate-200 transition hover:bg-violet-300/[0.09] disabled:opacity-50"><Volume2 className="h-3.5 w-3.5 text-violet-200" /><span className="min-w-0 flex-1 truncate">{channel.name}</span><span className="max-w-20 truncate text-[9px] text-slate-600">{channel.categoryName}</span>{moderationBusy === `${participant.identity}:move_member` && <RefreshCw className="h-3 w-3 animate-spin" />}</button>)}</div>
              {!(server?.categories || []).some(category => (category.channels || []).some(channel => channel.type === 'voice' && channel.id !== channelId)) && <p className="px-2.5 py-2 text-[10px] text-slate-500">Taşınabilecek başka ses kanalı yok.</p>}
            </div>}
            {participant.isLocal && <p className="rounded-xl bg-white/[0.035] px-3 py-2 text-[10px] text-slate-400">Kendi ses ve bağlantı kontrollerin alttaki ses çubuğunda.</p>}
            <p className="mt-2 px-1 text-[9px] leading-4 text-slate-600">Kişisel ses düzeyi yalnızca bu cihazda saklanır.</p>
          </section>, document.body,
        );
      })()}
      {moderationDialog && createPortal(
        <div className="fixed inset-0 z-[420] grid place-items-center bg-[#05070c]/70 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !moderationBusy) setModerationDialog(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="voice-member-moderation-title" className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/[0.12] bg-[linear-gradient(145deg,rgba(26,32,46,.98),rgba(14,18,27,.98))] shadow-[0_35px_120px_rgba(0,0,0,.72)]">
            <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${moderationDialog.kind === 'ban' ? 'bg-rose-300/10 text-rose-200' : 'bg-amber-300/10 text-amber-100'}`}>{moderationDialog.kind === 'ban' ? <Ban className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><h2 id="voice-member-moderation-title" className="text-sm font-bold text-white">{moderationDialog.kind === 'ban' ? 'Üyeyi yasakla' : 'Üyeyi sunucudan at'}</h2><p className="mt-0.5 truncate text-[10px] text-slate-400">{participants.find((item) => item.identity === moderationDialog.participantId)?.name || 'Ses kanalı üyesi'}</p></div><button type="button" disabled={Boolean(moderationBusy)} onClick={() => setModerationDialog(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07] hover:text-white" aria-label="Kapat"><X className="h-4 w-4" /></button></header>
            <div className="space-y-4 p-5">
              {moderationDialog.kind === 'ban' && <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Yasaklama süresi</span><AnimatedSelect ariaLabel="Yasaklama süresi" value={banDurationHours} onValueChange={setBanDurationHours} options={[{ value: 'permanent', label: 'Kalıcı' }, { value: '1', label: '1 saat' }, { value: '24', label: '24 saat' }, { value: '168', label: '7 gün' }, { value: '720', label: '30 gün' }]} className="w-full" disabled={Boolean(moderationBusy)} /></label>}
              {moderationDialog.kind === 'ban' && <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Yasaklama sebebi <span className="font-normal normal-case text-slate-600">· isteğe bağlı</span></span><textarea value={moderationReason} onChange={(event) => setModerationReason(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Yasaklama sebebini yaz…" className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-600 focus:border-violet-200/25" /></label>}
              {moderationNotice && <p role="alert" className="rounded-xl border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-[10px] text-rose-100">{moderationNotice}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-4"><button type="button" disabled={Boolean(moderationBusy)} onClick={() => setModerationDialog(null)} className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-400 hover:bg-white/[0.05] hover:text-white">Vazgeç</button><button type="button" disabled={Boolean(moderationBusy)} onClick={() => void applyMemberModeration()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${moderationDialog.kind === 'ban' ? 'bg-rose-500 hover:bg-rose-400' : 'bg-amber-500 hover:bg-amber-400'}`}>{moderationBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}{moderationDialog.kind === 'ban' ? 'Yasakla' : 'Üyeyi at'}</button></footer>
          </section>
        </div>, document.body,
      )}
    </div>
  );
}

function VoiceAudioSettings({ currentUserId }) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, microphoneTrack } = useLocalParticipant();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_VOICE_AUDIO_SETTINGS, ...(getAppPreferences(currentUserId).voiceAudioSettings || {}) }));
  const [sensitivityDraft, setSensitivityDraft] = useState(settings.inputSensitivityDb);
  const [inputVolumeDraft, setInputVolumeDraft] = useState(settings.inputVolume);
  const [outputVolumeDraft, setOutputVolumeDraft] = useState(settings.outputVolume);
  const settingsRef = useRef(settings);
  const [devices, setDevices] = useState({ audioinput: [], audiooutput: [] });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const connectionState = useConnectionState();
  const { quality: connectionQuality } = useConnectionQualityIndicator({ participant: localParticipant });
  const localMicrophoneTrack = microphoneTrack?.track;
  useEffect(() => {
    if (!localMicrophoneTrack || connectionState !== 'connected' || !isMicrophoneEnabled) return;
    void syncNoiseProcessor(localMicrophoneTrack, settings).catch(() => setMessage('Gelişmiş mikrofon işleme uygulanamadı; standart filtre kullanılacak.'));
  }, [localMicrophoneTrack, connectionState, isMicrophoneEnabled, settings.noiseSuppression, settings.noiseProcessor, settings.inputSensitivityEnabled, settings.inputSensitivityDb, settings.inputVolume, settings.echoCancellation, settings.voiceIsolation]);

  useEffect(() => {
    const notify = event => setMessage(event?.detail === 'rnnoise' ? 'Krisp kullanılamadı; RNNoise yedeği etkin.' : 'Gelişmiş filtre açılamadı; standart gürültü engelleme kullanılıyor.');
    window.addEventListener('fastlynox:noise-fallback', notify);
    return () => window.removeEventListener('fastlynox:noise-fallback', notify);
  }, []);

  useEffect(() => {
    const notify = event => setMessage(`Giriş eşiği uygulanamadı${event?.detail ? `: ${event.detail}` : ''}. Mikrofon sesi kesilmesin diye eşik filtresi kapatıldı.`);
    window.addEventListener('fastlynox:input-threshold-fallback', notify);
    return () => window.removeEventListener('fastlynox:input-threshold-fallback', notify);
  }, []);

  const refreshDevices = async () => {
    try {
      const [audioinput, audiooutput] = await Promise.all([
        LiveKitClientRoom.getLocalDevices('audioinput'),
        LiveKitClientRoom.getLocalDevices('audiooutput').catch(() => []),
      ]);
      setDevices({ audioinput, audiooutput });
    } catch {
      setMessage('Aygıt listesi alınamadı. Mikrofon iznini kontrol et.');
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    void refreshDevices();
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  }, [open]);

  // Keep the device roster fresh while in voice, even when the settings popover is closed.
  useEffect(() => {
    if (connectionState !== 'connected') return undefined;
    let active = true;
    let recovering = false;
    const recoverMissingDevice = async () => {
      if (recovering) return;
      recovering = true;
      try {
        const [audioinput, audiooutput] = await Promise.all([
          LiveKitClientRoom.getLocalDevices('audioinput'),
          LiveKitClientRoom.getLocalDevices('audiooutput').catch(() => []),
        ]);
        if (!active) return;
        setDevices({ audioinput, audiooutput });
        const selectedInputGone = settingsRef.current.inputDeviceId && !audioinput.some(device => device.deviceId === settingsRef.current.inputDeviceId);
        const selectedOutputGone = settingsRef.current.outputDeviceId && !audiooutput.some(device => device.deviceId === settingsRef.current.outputDeviceId);
        if (selectedInputGone) {
          const fallback = audioinput[0]?.deviceId || '';
          await room.switchActiveDevice('audioinput', fallback);
          const next = { ...settingsRef.current, inputDeviceId: '' };
          persist(next);
          setMessage('Mikrofon bağlantısı kesildi; sistem varsayılanına geçildi.');
        }
        if (selectedOutputGone) {
          const fallback = audiooutput[0]?.deviceId || '';
          if (fallback && supportsAudioOutputSelection()) await room.switchActiveDevice('audiooutput', fallback);
          const next = { ...settingsRef.current, outputDeviceId: '' };
          persist(next);
          setMessage('Ses çıkışı bağlantısı kesildi; sistem varsayılanına geçildi.');
        }
      } catch { if (active) setMessage('Ses aygıtı değişti; ayarlar menüsünden aygıtları yeniden seçebilirsin.'); }
      finally { recovering = false; }
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', recoverMissingDevice);
    void recoverMissingDevice();
    return () => { active = false; navigator.mediaDevices?.removeEventListener?.('devicechange', recoverMissingDevice); };
  }, [connectionState, room]);

  useEffect(() => {
    if (connectionState !== 'connected' || !settings.outputDeviceId || !supportsAudioOutputSelection()) return;
    if (room.getActiveDevice('audiooutput') === settings.outputDeviceId) return;
    room.switchActiveDevice('audiooutput', settings.outputDeviceId).catch((error) => setMessage(error instanceof Error ? error.message : 'Ses çıkış aygıtı uygulanamadı.'));
  }, [connectionState, room, settings.outputDeviceId]);

  useEffect(() => {
    const refreshPreferences = event => {
      if (!event?.detail?.userId || event.detail.userId === currentUserId) {
        const next = { ...DEFAULT_VOICE_AUDIO_SETTINGS, ...(getAppPreferences(currentUserId).voiceAudioSettings || {}) };
        settingsRef.current = next;
        setSettings(next);
        setSensitivityDraft(next.inputSensitivityDb);
        setInputVolumeDraft(next.inputVolume);
        setOutputVolumeDraft(next.outputVolume);
      }
    };
    window.addEventListener('fastcord:preferences-updated', refreshPreferences);
    return () => window.removeEventListener('fastcord:preferences-updated', refreshPreferences);
  }, [currentUserId]);

  const persist = next => {
    settingsRef.current = next;
    setSettings(next);
    const preferences = getAppPreferences(currentUserId);
    saveAppPreferences(currentUserId, { ...preferences, voiceAudioSettings: next });
  };

  useEffect(() => {
    const syncExternalSettings = event => {
      if (event?.detail?.userId && event.detail.userId !== currentUserId) return;
      const next = { ...DEFAULT_VOICE_AUDIO_SETTINGS, ...(getAppPreferences(currentUserId).voiceAudioSettings || {}) };
      const previous = settingsRef.current;
      if (JSON.stringify(previous) === JSON.stringify(next)) return;
      settingsRef.current = next;
      setSettings(next);
      const microphoneTrack = localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      if (isMicrophoneEnabled && microphoneTrack?.restartTrack) {
        const apply = async () => {
          if (previous.audioQuality !== next.audioQuality) {
            await localParticipant.unpublishTrack(microphoneTrack, false);
            try { await localParticipant.publishTrack(microphoneTrack, getAudioPublishOptions(next)); }
            catch (error) { await localParticipant.publishTrack(microphoneTrack, getAudioPublishOptions(previous)); throw error; }
          }
          const captureKeys = ['inputDeviceId', 'echoCancellation', 'noiseSuppression', 'noiseProcessor', 'voiceIsolation'];
          if (captureKeys.some(key => previous[key] !== next[key])) await microphoneTrack.restartTrack(getAudioCaptureOptions(next));
          const processorKeys = ['noiseProcessor', 'noiseSuppression', 'inputSensitivityEnabled', 'inputSensitivityDb', 'inputVolume'];
          if (captureKeys.some(key => previous[key] !== next[key]) || processorKeys.some(key => previous[key] !== next[key])) await syncNoiseProcessor(microphoneTrack, next);
        };
        apply().catch((error) => setMessage(error instanceof Error ? error.message : 'Mikrofon ayarı uygulanamadı.'));
      }
      if (previous.outputDeviceId !== next.outputDeviceId && supportsAudioOutputSelection()) {
        const outputDevice = next.outputDeviceId || devices.audiooutput[0]?.deviceId;
        if (outputDevice) room.switchActiveDevice('audiooutput', outputDevice).catch((error) => setMessage(error instanceof Error ? error.message : 'Hoparlör ayarı uygulanamadı.'));
      }
    };
    window.addEventListener('fastcord:preferences-updated', syncExternalSettings);
    return () => window.removeEventListener('fastcord:preferences-updated', syncExternalSettings);
  }, [currentUserId, devices.audiooutput, isMicrophoneEnabled, localParticipant, room]);

  const updateCaptureSetting = async (key, value) => {
    const next = { ...settings, [key]: value };
    setMessage('');
    setBusy(key);
    try {
      // Store the switch state first. The settings effect below applies capture
      // constraints in place; restarting the live track made supported device
      // settings appear to snap back on when restartTrack rejected them.
      persist(next);
      setMessage(isMicrophoneEnabled ? 'Mikrofon ayarı uygulandı.' : 'Mikrofonu açtığında ayar uygulanacak.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ses ayarı uygulanamadı.');
    } finally {
      setBusy('');
    }
  };

  const updateAudioQuality = async (audioQuality, { automatic = false } = {}) => {
    const next = { ...settings, audioQuality };
    const track = localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    setBusy('audioQuality');
    setMessage('');
    try {
      if (isMicrophoneEnabled && track) {
        await localParticipant.unpublishTrack(track, false);
        try { await localParticipant.publishTrack(track, getAudioPublishOptions(next)); }
        catch (error) { await localParticipant.publishTrack(track, getAudioPublishOptions(settings)); throw error; }
      }
      persist(next);
      setMessage(automatic ? 'Bağlantı zayıf; daha az internet kullanan konuşma kalitesine geçildi.' : isMicrophoneEnabled ? 'Ses kalitesi güncellendi.' : 'Ses kalitesi mikrofonu açtığında uygulanacak.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ses kalitesi değiştirilemedi.');
    } finally { setBusy(''); }
  };

  useEffect(() => {
    if (connectionQuality === 'poor' || connectionQuality === 'lost') {
      if (settingsRef.current.audioQuality === 'high' && !busy) void updateAudioQuality('speech', { automatic: true });
    }
  }, [connectionQuality, busy]);

  const changeDevice = async (kind, deviceId) => {
    const settingKey = kind === 'audioinput' ? 'inputDeviceId' : 'outputDeviceId';
    const list = devices[kind];
    const selectedId = deviceId || list[0]?.deviceId || '';
    if (!selectedId) { setMessage('Bu aygıt türü için kullanılabilir cihaz bulunamadı.'); return; }
    if (kind === 'audiooutput' && !supportsAudioOutputSelection()) {
      setMessage('Bu tarayıcı ses çıkış aygıtı seçimini desteklemiyor.');
      return;
    }
    setBusy(kind);
    setMessage('');
    try {
      const switched = await room.switchActiveDevice(kind, selectedId);
      if (!switched) throw new Error('Aygıt değiştirilemedi. Cihazı ve tarayıcı iznini kontrol et.');
      persist({ ...settings, [settingKey]: deviceId });
      setMessage(kind === 'audioinput' ? 'Mikrofon değiştirildi.' : 'Ses çıkışı değiştirildi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Aygıt değiştirilemedi.');
    } finally {
      setBusy('');
    }
  };

  const inputOptions = [{ value: '', label: devices.audioinput[0]?.label ? `Varsayılan · ${devices.audioinput[0].label}` : 'Sistem varsayılanı' }, ...devices.audioinput.map((device, index) => ({ value: device.deviceId, label: device.label || `Mikrofon ${index + 1}` }))];
  const outputOptions = [{ value: '', label: devices.audiooutput[0]?.label ? `Varsayılan · ${devices.audiooutput[0].label}` : 'Sistem varsayılanı' }, ...devices.audiooutput.map((device, index) => ({ value: device.deviceId, label: device.label || `Hoparlör ${index + 1}` }))];

  return <div className="relative">
    <button type="button" aria-label="Ses ayarları" aria-expanded={open} title="Mikrofon, hoparlör ve ses kalitesi" onClick={() => { setOpen(value => !value); setMessage(''); }} className={`grid h-9 w-9 place-items-center rounded-xl border transition ${open ? 'border-cyan-200/25 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/[0.07] text-slate-200 hover:bg-white/10'}`}><Settings2 className="h-4 w-4" /></button>
    {open && <section aria-label="Ses ayarları" className="absolute bottom-[calc(100%+12px)] right-0 z-[110] max-h-[min(76vh,760px)] w-[min(720px,calc(100vw-28px))] overflow-y-auto rounded-[24px] border border-cyan-100/15 bg-[linear-gradient(145deg,rgba(30,38,54,.99),rgba(13,18,28,.99))] p-4 shadow-[0_24px_80px_rgba(0,0,0,.65),0_0_30px_rgba(34,211,238,.08)] backdrop-blur-2xl sm:p-5">
      <header className="mb-3 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-200/10 text-cyan-100"><AudioLines className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold text-white">Ses kalitesi</h3><p className="mt-0.5 text-[10px] text-slate-400">WebRTC mikrofon işleme ve cihaz tercihleri</p></div></header>
      <div className="mb-3"><VoiceConnectionHealth /></div>
      <div className="space-y-3">
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Giden ses kalitesi</span><AnimatedSelect ariaLabel="Mikrofon yayın kalitesi" value={settings.audioQuality} onValueChange={value => void updateAudioQuality(value)} options={[{ value: 'speech', label: 'Konuşma · düşük internet kullanımı' }, { value: 'high', label: 'Yüksek kalite · daha çok internet' }]} disabled={busy !== ''} className="w-full" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mikrofon girişi</span><AnimatedSelect ariaLabel="Mikrofon girişi" value={settings.inputDeviceId} onValueChange={value => void changeDevice('audioinput', value)} options={inputOptions} disabled={busy !== ''} className="w-full" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hoparlör / kulaklık</span><AnimatedSelect ariaLabel="Hoparlör veya kulaklık çıkışı" value={settings.outputDeviceId} onValueChange={value => void changeDevice('audiooutput', value)} options={outputOptions} disabled={busy !== '' || !supportsAudioOutputSelection()} className="w-full" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gürültü filtresi</span><AnimatedSelect ariaLabel="Gürültü filtresi" value={settings.noiseProcessor || 'rnnoise'} onValueChange={value => void updateCaptureSetting('noiseProcessor', value)} options={[{ value: 'krisp', label: 'Krisp · en güçlü filtre' }, { value: 'rnnoise', label: 'RNNoise · cihazda, çevrim dışı' }, { value: 'standard', label: 'Standart · düşük işlemci kullanımı' }]} disabled={busy !== ''} className="w-full" /></label>
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
          {[['echoCancellation', 'Yankı engelleme', 'Hoparlörden mikrofona dönen sesi azaltır.', Volume2], ['noiseSuppression', 'Gürültü engelleme', 'Fan ve ortam gürültüsünü azaltır.', AudioLines]].map(([key, label, description, Icon]) => <div key={key} className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-white/[0.055] bg-white/[0.035] px-3.5 py-3 transition-colors hover:border-cyan-200/15 hover:bg-white/[0.05] sm:px-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors ${settings[key] ? 'border-cyan-200/10 bg-cyan-300/[0.11] text-cyan-100' : 'border-white/[0.06] bg-black/10 text-slate-500'}`}><Icon className="h-[17px] w-[17px]" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-100">{label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</span><span className={`mt-1.5 inline-flex items-center gap-1.5 text-[9px] font-semibold ${settings[key] ? 'text-emerald-200/80' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${settings[key] ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.45)]' : 'bg-slate-600'}`} />{settings[key] ? 'Etkin' : 'Kapalı'}</span></span><button type="button" role="switch" aria-checked={settings[key]} aria-label={label} disabled={busy !== ''} onClick={() => void updateCaptureSetting(key, !settings[key])} className={`relative h-6 w-11 shrink-0 rounded-full border p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141b27] ${settings[key] ? 'border-cyan-200/40 bg-cyan-400/50' : 'border-white/10 bg-slate-800'} disabled:cursor-not-allowed disabled:opacity-50`}><span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${settings[key] ? 'translate-x-5' : ''}`} /></button></div>)}
        </div>
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
          <div className="flex min-h-[158px] h-full flex-col rounded-2xl border border-white/[0.055] bg-white/[0.035] p-3.5 transition-colors hover:border-cyan-200/15 hover:bg-white/[0.05] sm:p-4">
            <div className="flex min-h-[42px] items-start gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-200/10 bg-violet-300/[0.09] text-violet-100"><Mic className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[11px] font-semibold text-slate-100">Mikrofon giriş eşiği</span><span className="mt-1 block text-[9px] leading-4 text-slate-500">Arka plan seslerini azaltır.</span></span><button type="button" role="switch" aria-checked={settings.inputSensitivityEnabled} aria-label="Mikrofon giriş eşiği" disabled={busy !== ''} onClick={() => void updateCaptureSetting('inputSensitivityEnabled', !settings.inputSensitivityEnabled)} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141b27] ${settings.inputSensitivityEnabled ? 'border-cyan-200/40 bg-cyan-400/50' : 'border-white/10 bg-slate-800'} disabled:cursor-not-allowed disabled:opacity-50`}><span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${settings.inputSensitivityEnabled ? 'translate-x-5' : ''}`} /></button></div>
            {settings.inputSensitivityEnabled ? <><span className="mt-4 flex justify-between text-[10px] font-semibold text-slate-300"><span>Eşik seviyesi</span><span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 tabular-nums text-cyan-100">{sensitivityDraft} dB</span></span><input type="range" min="-100" max="0" step="1" value={sensitivityDraft} aria-label="Mikrofon giriş eşiği (dB)" onChange={event => setSensitivityDraft(Number(event.target.value))} onPointerUp={event => void updateCaptureSetting('inputSensitivityDb', Number(event.currentTarget.value))} onKeyUp={event => void updateCaptureSetting('inputSensitivityDb', Number(event.currentTarget.value))} className="mt-3 w-full accent-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70" /><span className="mt-2 text-[9px] leading-4 text-slate-500">−100 dB en hassas · 0 dB en yüksek eşik</span></> : <div className="mt-4 flex flex-1 items-center rounded-xl border border-white/[0.045] bg-black/10 px-3 text-[10px] text-slate-500">Giriş eşiği şu an kapalı.</div>}
          </div>
          <label className="flex min-h-[158px] h-full flex-col rounded-2xl border border-white/[0.055] bg-white/[0.035] p-3.5 transition-colors hover:border-cyan-200/15 hover:bg-white/[0.05] sm:p-4"><span className="flex min-h-[42px] items-start gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-200/10 bg-cyan-300/[0.09] text-cyan-100"><Mic className="h-4 w-4" /></span><span className="min-w-0 flex-1 pt-0.5 text-[11px] font-semibold leading-4 text-slate-100">Mikrofon ses seviyesi</span><span className="shrink-0 rounded-md bg-cyan-200/[0.09] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-cyan-100">{inputVolumeDraft}%</span></span><input type="range" min="0" max="200" step="1" value={inputVolumeDraft} aria-label="Mikrofon ses seviyesi" onChange={event => setInputVolumeDraft(Number(event.target.value))} onPointerUp={event => void updateCaptureSetting('inputVolume', Number(event.currentTarget.value))} onKeyUp={event => void updateCaptureSetting('inputVolume', Number(event.currentTarget.value))} className="mt-5 w-full accent-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70" /><span className="mt-2 flex justify-between text-[9px] tabular-nums text-slate-600"><span>0%</span><span>100%</span><span>200%</span></span><span className="mt-auto pt-2 text-[9px] leading-4 text-slate-500">Mikrofon giriş seviyesini ayarla.</span></label>
          <label className="flex min-h-[158px] h-full flex-col rounded-2xl border border-white/[0.055] bg-white/[0.035] p-3.5 transition-colors hover:border-cyan-200/15 hover:bg-white/[0.05] sm:p-4"><span className="flex min-h-[42px] items-start gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-300/[0.09] text-sky-100"><Volume2 className="h-4 w-4" /></span><span className="min-w-0 flex-1 pt-0.5 text-[11px] font-semibold leading-4 text-slate-100">Hoparlör ses seviyesi</span><span className="shrink-0 rounded-md bg-sky-200/[0.09] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-sky-100">{outputVolumeDraft}%</span></span><input type="range" min="0" max="200" step="1" value={outputVolumeDraft} aria-label="Hoparlör ses seviyesi" onChange={event => setOutputVolumeDraft(Number(event.target.value))} onPointerUp={event => { const value = Number(event.currentTarget.value); setOutputVolumeDraft(value); persist({ ...settings, outputVolume: value }); }} onKeyUp={event => { const value = Number(event.currentTarget.value); setOutputVolumeDraft(value); persist({ ...settings, outputVolume: value }); }} className="mt-5 w-full accent-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70" /><span className="mt-2 flex justify-between text-[9px] tabular-nums text-slate-600"><span>0%</span><span>100%</span><span>200%</span></span><span className="mt-auto pt-2 text-[9px] leading-4 text-slate-500">Diğer kişilerin ses seviyesini ayarla.</span></label>
        </div>
      </div>
      {message && <p role="status" className={`mt-3 rounded-xl border px-3 py-2 text-[10px] leading-4 ${message.includes('uygulanamadı') || message.includes('değiştirilemedi') || message.includes('desteklemiyor') || message.includes('bulunamadı') ? 'border-rose-300/15 bg-rose-400/[0.05] text-rose-200' : 'border-emerald-300/10 bg-emerald-400/[0.05] text-emerald-200'}`}>{message}</p>}
      <p className="mt-3 text-[9px] leading-4 text-slate-600">Krisp, LiveKit Cloud ve uyumlu cihazlarda yüksek kaliteli filtre uygular. Olmazsa RNNoise yedeğine geçer. Müzik için filtreyi kapatabilirsin.</p>
    </section>}
  </div>;
}

function ScreenSourcePicker({ sources, settings, onSettingChange, pending, onChoose, onClose }) {
  const [category, setCategory] = useState('screen');
  useEffect(() => {
    const escape = event => { if (event.key === 'Escape' && !pending) { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [onClose, pending]);
  const screens = sources.filter((source) => source.kind === 'screen');
  const windows = sources.filter((source) => source.kind === 'window');
  const visibleSources = category === 'screen' ? screens : windows;
  const qualityOptions = [
    { value: '720', label: 'HD · 720p' },
    { value: '1080', label: 'Full HD · 1080p' },
    { value: '1440', label: 'QHD · 1440p' },
  ];
  const frameRateOptions = [
    { value: 15, label: '15 FPS · düşük kullanım' },
    { value: 30, label: '30 FPS · dengeli' },
    { value: 60, label: '60 FPS · akıcı' },
  ];

  return createPortal(<div className="fixed inset-0 z-[1500] grid place-items-center bg-[#03050a]/80 p-3 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="screen-source-title" className="w-full max-w-3xl overflow-hidden rounded-[26px] border border-white/[0.12] bg-[linear-gradient(150deg,#1a2030,#10141d)] shadow-[0_30px_100px_rgba(0,0,0,.72)] animate-in fade-in zoom-in-95 duration-150">
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-300/10 text-violet-200"><MonitorUp className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><h2 id="screen-source-title" className="text-sm font-bold text-white">Paylaşımını ayarla</h2><p className="mt-0.5 text-[10px] text-slate-500">Ekran veya pencere seçip görüntü ayarlarını yap.</p></div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-white/[0.07] hover:text-white" aria-label="Kapat"><X className="h-4 w-4" /></button>
      </header>

      <div className="border-b border-white/[0.06] px-4 pt-4">
        <div className="flex w-fit items-center gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1" role="tablist" aria-label="Paylaşım kaynağı türü">
          {[{ id: 'screen', label: 'Ekranlar', Icon: Monitor, count: screens.length }, { id: 'window', label: 'Pencereler', Icon: AppWindow, count: windows.length }].map(({ id, label, Icon, count }) => <button key={id} type="button" role="tab" aria-selected={category === id} onClick={() => setCategory(id)} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition ${category === id ? 'bg-violet-300/15 text-violet-100 shadow-[inset_0_0_0_1px_rgba(196,181,253,.13)]' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`}><Icon className="h-3.5 w-3.5" />{label}<span className={`rounded-md px-1.5 py-0.5 text-[9px] ${category === id ? 'bg-violet-200/10 text-violet-100' : 'bg-white/[0.05] text-slate-500'}`}>{count}</span></button>)}
        </div>
        <p className="pb-3 pt-2 text-[10px] text-slate-500">{category === 'screen' ? 'Tüm monitörü paylaş.' : 'Tek bir uygulama penceresini paylaş.'}</p>
      </div>

      <div className="grid max-h-[min(42vh,410px)] grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSources.map((source) => <button key={source.id} type="button" onClick={() => void onChoose(source)} disabled={pending} className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-black/15 text-left transition hover:border-violet-200/35 hover:bg-violet-300/[0.06] disabled:opacity-50"><div className="relative aspect-video overflow-hidden bg-[#090c12]">{source.thumbnail ? <img src={source.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" /> : <div className="grid h-full place-items-center text-violet-200">{category === 'screen' ? <Monitor className="h-8 w-8" /> : <AppWindow className="h-8 w-8" />}</div>}<span className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" /><span className="absolute bottom-2 left-2 rounded-md border border-white/10 bg-black/55 px-1.5 py-1 text-[9px] font-semibold text-white/90">{category === 'screen' ? 'EKRAN' : 'PENCERE'}</span></div><div className="truncate px-3 py-2.5 text-xs font-semibold text-slate-200">{source.name}</div></button>)}
        {!visibleSources.length && <div className="col-span-full flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.09] text-center"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.04] text-slate-500">{category === 'screen' ? <Monitor className="h-5 w-5" /> : <AppWindow className="h-5 w-5" />}</span><p className="text-xs font-semibold text-slate-300">{category === 'screen' ? 'Paylaşılabilir ekran bulunamadı' : 'Açık uygulama penceresi bulunamadı'}</p><p className="text-[10px] text-slate-500">Diğer kaynak türünü seçebilir veya pencereyi yeniden açabilirsin.</p></div>}
      </div>

      <div className="grid gap-3 border-t border-white/[0.07] bg-black/10 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-[10px] font-semibold text-slate-400">Görüntü kalitesi<AnimatedSelect ariaLabel="Ekran paylaşımı görüntü kalitesi" value={settings.quality} onValueChange={(value) => onSettingChange('quality', value)} disabled={pending} options={qualityOptions} menuClassName="z-[1600] mt-1.5 w-full" className="mt-1.5 w-full bg-[#111722]" /></label>
        <label className="text-[10px] font-semibold text-slate-400">Kare hızı<AnimatedSelect ariaLabel="Ekran paylaşımı kare hızı" value={settings.frameRate} onValueChange={(value) => onSettingChange('frameRate', Number(value))} disabled={pending} options={frameRateOptions} menuClassName="z-[1600] mt-1.5 w-full" className="mt-1.5 w-full bg-[#111722]" /></label>
        <button type="button" role="switch" aria-checked={settings.audio} disabled={pending || !supportsOwnAudioExclusion()} onClick={() => onSettingChange('audio', !settings.audio)} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-left text-xs font-semibold transition ${settings.audio ? 'border-cyan-200/25 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-white/[0.035] text-slate-300'}`}><span className={`grid h-4 w-4 place-items-center rounded border ${settings.audio ? 'border-cyan-200/50 bg-cyan-300/20' : 'border-white/20'}`}>{settings.audio && <Check className="h-3 w-3" />}</span>Sistem sesini paylaş</button>
        <p className="text-[9px] leading-4 text-slate-600 sm:col-span-3">Yüksek çözünürlük ve FPS daha fazla internet ve işlemci kullanır. Windows uygulamasında Fastlynox konuşmaları yayının sesinden hariç tutulur. Sistem sesi, seçilen pencere dışındaki uygulamaları da içerebilir. {!supportsOwnAudioExclusion() && 'Bu ortamda görüşme sesini hariç tutma desteklenmediği için sistem sesi kapalıdır.'}</p>
      </div>
    </section>
  </div>, document.body);
}

function matchesVoiceKeybind(event, binding, rightAltHeld = false, rightCtrlHeld = false) {
  if (!binding) return false;
  const expected = binding.split('+');
  if (expected.at(-1)?.startsWith('Mouse')) return false;
  const expectsRightAlt = expected.includes('AltRight') || expected.includes('AltGraph');
  const expectsRightCtrl = expected.includes('CtrlRight');
  const expectedCode = expected.at(-1) === 'CtrlRight' ? 'ControlRight' : expected.at(-1) === 'Fn' ? 'Fn' : expected.at(-1);
  return expectedCode === event.code
    && (expected.includes('Ctrl') || expectsRightCtrl || (expectsRightAlt && event.getModifierState?.('AltGraph'))) === event.ctrlKey
    && (!expectsRightCtrl || rightCtrlHeld || event.code === 'ControlRight')
    && (expected.includes('Alt') || expectsRightAlt) === event.altKey
    && (!expectsRightAlt || rightAltHeld || event.getModifierState?.('AltGraph'))
    && expected.includes('Shift') === event.shiftKey
    && expected.includes('Meta') === event.metaKey;
}

function VoiceControls({ onLeave, onDeafenedChange = () => {}, compact = false, expanded = false, onToggleExpand }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [isDeafened, setIsDeafened] = useState(false);
  const [pendingControl, setPendingControl] = useState('');
  const [controlError, setControlError] = useState('');
  const [effectiveKeybinds, setEffectiveKeybinds] = useState(null);
  const [microphoneBeforeDeafen, setMicrophoneBeforeDeafen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [screenSources, setScreenSources] = useState([]);
  const [screenSourcePickerOpen, setScreenSourcePickerOpen] = useState(false);
  const [screenShareMenuOpen, setScreenShareMenuOpen] = useState(false);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [voiceKeyPreferences, setVoiceKeyPreferences] = useState(() => getAppPreferences(currentUserId));
  const microphoneTestActiveRef = useRef(false);
  const microphoneTestRestoreRef = useRef(false);
  const microphoneTestDeafenAttemptRef = useRef(false);
  useEffect(() => {
    const refresh = event => { if (!event?.detail?.userId || event.detail.userId === currentUserId) setVoiceKeyPreferences(getAppPreferences(currentUserId)); };
    window.addEventListener('fastcord:preferences-updated', refresh);
    return () => window.removeEventListener('fastcord:preferences-updated', refresh);
  }, [currentUserId]);
  const voiceAudioSettings = getAppPreferences(currentUserId).voiceAudioSettings || DEFAULT_VOICE_AUDIO_SETTINGS;
  useEffect(() => {
    if (connectionState === 'connected' && voiceKeyPreferences.pushToTalkEnabled && isMicrophoneEnabled) {
      void localParticipant.setMicrophoneEnabled(false, getAudioCaptureOptions(voiceAudioSettings), getAudioPublishOptions(voiceAudioSettings));
    }
  }, [connectionState, voiceKeyPreferences.pushToTalkEnabled, localParticipant, isMicrophoneEnabled, voiceAudioSettings]);
  const [screenShareSettings, setScreenShareSettings] = useState(() => ({ quality: '1080', frameRate: 30, audio: false, ...(getAppPreferences(currentUserId).screenShareSettings || {}) }));

  const updateScreenShareSettings = (key, value) => {
    const next = { ...screenShareSettings, [key]: value };
    setScreenShareSettings(next);
    const preferences = getAppPreferences(currentUserId);
    saveAppPreferences(currentUserId, { ...preferences, screenShareSettings: next });
  };

  const toggle = useCallback(async (control, action) => {
    if (pendingControl) return;
    setPendingControl(control);
    setControlError('');
    try { await action(); }
    catch (error) { setControlError(error instanceof Error ? error.message : 'Medya aygıtı değiştirilemedi.'); }
    finally { setPendingControl(''); }
  }, [pendingControl]);

  const startScreenShare = async () => {
    if (isScreenShareEnabled) {
      setScreenShareMenuOpen(value => !value);
      return;
    }
    if (!window.fastlynoxDesktop?.listScreenSources) {
      await toggle('screen', async () => {
        await localParticipant.setScreenShareEnabled(true, getScreenShareCaptureOptions(screenShareSettings), getScreenSharePublishOptions(screenShareSettings));
        if (screenShareSettings.audio && !supportsOwnAudioExclusion()) setControlError('Bu ortam görüşme sesini yayından ayıramıyor. Yankıyı önlemek için yayın sessiz başlatıldı.');
      });
      return;
    }
    setPendingControl('screen');
    setControlError('');
    try {
      const sources = await window.fastlynoxDesktop.listScreenSources();
      if (!sources?.length) throw new Error('Paylaşılabilir ekran veya pencere bulunamadı.');
      setScreenSources(sources);
      setScreenSourcePickerOpen(true);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Ekran kaynakları alınamadı.');
    } finally {
      setPendingControl('');
    }
  };

  const openScreenShareSettings = async () => {
    setScreenShareMenuOpen(false);
    if (!window.fastlynoxDesktop?.listScreenSources) {
      setControlError('Yayın kaynağı ayarları masaüstü uygulamasında kullanılabilir.');
      return;
    }
    setPendingControl('screen');
    try {
      const sources = await window.fastlynoxDesktop.listScreenSources();
      setScreenSources(sources || []);
      setScreenSourcePickerOpen(true);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Yayın kaynakları alınamadı.');
    } finally { setPendingControl(''); }
  };

  const chooseScreenSource = async (source) => {
    if (pendingControl) return;
    setPendingControl('screen');
    setControlError('');
    try {
      if (isScreenShareEnabled) await localParticipant.setScreenShareEnabled(false);
      const selected = await window.fastlynoxDesktop.selectScreenSource(source.id, screenShareSettings.audio);
      if (!selected) throw new Error('Ekran kaynağı seçilemedi. Yeniden dene.');
      await localParticipant.setScreenShareEnabled(true, getScreenShareCaptureOptions(screenShareSettings), getScreenSharePublishOptions(screenShareSettings));
      setScreenSourcePickerOpen(false);
      if (screenShareSettings.audio && !supportsOwnAudioExclusion()) setControlError('Bu ortam görüşme sesini yayından ayıramıyor. Yankıyı önlemek için yayın sessiz başlatıldı.');
    } catch (error) {
      setControlError(error instanceof Error ? error.message : 'Ekran paylaşımı başlatılamadı.');
    } finally {
      setPendingControl('');
    }
  };

  const toggleDeafen = useCallback(() => toggle('deafen', async () => {
    if (isDeafened) {
      await localParticipant.setMicrophoneEnabled(microphoneBeforeDeafen, getAudioCaptureOptions(voiceAudioSettings), getAudioPublishOptions(voiceAudioSettings));
      setIsDeafened(false);
      onDeafenedChange(false);
      if (!microphoneTestActiveRef.current && !microphoneTestRestoreRef.current) playUiSound('headphonesOn', currentUserId);
      return;
    }
    setMicrophoneBeforeDeafen(isMicrophoneEnabled);
    await localParticipant.setMicrophoneEnabled(false, getAudioCaptureOptions(voiceAudioSettings), getAudioPublishOptions(voiceAudioSettings));
    setIsDeafened(true);
    onDeafenedChange(true);
    if (!microphoneTestActiveRef.current && !microphoneTestRestoreRef.current) playUiSound('headphonesOff', currentUserId);
  }), [toggle, isDeafened, microphoneBeforeDeafen, localParticipant, voiceAudioSettings, isMicrophoneEnabled, onDeafenedChange, currentUserId]);

  const keybinds = useMemo(() => ({ toggleMicrophone: 'Ctrl+Alt+KeyM', toggleDeafen: 'Ctrl+Alt+KeyD', pushToTalk: 'KeyV', ...(voiceKeyPreferences.keybinds || {}) }), [voiceKeyPreferences.keybinds]);
  const activeKeybinds = effectiveKeybinds ? { ...keybinds, ...effectiveKeybinds } : keybinds;
  const pushToTalkEnabled = Boolean(voiceKeyPreferences.pushToTalkEnabled);
  const voiceInputRef = useRef({});
  const pushHeldRef = useRef(false);
  const pushToTalkPressRef = useRef(() => {});
  const pushToTalkReleaseRef = useRef(() => {});
  const rightAltHeldRef = useRef(false);
  const rightCtrlHeldRef = useRef(false);
  const pushEnablePromiseRef = useRef(Promise.resolve());
  const pushRestoreMicRef = useRef(false);
  const deafenActionRef = useRef(toggleDeafen);
  useLayoutEffect(() => {
    deafenActionRef.current = toggleDeafen;
    voiceInputRef.current = { localParticipant, keybinds: activeKeybinds, pushToTalkEnabled, isDeafened, isMicrophoneEnabled, pendingControl, voiceAudioSettings, onDeafenedChange, currentUserId, toggleMicrophone: () => toggle('mic', async () => { const enabled = !isMicrophoneEnabled; await localParticipant.setMicrophoneEnabled(enabled, getAudioCaptureOptions(voiceAudioSettings), getAudioPublishOptions(voiceAudioSettings)); playUiSound(enabled ? 'microphoneOn' : 'microphoneOff', currentUserId); }) };
  }, [localParticipant, activeKeybinds, pushToTalkEnabled, isDeafened, isMicrophoneEnabled, pendingControl, voiceAudioSettings, onDeafenedChange, currentUserId, toggleDeafen, toggle]);
  useEffect(() => {
    const desktop = window.fastlynoxDesktop;
    if (!desktop?.onVoiceHotkey) return undefined;
    return desktop.onVoiceHotkey((payload) => {
      const action = typeof payload === 'string' ? payload : payload?.action;
      const phase = typeof payload === 'object' ? payload?.phase : null;
      if (action === 'pushToTalk') {
        if (phase === 'up') { pushToTalkReleaseRef.current(); return; }
        if (phase === 'down' && !document.hasFocus()) pushToTalkPressRef.current();
        return;
      }
      // The DOM key handler owns the focused case. This prevents a global
      // shortcut and the regular keydown listener from toggling twice.
      if (document.hasFocus()) return;
      const state = voiceInputRef.current;
      if (action === 'toggleMicrophone') {
        if (state.pendingControl || state.isDeafened || state.pushToTalkEnabled) return;
        void state.toggleMicrophone?.();
      } else if (action === 'toggleDeafen' && !state.pendingControl) {
        deafenActionRef.current();
      }
    });
  }, []);
  useEffect(() => {
    const desktop = window.fastlynoxDesktop;
    if (!desktop?.setVoiceKeybinds || !desktop?.setVoiceHotkeysEnabled) return undefined;
    let active = true;
    setEffectiveKeybinds(null);
    setControlError('');
    void desktop.setVoiceKeybinds(keybinds)
      .then(() => desktop.setVoiceHotkeysEnabled(true))
      .then((result) => {
        if (!active) return;
        const codes = { Control: 'Ctrl', Super: 'Meta', M: 'KeyM', D: 'KeyD', F9: 'F9', F10: 'F10', F8: 'F8', F7: 'F7', F6: 'F6', F5: 'F5' };
        const effective = Object.fromEntries(Object.entries(result?.bindings || {}).map(([action, accelerator]) => [action, accelerator.split('+').map(part => codes[part] || part).join('+')]));
        setEffectiveKeybinds(effective);
      })
      .catch(() => {});
    return () => { active = false; void desktop.setVoiceHotkeysEnabled(false); };
  }, [keybinds]);
  useEffect(() => {
    const handleMicrophoneTest = event => {
      const active = Boolean(event.detail?.active);
      if (active === microphoneTestActiveRef.current) return;
      microphoneTestActiveRef.current = active;
      if (active) {
        microphoneTestRestoreRef.current = !voiceInputRef.current.isDeafened;
        microphoneTestDeafenAttemptRef.current = false;
      }
    };
    window.addEventListener('fastlynox:microphone-test', handleMicrophoneTest);
    return () => window.removeEventListener('fastlynox:microphone-test', handleMicrophoneTest);
  }, []);
  useEffect(() => {
    if (pendingControl) return;
    if (microphoneTestActiveRef.current && !isDeafened && !microphoneTestDeafenAttemptRef.current) {
      microphoneTestDeafenAttemptRef.current = true;
      deafenActionRef.current();
    } else if (!microphoneTestActiveRef.current && microphoneTestRestoreRef.current) {
      if (isDeafened) deafenActionRef.current();
      else microphoneTestRestoreRef.current = false;
    }
  }, [isDeafened, pendingControl]);
  useEffect(() => {
    const isEditable = target => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const releasePushToTalk = () => {
      if (!pushHeldRef.current) return;
      pushHeldRef.current = false;
      const state = voiceInputRef.current;
      if (!pushRestoreMicRef.current) {
        void Promise.resolve(pushEnablePromiseRef.current).catch(() => {}).then(() => state.localParticipant.setMicrophoneEnabled(false, getAudioCaptureOptions(state.voiceAudioSettings), getAudioPublishOptions(state.voiceAudioSettings))).catch(() => {});
      }
    };
    const pressPushToTalk = () => {
      const state = voiceInputRef.current;
      if (!state.pushToTalkEnabled || state.isDeafened || state.pendingControl || pushHeldRef.current) return;
      pushHeldRef.current = true;
      pushRestoreMicRef.current = state.isMicrophoneEnabled;
      if (!state.isMicrophoneEnabled) {
        pushEnablePromiseRef.current = state.localParticipant.setMicrophoneEnabled(true, getAudioCaptureOptions(state.voiceAudioSettings), getAudioPublishOptions(state.voiceAudioSettings)).catch(error => { pushHeldRef.current = false; throw error; });
        void pushEnablePromiseRef.current.catch(() => {});
      }
    };
    pushToTalkPressRef.current = pressPushToTalk;
    pushToTalkReleaseRef.current = releasePushToTalk;
    const handleKeyDown = event => {
      if (event.code === 'AltRight') rightAltHeldRef.current = true;
      if (event.code === 'ControlRight') rightCtrlHeldRef.current = true;
      const state = voiceInputRef.current;
      if (event.repeat || isEditable(event.target)) return;
      if (matchesVoiceKeybind(event, state.keybinds.toggleMicrophone, rightAltHeldRef.current, rightCtrlHeldRef.current)) {
        event.preventDefault();
        if (!state.pendingControl && !state.isDeafened && !state.pushToTalkEnabled) {
          const enabled = !state.isMicrophoneEnabled;
          void state.localParticipant.setMicrophoneEnabled(enabled, getAudioCaptureOptions(state.voiceAudioSettings), getAudioPublishOptions(state.voiceAudioSettings)).then(() => playUiSound(enabled ? 'microphoneOn' : 'microphoneOff', state.currentUserId)).catch(() => {});
        }
      } else if (matchesVoiceKeybind(event, state.keybinds.toggleDeafen, rightAltHeldRef.current, rightCtrlHeldRef.current)) {
        event.preventDefault();
        deafenActionRef.current();
      } else if (state.pushToTalkEnabled && matchesVoiceKeybind(event, state.keybinds.pushToTalk, rightAltHeldRef.current, rightCtrlHeldRef.current) && !state.isDeafened && !state.pendingControl) {
        event.preventDefault();
        pressPushToTalk();
      }
    };
    const handleKeyUp = event => {
      if (event.code === 'AltRight') rightAltHeldRef.current = false;
      if (event.code === 'ControlRight') rightCtrlHeldRef.current = false;
      if (!pushHeldRef.current) return;
      const bindingParts = voiceInputRef.current.keybinds.pushToTalk?.split('+') || [];
      const releasedModifierCodes = { Ctrl: 'ControlLeft', CtrlRight: 'ControlRight', Alt: 'AltLeft', AltRight: 'AltRight', AltGraph: 'AltRight', Shift: 'ShiftLeft', Meta: 'MetaLeft' };
      if (event.code === bindingParts.at(-1) || bindingParts.some(part => releasedModifierCodes[part] === event.code)) releasePushToTalk();
    };
    const handleMouseDown = event => {
      const state = voiceInputRef.current;
      const buttonKey = event.button === 3 ? 'Mouse4' : event.button === 4 ? 'Mouse5' : '';
      if (!buttonKey) return;
      const toggleMic = state.keybinds.toggleMicrophone === buttonKey;
      const toggleHeadphones = state.keybinds.toggleDeafen === buttonKey;
      const pushToTalk = state.keybinds.pushToTalk === buttonKey;
      if (!toggleMic && !toggleHeadphones && !(pushToTalk && state.pushToTalkEnabled)) return;
      event.preventDefault();
      if (toggleMic && !state.pendingControl && !state.isDeafened && !state.pushToTalkEnabled) {
        const enabled = !state.isMicrophoneEnabled;
        void state.localParticipant.setMicrophoneEnabled(enabled, getAudioCaptureOptions(state.voiceAudioSettings), getAudioPublishOptions(state.voiceAudioSettings)).then(() => playUiSound(enabled ? 'microphoneOn' : 'microphoneOff', state.currentUserId)).catch(() => {});
      } else if (toggleHeadphones) deafenActionRef.current();
      else if (pushToTalk && !state.isDeafened && !state.pendingControl && !pushHeldRef.current) {
        pressPushToTalk();
      }
    };
    const handleMouseUp = event => { if ((event.button === 3 || event.button === 4) && pushHeldRef.current && voiceInputRef.current.keybinds.pushToTalk === (event.button === 3 ? 'Mouse4' : 'Mouse5')) releasePushToTalk(); };
    const handleBlur = () => releasePushToTalk();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleBlur);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); window.removeEventListener('mousedown', handleMouseDown, true); window.removeEventListener('mouseup', handleMouseUp, true); window.removeEventListener('blur', handleBlur); releasePushToTalk(); pushToTalkPressRef.current = () => {}; pushToTalkReleaseRef.current = () => {}; };
  }, [keybinds.toggleMicrophone, keybinds.toggleDeafen, keybinds.pushToTalk, pushToTalkEnabled]);

  const controls = [
    { key: 'mic', label: pushToTalkEnabled ? 'Bas-konuş etkin · atanmış tuşla konuş' : isMicrophoneEnabled ? 'Mikrofonu kapat' : 'Mikrofonu aç', active: isMicrophoneEnabled, icon: isMicrophoneEnabled ? Mic : MicOff, action: () => toggle('mic', async () => { const enabled = !isMicrophoneEnabled; await localParticipant.setMicrophoneEnabled(enabled, getAudioCaptureOptions(voiceAudioSettings), getAudioPublishOptions(voiceAudioSettings)); playUiSound(enabled ? 'microphoneOn' : 'microphoneOff', currentUserId); }) },
    { key: 'deafen', label: isDeafened ? 'Kulaklığı aç' : 'Kulaklığı kapat', active: isDeafened, icon: isDeafened ? HeadphoneOff : Headphones, action: toggleDeafen },
    { key: 'camera', label: isCameraEnabled ? 'Kamerayı kapat' : 'Kamerayı aç', active: isCameraEnabled, icon: isCameraEnabled ? CameraOff : Camera, action: () => toggle('camera', () => localParticipant.setCameraEnabled(!isCameraEnabled)) },
    { key: 'screen', label: isScreenShareEnabled ? 'Ekran paylaşımını durdur' : 'Ekran paylaş', active: isScreenShareEnabled, icon: MonitorUp, action: startScreenShare },
  ];

  return (
    <div className={`${compact ? 'shrink-0' : 'shrink-0 border-t border-white/[0.07] bg-[#0b0e14]/75 px-4 py-3 backdrop-blur-2xl'}`}>
      {controlError && <p role="alert" className="mx-auto mb-2 max-w-xl rounded-lg border border-rose-300/15 bg-rose-400/5 px-3 py-2 text-center text-xs text-rose-200">{controlError}</p>}
      <div className={`mx-auto flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.055] p-1 shadow-[0_12px_36px_rgba(0,0,0,.28)] ${compact ? 'w-fit max-w-full' : 'max-w-3xl gap-2 rounded-2xl p-2'}`}>
    {controls.filter(({ key }) => !compact || expanded || key === 'mic' || key === 'deafen').map(({ key, label, active, icon: Icon, action }) => {
          const tone = key === 'deafen'
            ? active ? 'border-rose-300/15 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20' : 'border-white/10 bg-white/[0.07] text-white hover:bg-white/10'
            : key === 'screen'
              ? active ? 'border-violet-300/25 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-white/[0.07] text-white hover:bg-white/10'
              : active ? 'border-white/10 bg-white/[0.07] text-white hover:bg-white/10' : 'border-rose-300/15 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20';
          return (
          <div key={key} className="relative"><button type="button" aria-label={label} aria-pressed={active} aria-busy={pendingControl === key} title={label} disabled={(pendingControl !== '' && pendingControl !== key) || (key === 'mic' && (isDeafened || pushToTalkEnabled))} onClick={action} className={`group grid place-items-center rounded-xl border transition-all disabled:opacity-50 ${compact ? 'h-9 w-9' : 'h-11 w-12'} ${tone}`}>
            <Icon className="h-[18px] w-[18px] transition-transform group-hover:scale-105" />
          </button>
          {key === 'screen' && screenShareMenuOpen && <div role="menu" className="absolute bottom-[calc(100%+10px)] right-0 z-[120] w-48 rounded-2xl border border-white/10 bg-[#171d29]/[.98] p-1.5 shadow-[0_18px_54px_rgba(0,0,0,.65)] backdrop-blur-xl"><button type="button" role="menuitem" onClick={() => { setScreenShareMenuOpen(false); void toggle('screen', () => localParticipant.setScreenShareEnabled(false)); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-rose-200 transition hover:bg-rose-300/[.08]"><MonitorUp className="h-4 w-4" />Yayını durdur</button><button type="button" role="menuitem" onClick={() => void openScreenShareSettings()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/[.07]"><Settings2 className="h-4 w-4 text-violet-200" />Yayın ayarları</button></div>}
          </div>
          );
        })}
        <VoiceAudioSettings currentUserId={currentUserId} />
        {compact && <button type="button" onClick={onToggleExpand} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10 hover:text-white" aria-label={expanded ? 'Ses kontrollerini daralt' : 'Diğer ses kontrollerini göster'} title={expanded ? 'Daralt' : 'Kamera ve ekran paylaşımı'}><MoreHorizontal className="h-4 w-4" /></button>}
        {(!compact || expanded) && <div className="relative"><button type="button" onClick={() => setSoundboardOpen((open) => !open)} aria-expanded={soundboardOpen} aria-label="Ses efektleri" title="Ses efektleri · yalnızca sende duyulur" className={`grid h-9 w-9 place-items-center rounded-xl border transition ${soundboardOpen ? 'border-cyan-200/20 bg-cyan-300/15 text-cyan-100' : 'border-white/10 bg-white/[0.07] text-slate-200 hover:bg-white/10'}`}><AudioLines className="h-4 w-4" /></button>{soundboardOpen && <div className="absolute bottom-full left-1/2 z-[100] mb-2 w-44 -translate-x-1/2 rounded-2xl border border-white/10 bg-[#141a25]/95 p-1.5 shadow-2xl backdrop-blur-xl"><p className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">Ses efektleri · yerel</p>{[['soundboardChime', 'Kristal'], ['soundboardPulse', 'Ritim'], ['soundboardDrop', 'Düşüş']].map(([sound, label]) => <button key={sound} type="button" onClick={() => playUiSound(sound, currentUserId)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/[0.07]"><Volume2 className="h-3.5 w-3.5 text-cyan-200" />{label}</button>)}<p className="px-2.5 pb-1 pt-1 text-[9px] leading-4 text-slate-500">Bu efektler yalnızca bu cihazda çalar.</p></div>}</div>}
        <button type="button" onClick={onLeave} className={`inline-flex items-center justify-center gap-2 border border-rose-300/15 bg-rose-500/15 text-rose-100 transition hover:bg-rose-500/25 ${compact ? 'h-9 w-9 rounded-full' : 'h-11 rounded-xl px-3'}`} aria-label="Ses odasından ayrıl" title="Ses odasından ayrıl">
          <PhoneOff className="h-[17px] w-[17px]" />
          {!compact && <span className="text-xs font-semibold">Ayrıl</span>}
        </button>
      </div>
      {screenSourcePickerOpen && <ScreenSourcePicker sources={screenSources} settings={screenShareSettings} onSettingChange={updateScreenShareSettings} pending={pendingControl !== ''} onChoose={chooseScreenSource} onClose={() => setScreenSourcePickerOpen(false)} />}
    </div>
  );
}

export function VoiceRoom({ channelId, serverId = null, dmChannelId = null, channelName, isStageVisible = true, contextMenuRequest, onContextMenuRequestHandled, onPresenceError, onLeave = () => {}, onReturn = () => {}, onParticipantsChange = () => {} }) {
  const [localDeafened, setLocalDeafened] = useState(false);
  const [connection, setConnection] = useState({ channelId: null, userId: null, token: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [deviceWarning, setDeviceWarning] = useState('');
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const { user } = useAuthStore();
  const userId = user?.id;

  const [voiceAudioSettings, setVoiceAudioSettings] = useState(() => ({ ...DEFAULT_VOICE_AUDIO_SETTINGS, ...(getAppPreferences(userId).voiceAudioSettings || {}) }));

  useEffect(() => {
    setVoiceAudioSettings({ ...DEFAULT_VOICE_AUDIO_SETTINGS, ...(getAppPreferences(userId).voiceAudioSettings || {}) });
    const syncVoiceSettings = event => {
      if (!event?.detail?.userId || event.detail.userId === userId) setVoiceAudioSettings({ ...DEFAULT_VOICE_AUDIO_SETTINGS, ...(getAppPreferences(userId).voiceAudioSettings || {}) });
    };
    window.addEventListener('fastcord:preferences-updated', syncVoiceSettings);
    return () => window.removeEventListener('fastcord:preferences-updated', syncVoiceSettings);
  }, [userId]);

  useEffect(() => {
    let isCurrent = true;
    if (!channelId || !userId) return () => { isCurrent = false; };

    generateLiveKitToken(channelId, { dmChannelId })
      .then((token) => {
        if (isCurrent) setConnection({ channelId, userId, token, error: '' });
      })
      .catch((reason) => {
        if (isCurrent) setConnection({
          channelId,
          userId,
          token: null,
          error: reason instanceof Error ? reason.message : 'Could not join this voice channel.',
        });
      });

    return () => { isCurrent = false; };
  }, [channelId, dmChannelId, userId, attempt]);

  const isCurrentConnection = connection.channelId === channelId && connection.userId === userId;
  const token = isCurrentConnection ? connection.token : null;
  const liveKitUrl = import.meta.env.VITE_LIVEKIT_URL;
  const error = isCurrentConnection ? connection.error : '';
  const connectionError = error || (token && !liveKitUrl ? 'LiveKit sunucu adresi yapılandırılmamış.' : '');
  const handleLiveKitConnected = useCallback(() => {
    setDeviceWarning('');
    playUiSound('join', userId);
  }, [userId]);
  const handleLiveKitDisconnected = useCallback((reason) => {
    onParticipantsChange([]);
    // The SDK emits this for intentional cleanup (including a cancelled
    // in-flight connect). Keep the active session/token intact in that case;
    // treating it as a network failure made the join panel permanently fail.
    if (reason === DisconnectReason.CLIENT_INITIATED) return;
    if (serverId && channelId) void supabase.rpc('clear_server_voice_presence', { channel_uuid: channelId });
    setConnection({ channelId, userId, token: null, error: 'Ses bağlantısı kesildi. Yeniden bağlanmayı deneyin.' });
  }, [channelId, serverId, userId, onParticipantsChange]);
  const handleLiveKitError = useCallback((reason) => {
    const message = reason?.message || '';
    if (/client initiated disconnect|connection attempt aborted/i.test(message)) return;
    setConnection({ channelId, userId, token: null, error: message || 'Ses bağlantısı kurulamadı.' });
  }, [channelId, userId]);
  const handleMediaDeviceFailure = useCallback((failure) => {
    setDeviceWarning(failure ? 'Mikrofon açılamadı. Mikrofon iznini ve seçili cihazı kontrol et.' : '');
  }, []);
  const panelClass = isStageVisible
    ? 'absolute top-0 bottom-[88px] left-[256px] right-[250px] z-30 flex min-w-0 flex-col overflow-hidden border-x border-white/[0.07] bg-[#0b0e14]/95 shadow-2xl max-xl:right-0 max-md:left-0'
    : isDockExpanded
      ? 'absolute bottom-[82px] left-1/2 z-[75] h-[min(560px,72vh)] w-[min(440px,calc(100%-24px))] -translate-x-1/2 overflow-visible rounded-[24px] border border-white/10 bg-[#11151e]/95 shadow-[0_20px_70px_rgba(0,0,0,.55)] backdrop-blur-2xl transition-all duration-300 ease-out'
      : 'voice-mini-dock absolute bottom-[82px] left-1/2 z-[75] flex w-fit max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 overflow-visible rounded-full border border-white/10 bg-[#11151e] px-3 py-2 shadow-[0_16px_60px_rgba(0,0,0,.52)] transition-all duration-300 ease-out';

  if (connectionError) {
    return (
      <div className={`${panelClass} ${isStageVisible ? 'items-center justify-center p-6' : 'p-3'}`} role="alert">
        <div className={`w-full rounded-2xl border border-white/10 bg-white/[0.04] text-center shadow-xl backdrop-blur-2xl ${isStageVisible ? 'max-w-md p-8' : 'p-4'}`}>
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-rose-400/10 text-rose-300"><Mic className="h-5 w-5" /></div>
          <h1 className="text-base font-bold text-white">Ses odasına bağlanılamadı</h1>
          <p className="mt-2 text-xs leading-5 text-slate-400">{connectionError}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400"><RefreshCw className="h-3.5 w-3.5" /> Yeniden dene</button>
            <button type="button" onClick={onLeave} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/15 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"><PhoneOff className="h-3.5 w-3.5" /> Odadan ayrıl</button>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className={`${panelClass} flex items-center justify-center gap-3 text-white ${isStageVisible ? 'flex-col' : 'px-4 py-3'}`}>
        <Loader2 className="h-6 w-6 shrink-0 animate-spin text-emerald-400" />
        <div className={isStageVisible ? 'text-center' : 'min-w-0 flex-1'}>
          <h1 className="text-sm font-bold">{channelName} odasına bağlanılıyor…</h1>
          <p className="mt-1 text-xs text-slate-500">Mikrofon izni istenebilir.</p>
        </div>
        <button type="button" onClick={onLeave} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-rose-300/15 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"><PhoneOff className="h-3.5 w-3.5" /> Ayrıl</button>
      </div>
    );
  }

  return (
    <div className={`${panelClass} ${isStageVisible ? '' : isDockExpanded ? '' : 'rounded-full'}`} data-lk-theme="default">
      {(isStageVisible || isDockExpanded) && <div className="h-12 border-b border-white/5 flex items-center px-4 shrink-0 justify-between bg-fastcord-panel z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Volume2 className="w-5 h-5 text-emerald-400" />
          <span className="max-w-64 truncate font-bold text-slate-200">{channelName}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isStageVisible && <button type="button" onClick={onReturn} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Ses odasına dön" title="Ses odasına dön"><Expand className="h-4 w-4" /></button>}
          {isStageVisible && <button type="button" aria-pressed={showVoiceChat} onClick={() => setShowVoiceChat((value) => !value)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${showVoiceChat ? 'border-violet-300/20 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'}`}><MessageSquare className="h-4 w-4" /> Sesli sohbet</button>}
          <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-1 text-sm font-medium text-slate-400">
            Canlı ses
          </div>
        </div>
      </div>}
      {!isStageVisible && !isDockExpanded && (
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-300/15 bg-emerald-400/10 text-emerald-300"><Headphones className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="max-w-28 truncate text-xs font-bold text-white">{channelName}</p>
            <p className="flex items-center gap-1 text-[9px] text-emerald-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Canlı</p>
          </div>
          <button type="button" onClick={onReturn} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Ses odasına dön" title="Ses odasına dön"><Expand className="h-4 w-4" /></button>
        </div>
      )}
      <div className={isStageVisible ? 'relative min-h-0 flex-1' : 'contents'}>
        {isStageVisible && deviceWarning && <p role="status" className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-amber-300/20 bg-amber-950/80 px-4 py-2 text-xs text-amber-100">{deviceWarning}</p>}
        <VoiceRoomErrorBoundary onRetry={() => setAttempt((value) => value + 1)}>
        <LiveKitRoom
          key={`${channelId}:${attempt}`}
          video={false}
          audio={getAudioCaptureOptions(voiceAudioSettings)}
          options={{ publishDefaults: getAudioPublishOptions(voiceAudioSettings), webAudioMix: true, adaptiveStream: true, dynacast: true }}
          connect
          token={token}
          serverUrl={liveKitUrl}
          data-lk-theme="default"
          style={{ height: isStageVisible || isDockExpanded ? '100%' : 'auto' }}
          onConnected={handleLiveKitConnected}
          onDisconnected={handleLiveKitDisconnected}
          onMediaDeviceFailure={handleMediaDeviceFailure}
          onError={handleLiveKitError}
        >
          <div className={`flex min-h-0 flex-col ${isStageVisible || isDockExpanded ? 'h-full' : ''}`}>
            <div className={isStageVisible || isDockExpanded ? 'flex min-h-0 flex-1' : 'pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0'}>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4"><VoiceParticipants serverId={serverId} channelId={channelId} localDeafened={localDeafened} outputVolume={voiceAudioSettings.outputVolume} onPresenceError={onPresenceError} onParticipantsChange={onParticipantsChange} contextMenuRequest={contextMenuRequest} onContextMenuRequestHandled={onContextMenuRequestHandled} /></div>
              {isStageVisible && showVoiceChat && <aside aria-label="Ses kanalı metin sohbeti" className="w-[min(360px,45%)] min-w-[280px] shrink-0 border-l border-white/[0.07] bg-[#0d1119]"><ChatArea activeChannelId={channelId} channelName={`${channelName} sohbeti`} /></aside>}
            </div>
            <VoiceControls onLeave={onLeave} onDeafenedChange={setLocalDeafened} compact={!isStageVisible} expanded={isDockExpanded} onToggleExpand={() => setIsDockExpanded((value) => !value)} />
          </div>
        </LiveKitRoom>
        </VoiceRoomErrorBoundary>
      </div>
    </div>
  );
}
