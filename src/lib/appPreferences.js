import { normalizeVoiceVolume } from './voicePlayback.js';
import { DEFAULT_VOICE_AUDIO_SETTINGS } from './voiceAudio.js';
import { getColorTheme, themeVariables } from './colorThemes.js';

const preferenceKey = (userId) => `fastcord:preferences:${encodeURIComponent(userId || '')}`;
const preferenceCache = new WeakMap();
const defaults = { launchAtStartup: true, pushToTalkEnabled: false, keybinds: { toggleMicrophone: 'Ctrl+Alt+KeyM', toggleDeafen: 'Ctrl+Alt+KeyD', pushToTalk: 'KeyV' }, doNotDisturb: false, desktopNotifications: true, notificationSound: true, notificationSoundVolume: 65, soundEffects: true, uiSoundVolume: 65, microphoneToggleSoundVolume: 55, headphoneToggleSoundVolume: 55, pinnedDMIds: [], hiddenDMIds: [], reduceMotion: false, accentTheme: 'violet', colorTheme: 'original', chatDensity: 'comfortable', searchShortcut: 'ctrl+k', mutedUserIds: [], mutedServerIds: [], mutedChannelIds: [], serverMuteUntil: {}, serverNotificationModes: {}, serverFolders: [], collapsedServerFolderIds: [], featuredServerIds: [], featuredServersConfigured: false, serverFolderIds: {}, voiceAudioSettings: DEFAULT_VOICE_AUDIO_SETTINGS, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00' };
const accentPalettes = {
  violet: ['#e0e7ff', '#dbe2ff', '#becaff', '#9baaff', '#7185ff', '#5e71e8', '#4d5bd4', '#3730a3', '#312e81'],
  cyan: ['#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'],
  emerald: ['#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#10b981', '#059669', '#047857', '#065f46', '#064e3b'],
  rose: ['#fff1f2', '#ffe4e6', '#fecdd3', '#fda4af', '#f43f5e', '#e11d48', '#be123c', '#9f1239', '#881337'],
};

export function applyAppPreferences(preferences = defaults) {
  if (!globalThis.document?.documentElement) return;
  const root = document.documentElement;
  const theme = getColorTheme(preferences.colorTheme);
  root.dataset.colorTheme = theme.id;
  Object.entries(themeVariables(theme.id)).forEach(([name, value]) => root.style.setProperty(name, value));
  const palette = accentPalettes[preferences.accentTheme] || accentPalettes.violet;
  if (preferences.accentTheme !== 'auto' || theme.id === 'original') {
    ['100', '200', '300', '400', '500', '600', '700', '800', '900'].forEach((shade, index) => root.style.setProperty(`--color-violet-${shade}`, palette[index]));
    root.style.setProperty('--theme-accent', palette[4]);
    root.style.setProperty('--color-fastcord-violet', palette[4]);
    root.style.setProperty('--theme-button-text', themeVariables(theme.id, palette[4])['--theme-button-text']);
  }
  root.classList.toggle('reduce-motion', Boolean(preferences.reduceMotion));
  root.classList.toggle('compact-chat', preferences.chatDensity === 'compact');
}

export function getAppPreferences(userId, storage = globalThis.localStorage) {
  if (!userId) return defaults;
  try {
    const raw = storage.getItem(preferenceKey(userId)) || '{}';
    let cache = preferenceCache.get(storage);
    if (!cache) { cache = new Map(); preferenceCache.set(storage, cache); }
    const cached = cache.get(userId);
    if (cached?.raw === raw) return cached.preferences;
    const saved = JSON.parse(raw);
    const preferences = {
      ...defaults,
      ...saved,
      keybinds: {
        ...defaults.keybinds,
        ...(saved.keybinds && typeof saved.keybinds === 'object' && !Array.isArray(saved.keybinds) ? saved.keybinds : {}),
        toggleMicrophone: saved.keybinds?.toggleMicrophone === 'Ctrl+Shift+KeyM' ? defaults.keybinds.toggleMicrophone : (saved.keybinds?.toggleMicrophone || defaults.keybinds.toggleMicrophone),
        toggleDeafen: saved.keybinds?.toggleDeafen === 'Ctrl+Shift+KeyD' ? defaults.keybinds.toggleDeafen : (saved.keybinds?.toggleDeafen || defaults.keybinds.toggleDeafen),
      },
      mutedUserIds: Array.isArray(saved.mutedUserIds) ? saved.mutedUserIds : [],
      mutedServerIds: Array.isArray(saved.mutedServerIds) ? saved.mutedServerIds : [],
      mutedChannelIds: Array.isArray(saved.mutedChannelIds) ? saved.mutedChannelIds : [],
      pinnedDMIds: Array.isArray(saved.pinnedDMIds) ? saved.pinnedDMIds : [],
      hiddenDMIds: Array.isArray(saved.hiddenDMIds) ? saved.hiddenDMIds : [],
      voiceParticipantVolumes: saved.voiceParticipantVolumes && typeof saved.voiceParticipantVolumes === 'object' && !Array.isArray(saved.voiceParticipantVolumes)
        ? Object.fromEntries(Object.entries(saved.voiceParticipantVolumes).map(([id, volume]) => [id, normalizeVoiceVolume(volume)])) : {},
      voiceScreenShareMuted: saved.voiceScreenShareMuted && typeof saved.voiceScreenShareMuted === 'object' && !Array.isArray(saved.voiceScreenShareMuted)
        ? Object.fromEntries(Object.entries(saved.voiceScreenShareMuted).map(([id, muted]) => [id, muted === true])) : {},
      voiceScreenShareVolumes: saved.voiceScreenShareVolumes && typeof saved.voiceScreenShareVolumes === 'object' && !Array.isArray(saved.voiceScreenShareVolumes)
        ? Object.fromEntries(Object.entries(saved.voiceScreenShareVolumes).map(([id, volume]) => [id, normalizeVoiceVolume(volume)])) : {},
      uiSoundVolume: Number.isFinite(Number(saved.uiSoundVolume)) ? Math.min(100, Math.max(0, Number(saved.uiSoundVolume))) : defaults.uiSoundVolume,
      microphoneToggleSoundVolume: Number.isFinite(Number(saved.microphoneToggleSoundVolume)) ? Math.min(100, Math.max(0, Number(saved.microphoneToggleSoundVolume))) : defaults.microphoneToggleSoundVolume,
      headphoneToggleSoundVolume: Number.isFinite(Number(saved.headphoneToggleSoundVolume)) ? Math.min(100, Math.max(0, Number(saved.headphoneToggleSoundVolume))) : defaults.headphoneToggleSoundVolume,
      serverMuteUntil: saved.serverMuteUntil && typeof saved.serverMuteUntil === 'object' ? saved.serverMuteUntil : {},
      serverNotificationModes: saved.serverNotificationModes && typeof saved.serverNotificationModes === 'object' ? saved.serverNotificationModes : {},
      serverFolders: Array.isArray(saved.serverFolders) ? saved.serverFolders : [],
      collapsedServerFolderIds: Array.isArray(saved.collapsedServerFolderIds) ? saved.collapsedServerFolderIds : [],
      featuredServerIds: Array.isArray(saved.featuredServerIds) ? saved.featuredServerIds : [],
      serverFolderIds: saved.serverFolderIds && typeof saved.serverFolderIds === 'object' ? saved.serverFolderIds : {},
      voiceAudioSettings: (() => {
        const settings = saved.voiceAudioSettings && typeof saved.voiceAudioSettings === 'object' ? saved.voiceAudioSettings : {};
        const threshold = Number(settings.inputSensitivityDb ?? -100);
        return {
          ...defaults.voiceAudioSettings,
          ...settings,
          audioQuality: settings.audioQualityVersion === 2 && settings.audioQuality === 'speech' ? 'speech' : 'high',
          audioQualityVersion: 2,
          autoGainControl: true,
          inputSensitivityEnabled: settings.inputSensitivityEnabled === true,
          inputSensitivityDb: Number.isFinite(threshold) ? Math.min(0, Math.max(-100, threshold)) : -100,
          inputVolume: Number.isFinite(Number(settings.inputVolume)) ? Math.min(200, Math.max(0, Number(settings.inputVolume))) : 100,
          outputVolume: Number.isFinite(Number(settings.outputVolume)) ? Math.min(200, Math.max(0, Number(settings.outputVolume))) : 100,
        };
      })(),
    };
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    cache.set(userId, { raw, preferences });
    return preferences;
  }
  catch { return defaults; }
}

export function isNotificationLocationMuted(notification, preferences = defaults) {
  const serverId = notification?.server_id;
  if (serverId && preferences.mutedServerIds?.includes(serverId)) return true;
  if (serverId && Number(preferences.serverMuteUntil?.[serverId]) > Date.now()) return true;
  const mode = getServerNotificationMode(serverId, preferences);
  if (serverId && mode === 'none') return true;
  if (serverId && mode === 'mentions' && !isMentionNotification(notification)) return true;
  return Boolean(notification?.channel_id && preferences.mutedChannelIds?.includes(notification.channel_id));
}

export function getServerNotificationMode(serverId, preferences = defaults) {
  const mode = serverId ? preferences.serverNotificationModes?.[serverId] : null;
  return ['all', 'mentions', 'none'].includes(mode) ? mode : 'all';
}

export function isMentionNotification(notification) {
  return Boolean(notification?.is_mention || /mention|etiket/iu.test(notification?.type || '') || /^@(everyone|here)(?:\s|$)/iu.test(notification?.title || ''));
}

export function isQuietHoursActive(preferences = defaults, date = new Date()) {
  if (!preferences.quietHoursEnabled) return false;
  const toMinutes = (time) => {
    const match = /^(\d{2}):(\d{2})$/u.exec(time || '');
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = toMinutes(preferences.quietHoursStart);
  const end = toMinutes(preferences.quietHoursEnd);
  if (start === null || end === null) return false;
  if (start === end) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export function shouldSuppressNotification(notification, preferences = defaults, { presenceIsDnd = false, date = new Date() } = {}) {
  return Boolean(
    preferences.doNotDisturb
    || presenceIsDnd
    || isNotificationLocationMuted(notification, preferences)
    || (notification?.sender_id && preferences.mutedUserIds?.includes(notification.sender_id))
    || isQuietHoursActive(preferences, date),
  );
}

export function saveAppPreferences(userId, preferences, storage = globalThis.localStorage) {
  if (!userId) return;
  try {
    storage.setItem(preferenceKey(userId), JSON.stringify({ ...defaults, ...preferences }));
    applyAppPreferences({ ...defaults, ...preferences });
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fastcord:preferences-updated', { detail: { userId } }));
  } catch { /* Preferences are optional when local storage is unavailable. */ }
}
