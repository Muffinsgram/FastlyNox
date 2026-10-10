import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Bell, Headphones, Mic, Keyboard, Pencil, ShieldCheck, UserRound, X, Accessibility, Volume2, Crown, Settings2, Palette, MessageSquareText, LockKeyhole, Play, Gamepad2, Music2 } from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';
import { supabase } from '../../../lib/supabase';
import { getAvatarUrl, getBannerUrl, removeProfileImage } from '../../../lib/profileMedia';
import { BannerEditorModal } from './BannerEditorModal';
import { AvatarEditorModal } from './AvatarEditorModal';
import { getAppPreferences, saveAppPreferences } from '../../../lib/appPreferences';
import { FastlynoxPlusPanel } from './FastlynoxPlusPanel';
import { FastlynoxAdminPanel } from './FastlynoxAdminPanel';
import { ConnectionsSettingsPanel } from './ConnectionsSettingsPanel';
import { PrivacySettingsPanel } from './PrivacySettingsPanel';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';
import { ServerNotificationSettings } from './ServerNotificationSettings';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { useEscapeClose } from '../../../hooks/useEscapeClose';
import { playUiSound } from '../../../lib/uiSounds';

const DEFAULT_KEYBINDS = { toggleMicrophone: 'Ctrl+Alt+KeyM', toggleDeafen: 'Ctrl+Alt+KeyD', pushToTalk: 'KeyV' };

function formatKeybind(binding) {
  if (!binding) return 'Atanmamış';
  return binding.split('+').map(part => ({ AltRight: 'Sağ Alt', AltGraph: 'Sağ Alt', CtrlRight: 'Sağ Ctrl', Fn: 'Fn', Mouse4: 'Fare 4', Mouse5: 'Fare 5' }[part] || (part.startsWith('Key') ? part.slice(3) : part.startsWith('Digit') ? part.slice(5) : part))).join(' + ');
}

function KeybindSettingsPanel({ value, onChange, pushToTalkEnabled, onPushToTalkChange, launchAtStartup, onLaunchAtStartupChange }) {
  const [recording, setRecording] = useState('');
  const [notice, setNotice] = useState('');
  const [launchError, setLaunchError] = useState('');
  const [launchCheck, setLaunchCheck] = useState('');
  const bindings = useMemo(() => ({ ...DEFAULT_KEYBINDS, ...value }), [value]);
  useEffect(() => { if (!window.fastlynoxDesktop?.setAutoStart) return; void window.fastlynoxDesktop.setAutoStart(launchAtStartup !== false).then(ok => setLaunchError(ok ? '' : 'Otomatik başlatma ayarı uygulanamadı.')).catch(() => setLaunchError('Otomatik başlatma ayarı uygulanamadı.')); }, [launchAtStartup]);
  useEffect(() => {
    if (!recording) return undefined;
    let rightAltHeld = false;
    let rightAltUsedAsModifier = false;
    let rightCtrlHeld = false;
    let rightCtrlUsedAsModifier = false;
    const capture = event => {
      if (event.code === 'ControlRight' && event.type === 'keyup') {
        event.preventDefault(); event.stopPropagation();
        rightCtrlHeld = false;
        if (!rightCtrlUsedAsModifier) {
          const conflict = Object.entries(bindings).find(([key, binding]) => key !== recording && binding === 'CtrlRight');
          if (conflict) setNotice('Bu tuş başka bir işlemde kullanılıyor.');
          else { onChange({ ...bindings, [recording]: 'CtrlRight' }); setRecording(''); setNotice('Tuş ataması kaydedildi.'); }
        }
        return;
      }
      if (event.code === 'AltRight' && event.type === 'keyup') {
        event.preventDefault(); event.stopPropagation();
        rightAltHeld = false;
        if (!rightAltUsedAsModifier) {
          const conflict = Object.entries(bindings).find(([key, binding]) => key !== recording && binding === 'AltRight');
          if (conflict) setNotice('Bu tuş başka bir işlemde kullanılıyor.');
          else { onChange({ ...bindings, [recording]: 'AltRight' }); setRecording(''); setNotice('Tuş ataması kaydedildi.'); }
        }
        return;
      }
      if (event.code === 'AltRight') rightAltHeld = true;
      if (event.code === 'ControlRight') rightCtrlHeld = event.type === 'keydown';
      if (event.type === 'keyup') return;
      if (event.type === 'keydown') {
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Escape') { setRecording(''); return; }
        if (event.code === 'AltRight') { rightAltUsedAsModifier = false; return; }
        if (event.code === 'ControlRight') { rightCtrlUsedAsModifier = false; return; }
        if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(event.key) && event.code !== 'ControlRight') return;
        if (rightAltHeld || event.getModifierState?.('AltGraph')) rightAltUsedAsModifier = true;
        if (rightCtrlHeld) rightCtrlUsedAsModifier = true;
        const altGraph = event.getModifierState?.('AltGraph');
        const baseKey = event.code === 'ControlRight' ? 'CtrlRight' : event.code === 'Fn' || event.key === 'Fn' ? 'Fn' : event.code;
        const chord = [(rightCtrlHeld && event.code !== 'ControlRight') ? 'CtrlRight' : event.ctrlKey && !altGraph && event.code !== 'ControlRight' && 'Ctrl', event.code === 'ControlRight' && 'CtrlRight', (rightAltHeld || altGraph) ? 'AltRight' : event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', baseKey].filter(Boolean).join('+');
        const conflict = Object.entries(bindings).find(([key, binding]) => key !== recording && binding === chord);
        if (conflict) { setNotice('Bu tuş başka bir işlemde kullanılıyor.'); return; }
        onChange({ ...bindings, [recording]: chord }); setRecording(''); setNotice('Tuş ataması kaydedildi.');
      }
    };
    const captureMouse = event => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault(); event.stopPropagation();
      const chord = event.button === 3 ? 'Mouse4' : 'Mouse5';
      const conflict = Object.entries(bindings).find(([key, binding]) => key !== recording && binding === chord);
      if (conflict) { setNotice('Bu tuş başka bir işlemde kullanılıyor.'); return; }
      onChange({ ...bindings, [recording]: chord }); setRecording(''); setNotice('Fare tuşu ataması kaydedildi.');
    };
    window.addEventListener('keydown', capture, true);
    window.addEventListener('keyup', capture, true);
    window.addEventListener('mousedown', captureMouse, true);
    return () => { window.removeEventListener('keydown', capture, true); window.removeEventListener('keyup', capture, true); window.removeEventListener('mousedown', captureMouse, true); };
  }, [recording, onChange, bindings]);
  const rows = [
    ['toggleMicrophone', 'Mikrofonu aç / kapat', 'Ses odasındayken mikrofon durumunu değiştir.'],
    ['toggleDeafen', 'Kulaklığı aç / kapat', 'Gelen sesleri ve mikrofonu kapatıp aç.'],
    ['pushToTalk', 'Bas-konuş', 'Tuşa basılıyken konuş; bırakınca mikrofonu eski durumuna döndür.'],
  ];
  const resetBindings = () => { onChange({ ...DEFAULT_KEYBINDS }); setNotice('Kısayollar varsayılan değerlere döndürüldü.'); };
  const checkAutoStart = async () => {
    const desktop = window.fastlynoxDesktop;
    if (!desktop?.getAutoStart) { setLaunchCheck('Bu kontrol yalnızca masaüstü uygulamasında kullanılabilir.'); return; }
    setLaunchCheck('Kontrol ediliyor…');
    try {
      const enabled = await desktop.getAutoStart();
      if (enabled) { setLaunchError(''); setLaunchCheck('Otomatik başlatma etkin.'); }
      else {
        const applied = await desktop.setAutoStart?.(launchAtStartup !== false);
        setLaunchCheck(applied ? 'Ayar yeniden uygulandı.' : 'Otomatik başlatma kapalı. Windows başlangıç uygulamalarını kontrol et.');
      }
    } catch { setLaunchCheck('Durum okunamadı. Uygulamayı yeniden başlatıp tekrar dene.'); }
  };
  return <section className="max-w-2xl space-y-3">
    <div className="rounded-2xl border border-violet-200/10 bg-violet-300/[0.04] p-4 text-xs leading-5 text-slate-300">Bir atamaya tıkla, ardından tuş bileşimini bas. Sağ Ctrl, Sağ Alt, tarayıcının algıladığı Fn ve yan fare tuşları (Fare 4/5) da atanabilir. Bazı klavyelerde Fn tuşu işletim sistemi tarafından uygulamaya iletilmez. Kurulu masaüstü uygulamasında mikrofon ve kulaklık kısayolları ses odasındayken arka planda da çalışır. <kbd className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5">Esc</kbd> ile vazgeçebilirsin.</div>
    <PreferenceRow icon={<Mic className="h-4 w-4" />} title="Bas-konuş modu" description="Mikrofon, atadığın tuşa basılı tuttuğun sürece açılır." checked={Boolean(pushToTalkEnabled)} onChange={onPushToTalkChange} />
    {rows.map(([key, title, description]) => <div key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><span><span className="block text-sm font-semibold text-white">{title}</span><span className="mt-1 block text-xs text-slate-400">{description}</span></span><button type="button" onClick={() => { setNotice(''); setRecording(key); }} className={`min-w-36 rounded-xl border px-3 py-2 text-xs font-semibold transition ${recording === key ? 'border-violet-200/30 bg-violet-300/15 text-violet-100 animate-pulse' : 'border-white/10 bg-white/[0.05] text-slate-200 hover:bg-white/10'}`}>{recording === key ? 'Tuş veya fare tuşu…' : formatKeybind(bindings[key])}</button></div>)}
    <div className="flex justify-end"><button type="button" onClick={resetBindings} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]">Kısayolları varsayılana döndür</button></div>
    <PreferenceRow icon={<Settings2 className="h-4 w-4" />} title="Bilgisayar açılınca başlat" description="Fastlynox Windows oturum açılışında çalışır." checked={launchAtStartup !== false} onChange={onLaunchAtStartupChange} />
    {launchError && <p role="status" className="px-2 text-xs text-rose-200">{launchError}</p>}
    {window.fastlynoxDesktop && <div className="flex items-center justify-between gap-3 px-2"><span role="status" className="text-xs text-slate-400">{launchCheck}</span><button type="button" onClick={() => void checkAutoStart()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.06]">Başlangıcı denetle</button></div>}
    {notice && <p role="status" className="px-2 text-xs text-violet-200">{notice}</p>}
    {!window.fastlynoxDesktop && <p className="px-2 text-[10px] text-slate-500">Masaüstü otomatik başlatma yalnızca kurulu uygulamada kullanılabilir.</p>}
  </section>;
}

export function UserSettingsModal({ onClose }) {
  const { user, session, signOut, refreshProfile } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [statusText, setStatusText] = useState(user?.status_text || '');
  const [statusDuration, setStatusDuration] = useState('never');
  const [avatarUrl, setAvatarUrl] = useState(getAvatarUrl(user?.avatar_url, user?.username));
  const [bannerUrl, setBannerUrl] = useState(getBannerUrl(user?.banner_url));
  const [bannerPositionX, setBannerPositionX] = useState(user?.banner_position_x ?? 50);
  const [bannerPositionY, setBannerPositionY] = useState(user?.banner_position_y ?? 50);
  const [bannerZoom, setBannerZoom] = useState(user?.banner_zoom ?? 1);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [bannerChanged, setBannerChanged] = useState(false);
  const [isBannerEditorOpen, setIsBannerEditorOpen] = useState(false);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  useEscapeClose(onClose, !isAvatarEditorOpen && !isBannerEditorOpen);
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [preferences, setPreferences] = useState(() => getAppPreferences(user?.id));
  const [notificationPermission, setNotificationPermission] = useState(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const refreshNotificationCounts = useNotificationStore((state) => state.fetchNotifications);
  useEffect(() => {
    let active = true;
    void window.fastlynoxDesktop?.getAutoStart?.().then(enabled => {
      if (!active || typeof enabled !== 'boolean') return;
      setPreferences(current => ({ ...current, launchAtStartup: enabled }));
      const stored = getAppPreferences(user?.id);
      saveAppPreferences(user?.id, { ...stored, launchAtStartup: enabled });
    }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);
  const enableDesktopNotifications = async () => {
    if (typeof Notification === 'undefined') { setNotificationPermission('unsupported'); return; }
    try { setNotificationPermission(await Notification.requestPermission()); }
    catch { setNotificationPermission(Notification.permission); }
  };
  const sendTestDesktopNotification = () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try { new Notification('Fastlynox', { body: 'Masaüstü bildirimleri hazır.' }); }
    catch { /* Native notifications may be blocked by the operating system. */ }
  };

  const updatePreference = (name, value) => {
    const next = { ...preferences, [name]: value };
    setPreferences(next);
    saveAppPreferences(user?.id, next);
    if (['mutedServerIds', 'mutedChannelIds'].includes(name)) void refreshNotificationCounts();
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const displayName = username.trim();
    if (!displayName || displayName.length > 32) { setProfileMessage('İsim 1–32 karakter arasında olmalı.'); return; }
    if (bio.length > 190) { setProfileMessage('Hakkımda alanı 190 karakteri geçemez.'); return; }
    setIsSaving(true);
    setProfileMessage('');
    try {
      const { error } = await supabase.from('profiles').update({
        username: displayName,
        avatar_url: avatarChanged ? avatarUrl : user.avatar_url,
        banner_url: bannerChanged ? bannerUrl : (user.banner_url || null),
        banner_position_x: bannerPositionX,
        banner_position_y: bannerPositionY,
        banner_zoom: bannerZoom,
        bio: bio.trim(),
        status_text: statusText.trim().slice(0, 80),
        status_expires_at: statusText.trim() && statusDuration !== 'never' ? new Date(Date.now() + Number(statusDuration) * 60 * 60 * 1000).toISOString() : null,
      }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      if (avatarChanged) await removeProfileImage(user.avatar_url);
      if (bannerChanged) await removeProfileImage(user.banner_url);
      setAvatarChanged(false);
      setBannerChanged(false);
      setProfileMessage('Profilin güncellendi.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Profil kaydedilemedi. Veritabanı profil migration’ını çalıştır.');
    } finally { setIsSaving(false); }
  };

  const handleUpdatePassword = async (event) => {
    event.preventDefault(); setAccountMessage('');
    try { const { error } = await supabase.auth.updateUser({ password: newPassword }); if (error) throw error; setNewPassword(''); setAccountMessage('Parola güncellendi.'); }
    catch (error) { setAccountMessage(error instanceof Error ? error.message : 'Parola güncellenemedi.'); }
  };
  const handleUpdateEmail = async (event) => {
    event.preventDefault(); if (!newEmail.trim()) return; setAccountMessage('');
    try { const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }); if (error) throw error; setNewEmail(''); setAccountMessage('E-posta değişikliğini onaylamak için gelen kutunu kontrol et.'); }
    catch (error) { setAccountMessage(error instanceof Error ? error.message : 'E-posta güncellenemedi.'); }
  };
  const handleSignOut = async () => {
    try { await signOut(); onClose(); } catch (error) { setAccountMessage(error instanceof Error ? error.message : 'Çıkış yapılamadı.'); }
  };
  const memberSince = session?.user?.created_at ? new Date(session.user.created_at).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : null;
  const isPlatformStaff = session?.user?.app_metadata?.platform_staff === true || session?.user?.app_metadata?.platform_staff === 'true';
  const settingTabs = [
    ['profile', 'Profil', <UserRound key="profile-icon" className="h-4 w-4" />],
    ['account', 'Güvenlik', <ShieldCheck key="security-icon" className="h-4 w-4" />],
    ['preferences', 'Tercihler', <Accessibility key="preferences-icon" className="h-4 w-4" />],
    ['connections', 'Bağlantılar', <Music2 key="connections-icon" className="h-4 w-4" />],
    ['activity', 'Etkinlik', <Music2 key="activity-icon" className="h-4 w-4" />],
    ['sound', 'Ses', <AudioLines key="sound-icon" className="h-4 w-4" />],
    ['keybinds', 'Tuş atamaları', <Keyboard key="keybinds-icon" className="h-4 w-4" />],
    ['privacy', 'Gizlilik', <LockKeyhole key="privacy-icon" className="h-4 w-4" />],
    ['plus', 'Fastlynox Plus', <Crown key="plus-icon" className="h-4 w-4" />],
    ...(isPlatformStaff ? [['admin', 'Yönetim', <Settings2 key="admin-icon" className="h-4 w-4" />]] : []),
  ];
  const tabTitle = { profile: 'Profilini kişiselleştir', account: 'Hesap güvenliği', preferences: 'Bildirim ve görünüm', connections: 'Hesap bağlantıların', activity: 'Oyun etkinliği', sound: 'Ses ayarları', keybinds: 'Tuş atamaları', privacy: 'Gizlilik ve güvenlik', plus: 'Fastlynox Plus', admin: 'Platform yönetimi' }[activeTab];
  const tabDescription = { profile: 'Profil fotoğrafını, banner’ını ve kendini nasıl tanıttığını düzenle.', account: 'E-posta adresini ve parolanı yönet.', preferences: 'Bildirim yoğunluğunu ve animasyonları kendine göre ayarla.', connections: 'Spotify, Steam, YouTube ve Instagram profil bağlantılarını yönet.', activity: 'Oynadığın oyunları profilde göster veya gizle.', sound: 'Mikrofonunu, ses çıkışını ve uygulama seslerini yönet.', keybinds: 'Mikrofon, kulaklık ve bas-konuş kontrollerine kısayol ata.', privacy: 'DM izinlerini, görünürlüğünü ve engellediğin hesapları yönet.', plus: 'Planını, özelliklerini ve yükleme sınırlarını görüntüle.', admin: 'Kullanıcıları, rozetleri, planları ve yükleme sınırlarını yönet.' }[activeTab];

  return (
    <div className="fixed inset-0 z-[200] flex animate-in fade-in duration-200 bg-[#070a10]/80 p-3 backdrop-blur-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="relative mx-auto flex h-full w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-[#10151f]/95 shadow-[0_30px_120px_rgba(0,0,0,.6)]">
        <aside className="hidden w-60 shrink-0 border-r border-white/[0.07] bg-white/[0.025] p-5 pt-8 sm:block">
          <p className="mb-5 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Hesap merkezi</p>
          {settingTabs.map(([key, label, icon]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${activeTab === key ? 'bg-violet-400/10 text-violet-100' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{icon}{label}</button>)}
          <div className="mt-6 border-t border-white/[0.07] pt-4"><button type="button" onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-400/10">Çıkış yap</button></div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-8 lg:p-10">
          <button type="button" aria-label="Ayarları kapat" onClick={onClose} className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/20 text-slate-400 hover:bg-white/10 hover:text-white sm:right-6 sm:top-6"><X className="h-4 w-4" /></button>
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1 sm:hidden">{settingTabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs ${activeTab === key ? 'bg-violet-400/15 text-violet-100' : 'bg-white/5 text-white'}`}>{label}</button>)}</div>
          <header className="mb-7 pr-12"><p className="mb-1 text-xs font-semibold uppercase tracking-[.2em] text-violet-300">Fastlynox • Ayarlar</p><h1 id="settings-title" className="text-2xl font-bold text-white">{tabTitle}</h1><p className="mt-2 text-sm text-slate-400">{tabDescription}</p></header>
          {activeTab === 'profile' ? (
            <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <div><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Profil fotoğrafı</label><button type="button" disabled={isSaving} onClick={() => setIsAvatarEditorOpen(true)} className="group relative block h-28 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition hover:border-violet-300/40 disabled:opacity-50"><img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-black/35"><span className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs font-semibold text-white backdrop-blur"><Pencil className="h-4 w-4" /> Fotoğrafı düzenle</span></span></button><p className="mt-1.5 text-xs text-slate-500">Yüklemeden önce yakınlaştır ve kadrajı ayarla</p></div>
                  <div><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Profil banner’ı</label><button type="button" disabled={isSaving} onClick={() => setIsBannerEditorOpen(true)} className="group relative block h-28 w-full overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,.35),transparent_60%),linear-gradient(120deg,#151b28,#10141e)] text-left transition hover:border-violet-300/40 disabled:opacity-50">{bannerUrl && <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${bannerPositionX}% ${bannerPositionY}%`, transform: `scale(${bannerZoom})`, transformOrigin: `${bannerPositionX}% ${bannerPositionY}%` }} />}<span className="absolute inset-0 grid place-items-center bg-black/30"><span className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs font-semibold text-white backdrop-blur"><Pencil className="h-4 w-4" /> Bannerı düzenle</span></span></button><p className="mt-1.5 text-xs text-slate-500">GIF animasyonu korunur · sürükle, yakınlaştır ve kadrajla</p></div>
                </div>
                <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Görünen ad</span><input type="text" maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-violet-300/50" placeholder="Adın" /></label>
                <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Hakkımda</span><textarea maxLength={190} rows={4} value={bio} onChange={(event) => setBio(event.target.value)} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-violet-300/50" placeholder="Kendinden biraz bahset…" /><span className="mt-1 block text-right text-[11px] text-slate-500">{bio.length}/190</span></label>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Durum mesajı</label><div className="flex flex-col gap-2 sm:flex-row"><input maxLength={80} value={statusText} onChange={(event) => setStatusText(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-300/50" placeholder="Ne yapıyorsun?" /><AnimatedSelect ariaLabel="Durum mesajı süresi" value={statusDuration} onValueChange={setStatusDuration} options={[{ value: 'never', label: 'Süresiz' }, { value: '1', label: '1 saat' }, { value: '4', label: '4 saat' }, { value: '24', label: '24 saat' }]} className="sm:min-w-32" /></div><p className="mt-1.5 text-[10px] text-slate-500">Durumun profilinde görünür. Boş bırakıp kaydedersen kaldırılır.</p></div>
                <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.07] pt-5"><button type="button" onClick={handleSaveProfile} disabled={isSaving} className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:opacity-50">{isSaving ? 'Kaydediliyor…' : 'Profili kaydet'}</button>{profileMessage && <p role="status" className={`text-sm ${/yüklendi|güncellendi|ayarlandı/i.test(profileMessage) ? 'text-emerald-300' : 'text-rose-300'}`}>{profileMessage}</p>}</div>
              </section>
              <section className="h-fit overflow-hidden rounded-2xl border border-white/10 bg-[#0c111a] shadow-xl">
                <div className="relative h-28 overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,.4),transparent_60%),linear-gradient(120deg,#151b28,#10141e)]">{bannerUrl && <img src={bannerUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${bannerPositionX}% ${bannerPositionY}%`, transform: `scale(${bannerZoom})`, transformOrigin: `${bannerPositionX}% ${bannerPositionY}%` }} />}</div>
                <div className="relative px-4 pb-4"><img src={avatarUrl} alt="Profil fotoğrafı önizlemesi" className="-mt-10 h-20 w-20 rounded-2xl border-4 border-[#0c111a] bg-slate-800 object-cover shadow-lg" /><div className="mt-3"><h2 className="truncate text-lg font-bold text-white">{username || 'Adın'}</h2><p className="truncate text-xs text-slate-500">{user?.email}</p>{statusText.trim() && <p className="mt-2 inline-flex max-w-full items-center rounded-full border border-violet-200/10 bg-violet-300/[0.06] px-2.5 py-1 text-[10px] text-violet-100">{statusText}</p>}{bio && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">{bio}</p>}</div><div className="mt-4 border-t border-white/[0.07] pt-3 text-[11px] text-slate-500">{memberSince ? `Fastlynox üyesi • ${memberSince}` : 'Fastlynox profili'}</div></div>
              </section>
            </div>
          ) : activeTab === 'account' ? (
            <div className="max-w-xl space-y-7 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
              <section><h2 className="font-semibold text-white">E-posta adresi</h2><p className="mt-1 text-sm text-slate-400">Mevcut adres: {user?.email || 'Bilinmiyor'}</p><form onSubmit={handleUpdateEmail} className="mt-3 flex gap-2"><input type="email" autoComplete="email" aria-label="Yeni e-posta adresi" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-300/50" placeholder="Yeni e-posta adresi" required /><button type="submit" className="rounded-xl bg-white/10 px-4 text-sm text-white hover:bg-white/15">Güncelle</button></form></section>
              <section className="border-t border-white/[0.07] pt-6"><h2 className="font-semibold text-white">Parola</h2><form onSubmit={handleUpdatePassword} className="mt-3 flex gap-2"><input type="password" autoComplete="new-password" aria-label="Yeni parola" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-300/50" placeholder="En az 6 karakter" required /><button type="submit" className="rounded-xl bg-white/10 px-4 text-sm text-white hover:bg-white/15">Güncelle</button></form></section>
              {accountMessage && <p role="status" className="text-sm text-slate-300">{accountMessage}</p>}
            </div>
          ) : activeTab === 'preferences' ? (
            <section className="max-w-2xl space-y-3">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/[0.08] text-violet-200"><Palette className="h-4 w-4" /></span><span><span className="block text-sm font-semibold text-white">Vurgu rengi</span><span className="mt-1 block text-xs text-slate-400">Buton ve seçili alanların rengini kişiselleştir.</span></span></div>
                <div className="mt-4 flex flex-wrap gap-2">{[['violet', 'Mor', '#9baaff'], ['cyan', 'Turkuaz', '#67e8f9'], ['emerald', 'Zümrüt', '#6ee7b7'], ['rose', 'Gül', '#fda4af']].map(([id, label, color]) => <button key={id} type="button" aria-pressed={preferences.accentTheme === id} onClick={() => updatePreference('accentTheme', id)} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${preferences.accentTheme === id ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/[0.07] text-slate-400 hover:bg-white/[0.04]'}`}><span className="h-3 w-3 rounded-full ring-2 ring-black/20" style={{ backgroundColor: color }} />{label}{preferences.accentTheme === id && <span className="text-[10px] text-emerald-200">Seçili</span>}</button>)}</div>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/[0.08] text-violet-200"><MessageSquareText className="h-4 w-4" /></span><span><span className="block text-sm font-semibold text-white">Mesaj aralığı</span><span className="mt-1 block text-xs text-slate-400">Sohbeti daha ferah veya daha yoğun göster.</span></span></div>
                <div className="mt-4 grid grid-cols-2 gap-2">{[['comfortable', 'Rahat', 'Mesajlar arasında daha fazla boşluk'], ['compact', 'Kompakt', 'Daha fazla mesajı aynı anda gör']].map(([id, label, hint]) => <button key={id} type="button" aria-pressed={preferences.chatDensity === id} onClick={() => updatePreference('chatDensity', id)} className={`rounded-xl border p-3 text-left transition ${preferences.chatDensity === id ? 'border-violet-300/30 bg-violet-300/[0.07]' : 'border-white/[0.07] hover:bg-white/[0.04]'}`}><span className="block text-xs font-semibold text-white">{label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{hint}</span></button>)}</div>
              </div>
              <label className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><span><span className="block text-sm font-semibold text-white">Hızlı arama kısayolu</span><span className="mt-1 block text-xs text-slate-400">Sunucu, kanal, DM ve mesaj aramasını her ekrandan aç.</span></span><AnimatedSelect ariaLabel="Hızlı arama kısayolu" value={preferences.searchShortcut || 'ctrl+k'} onValueChange={(value) => updatePreference('searchShortcut', value)} options={[{ value: 'ctrl+k', label: 'Ctrl + K' }, { value: 'ctrl+shift+k', label: 'Ctrl + Shift + K' }, { value: 'alt+k', label: 'Alt + K' }]} className="min-w-44" /></label>
              <PreferenceRow icon={<Bell className="h-4 w-4" />} title="Rahatsız etmeyin" description="Masaüstü bildirimi ve açılır uyarıları sessize alır. Okunmamış rozetleri yine birikir." checked={preferences.doNotDisturb} onChange={(value) => updatePreference('doNotDisturb', value)} />
              <PreferenceRow icon={<Bell className="h-4 w-4" />} title="Masaüstü bildirimleri" description="Yeni bildirimleri uygulama arka plandayken göster." checked={preferences.desktopNotifications} onChange={(value) => updatePreference('desktopNotifications', value)} />
              {preferences.desktopNotifications && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div><p className="text-sm font-semibold text-white">Masaüstü izni</p><p className="mt-1 text-xs text-slate-400">Durum: {notificationPermission === 'granted' ? 'İzin verildi' : notificationPermission === 'denied' ? 'Engellendi · işletim sistemi ayarlarından aç' : notificationPermission === 'unsupported' ? 'Bu ortam bildirimleri desteklemiyor' : 'Henüz izin istenmedi'}. Rahatsız Etme ve sessiz saatler bildirimleri bastırır.</p></div>{notificationPermission === 'granted' ? <button type="button" onClick={sendTestDesktopNotification} className="rounded-xl border border-violet-200/15 bg-violet-300/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-300/15">Test bildirimi</button> : notificationPermission !== 'unsupported' && <button type="button" onClick={() => void enableDesktopNotifications()} className="rounded-xl border border-violet-200/15 bg-violet-300/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-300/15">İzin iste</button>}</div>}
              <PreferenceRow icon={<Volume2 className="h-4 w-4" />} title="Bildirim sesi" description="Bildirim geldiğinde kısa bir ses çal." checked={preferences.notificationSound} onChange={(value) => updatePreference('notificationSound', value)} />
              {preferences.notificationSound && <label className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-3"><span className="shrink-0 text-xs font-medium text-slate-300">Bildirim ses düzeyi</span><input aria-label="Bildirim ses düzeyi" type="range" min="0" max="100" value={preferences.notificationSoundVolume ?? 65} onChange={(event) => updatePreference('notificationSoundVolume', Number(event.target.value))} className="min-w-0 flex-1 accent-violet-400" /><span className="w-9 text-right text-xs tabular-nums text-slate-400">{preferences.notificationSoundVolume ?? 65}%</span></label>}
              <ServerNotificationSettings preferences={preferences} onChange={updatePreference} />
              <PreferenceRow icon={<Accessibility className="h-4 w-4" />} title="Hareketi azalt" description="Arayüz geçişlerini ve dikkat dağıtan animasyonları azalt." checked={preferences.reduceMotion} onChange={(value) => updatePreference('reduceMotion', value)} />
              <p className="px-1 pt-2 text-xs text-slate-500">Bu tercihler bu cihaz ve tarayıcıda saklanır.</p>
            </section>
          ) : activeTab === 'connections' ? (
            <ConnectionsSettingsPanel userId={user?.id} />
          ) : activeTab === 'activity' ? (
            <div className="max-w-2xl space-y-4">
              <PreferenceRow icon={<Gamepad2 className="h-4 w-4" />} title="Oyun etkinliğini paylaş" description="Windows masaüstü uygulamasında bilinen oyunları algıla ve profilde göster. Bu ayar kapalıyken oyun taraması yapılmaz." checked={preferences.gameDetectionEnabled === true} onChange={(value) => updatePreference('gameDetectionEnabled', value)} />
            </div>
          ) : activeTab === 'sound' ? (
            <section className="max-w-2xl space-y-3">
              <VoiceSettingsPanel value={preferences.voiceAudioSettings || {}} onChange={(value) => updatePreference('voiceAudioSettings', value)} />
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/[0.08] text-cyan-100"><Volume2 className="h-4 w-4" /></span><span><span className="block text-sm font-semibold text-white">Arayüz ses efektleri</span><span className="mt-1 block text-xs text-slate-400">Odaya girme/çıkma, arama ve ses tahtası efektlerinin cihazındaki seviyesi.</span></span></div>
                <label className="mt-4 block"><span className="mb-2 flex justify-between text-xs text-slate-300"><span>Ses seviyesi</span><span>{preferences.uiSoundVolume ?? 65}%</span></span><input aria-label="Arayüz ses efekti seviyesi" type="range" min="0" max="100" step="1" value={preferences.uiSoundVolume ?? 65} onChange={(event) => updatePreference('uiSoundVolume', Number(event.target.value))} className="w-full accent-violet-400" /></label>
                <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Varsayılan seviye yükseltildi. Sürgü 0’a gelirse efekt sesi kapanır.</p><button type="button" onClick={() => playUiSound('join', user?.id)} disabled={!preferences.soundEffects || !(preferences.uiSoundVolume ?? 65)} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-40"><Play className="h-3.5 w-3.5" />Dene</button></div>
                <div className="mt-4 grid gap-3 border-t border-white/[0.07] pt-3 sm:grid-cols-2">
                  {[["microphoneToggleSoundVolume", "Mikrofon açma / kapama", "microphoneOn", Mic], ["headphoneToggleSoundVolume", "Kulaklık açma / kapama", "headphonesOn", Headphones]].map(([key, label, preview, Icon]) => <div key={key} className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-cyan-200" /><span className="min-w-0 flex-1 text-[11px] font-semibold text-slate-200">{label}</span><span className="text-[10px] tabular-nums text-slate-400">{preferences[key] ?? 55}%</span></div><input aria-label={`${label} sesi`} type="range" min="0" max="100" step="1" value={preferences[key] ?? 55} onChange={event => updatePreference(key, Number(event.target.value))} className="mt-2 w-full accent-cyan-300" /><button type="button" disabled={!preferences.soundEffects || !(preferences[key] ?? 55)} onClick={() => playUiSound(preview, user?.id)} className="mt-1 text-[10px] font-semibold text-cyan-100/80 hover:text-cyan-100 disabled:opacity-40">Sesi dene</button></div>)}
                </div>
              </div>
              <PreferenceRow icon={<Volume2 className="h-4 w-4" />} title="Arayüz ses efektleri" description="Ses odasına girme, ayrılma, geri dönme ve arama seslerini etkinleştir." checked={preferences.soundEffects} onChange={(value) => updatePreference('soundEffects', value)} />
              <p className="px-1 pt-2 text-xs text-slate-500">Ses ve cihaz tercihleri bu cihazda saklanır.</p>
            </section>
          ) : activeTab === 'keybinds' ? (
            <KeybindSettingsPanel
              value={preferences.keybinds || {}}
              onChange={value => updatePreference('keybinds', value)}
              pushToTalkEnabled={preferences.pushToTalkEnabled}
              onPushToTalkChange={value => updatePreference('pushToTalkEnabled', value)}
              launchAtStartup={preferences.launchAtStartup}
              onLaunchAtStartupChange={value => updatePreference('launchAtStartup', value)}
            />
          ) : activeTab === 'plus' ? (
            <FastlynoxPlusPanel userId={user?.id} />
          ) : activeTab === 'privacy' ? (
            <PrivacySettingsPanel userId={user?.id} />
          ) : activeTab === 'admin' && isPlatformStaff ? (
            <FastlynoxAdminPanel />
          ) : null}
        </main>
      </div>
      {isBannerEditorOpen && <BannerEditorModal userId={user?.id} value={bannerUrl} positionX={bannerPositionX} positionY={bannerPositionY} zoom={bannerZoom} onClose={() => setIsBannerEditorOpen(false)} onApply={({ url, positionX, positionY, zoom }) => { setBannerUrl(url); setBannerPositionX(positionX); setBannerPositionY(positionY); setBannerZoom(zoom); setBannerChanged(url !== getBannerUrl(user?.banner_url)); setProfileMessage('Banner ayarlandı. Profili kaydetmeyi unutma.'); }} />}
      {isAvatarEditorOpen && <AvatarEditorModal userId={user?.id} value={avatarUrl} onClose={() => setIsAvatarEditorOpen(false)} onApply={(url) => { setAvatarUrl(url); setAvatarChanged(true); setProfileMessage('Profil fotoğrafı ayarlandı. Profili kaydetmeyi unutma.'); }} />}
    </div>
  );
}

function PreferenceRow({ icon, title, description, checked, onChange }) {
  return <div className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition hover:bg-white/[0.04]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-300/[0.08] text-violet-200">{icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span></span><button type="button" role="switch" aria-checked={checked} aria-label={title} onClick={() => onChange(!checked)} className={`group relative h-7 w-[3.15rem] shrink-0 rounded-full border p-[3px] outline-none transition-[background-color,border-color,box-shadow] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-violet-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10151f] ${checked ? 'border-violet-300/50 bg-gradient-to-r from-violet-500 to-indigo-400 shadow-[0_0_16px_rgba(129,140,248,.28)]' : 'border-white/10 bg-slate-800 hover:bg-slate-700'}`}><span className={`grid h-[1.125rem] w-[1.125rem] place-items-center rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.35)] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${checked ? 'translate-x-[1.45rem]' : 'translate-x-0'}`}>{checked ? <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> : <span className="h-1 w-1 rounded-full bg-slate-400" />}</span></button></div>;
}

function VoiceSettingsPanel({ value, onChange }) {
  const [devices, setDevices] = useState({ audioinput: [], audiooutput: [] });
  const [micTest, setMicTest] = useState({ active: false, level: 0, error: '' });
  const [diagnostic, setDiagnostic] = useState({ busy: false, results: null });
  const micTestRef = useRef(null);
  const finishMicTestRef = useRef(() => {});
  const settings = { inputDeviceId: '', outputDeviceId: '', audioQuality: 'high', echoCancellation: true, noiseSuppression: true, noiseProcessor: 'krisp', voiceIsolation: false, inputSensitivityEnabled: false, inputSensitivityDb: -100, inputVolume: 100, outputVolume: 100, ...value, autoGainControl: true };
  const [sensitivityDraft, setSensitivityDraft] = useState(settings.inputSensitivityDb);
  const [inputVolumeDraft, setInputVolumeDraft] = useState(settings.inputVolume);
  const [outputVolumeDraft, setOutputVolumeDraft] = useState(settings.outputVolume);
  useEffect(() => setSensitivityDraft(settings.inputSensitivityDb), [settings.inputSensitivityDb]);
  useEffect(() => setInputVolumeDraft(settings.inputVolume), [settings.inputVolume]);
  useEffect(() => setOutputVolumeDraft(settings.outputVolume), [settings.outputVolume]);

  const finishMicTest = useCallback((session = micTestRef.current) => {
    if (!session || micTestRef.current !== session) return;
    micTestRef.current = null;
    window.clearInterval(session.interval);
    window.clearTimeout(session.timeout);
    if (session.monitor) { session.monitor.pause(); session.monitor.srcObject = null; }
    session.stream?.getTracks().forEach(track => track.stop());
    try { session.source?.disconnect(); } catch { /* Already disconnected. */ }
    try { session.analyser?.disconnect(); } catch { /* Already disconnected. */ }
    if (session.context && session.context.state !== 'closed') void session.context.close().catch(() => {});
    setMicTest(current => ({ ...current, active: false, level: 0 }));
    window.dispatchEvent(new CustomEvent('fastlynox:microphone-test', { detail: { active: false } }));
  }, []);
  useEffect(() => { finishMicTestRef.current = finishMicTest; }, [finishMicTest]);
  useEffect(() => () => finishMicTestRef.current(), []);

  const startMicTest = useCallback(async () => {
    if (micTestRef.current) { finishMicTestRef.current(); return; }
    const session = { stream: null, context: null, source: null, analyser: null, monitor: null, interval: null, timeout: null };
    micTestRef.current = session;
    setMicTest({ active: true, level: 0, error: '' });
    window.dispatchEvent(new CustomEvent('fastlynox:microphone-test', { detail: { active: true } }));
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu cihazda mikrofon erişimi kullanılamıyor.');
      const audio = {
        deviceId: settings.inputDeviceId ? { exact: settings.inputDeviceId } : undefined,
        echoCancellation: Boolean(settings.echoCancellation),
        noiseSuppression: Boolean(settings.noiseSuppression),
        autoGainControl: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      if (micTestRef.current !== session) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      session.monitor = new Audio();
      session.monitor.autoplay = true;
      session.monitor.volume = 0.6;
      session.monitor.srcObject = stream;
      if (settings.outputDeviceId && typeof session.monitor.setSinkId === 'function') {
        try { await session.monitor.setSinkId(settings.outputDeviceId); } catch { /* Use the system default output if this device cannot be selected. */ }
      }
      await session.monitor.play();
      if (micTestRef.current !== session) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Mikrofon seviye ölçeri bu cihazda desteklenmiyor.');
      session.context = new AudioContextClass();
      await session.context.resume();
      session.source = session.context.createMediaStreamSource(stream);
      session.analyser = session.context.createAnalyser();
      session.analyser.fftSize = 512;
      session.source.connect(session.analyser);
      const samples = new Float32Array(session.analyser.fftSize);
      session.interval = window.setInterval(() => {
        if (micTestRef.current !== session) return;
        session.analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        const level = Math.min(100, Math.round(Math.max(0, (20 * Math.log10(rms || 0.00001) + 60) * 1.65)));
        setMicTest(current => current.level === level ? current : { ...current, level });
      }, 80);
      session.timeout = window.setTimeout(() => finishMicTest(session), 10000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mikrofon testi başlatılamadı.';
      if (micTestRef.current === session) {
        finishMicTest(session);
        setMicTest({ active: false, level: 0, error: message });
      }
    }
  }, [finishMicTest, settings.inputDeviceId, settings.outputDeviceId, settings.echoCancellation, settings.noiseSuppression]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const found = await navigator.mediaDevices?.enumerateDevices?.();
        if (active && found) setDevices({ audioinput: found.filter(device => device.kind === 'audioinput'), audiooutput: found.filter(device => device.kind === 'audiooutput') });
      } catch { /* Keep system defaults when device enumeration is blocked. */ }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => { active = false; navigator.mediaDevices?.removeEventListener?.('devicechange', refresh); };
  }, []);

  const update = (key, nextValue) => onChange({ ...settings, [key]: nextValue });
  const runDiagnostics = async () => {
    setDiagnostic({ busy: true, results: null });
    let permission = 'Denetlenemedi';
    try { permission = navigator.permissions?.query ? (await navigator.permissions.query({ name: 'microphone' })).state : 'Tarayıcı izin API’si yok'; } catch { permission = 'İzin durumu okunamadı'; }
    let found = [];
    try { found = await navigator.mediaDevices?.enumerateDevices?.() || []; } catch { /* shown in device counts */ }
    const inputs = found.filter(device => device.kind === 'audioinput');
    const outputs = found.filter(device => device.kind === 'audiooutput');
    const exists = (id, list) => !id || list.some(device => device.deviceId === id);
    setDiagnostic({ busy: false, results: [
      { label: 'Ağ bağlantısı', value: navigator.onLine ? 'Çevrim içi' : 'Çevrim dışı', ok: navigator.onLine },
      { label: 'Mikrofon izni', value: permission, ok: permission === 'granted' || permission === 'prompt' },
      { label: 'Medya aygıtları', value: `${inputs.length} mikrofon · ${outputs.length} ses çıkışı`, ok: inputs.length > 0 },
      { label: 'Seçili mikrofon', value: exists(settings.inputDeviceId, inputs) ? 'Kullanılabilir' : 'Bulunamadı; sistem varsayılanını seç', ok: exists(settings.inputDeviceId, inputs) },
      { label: 'Seçili ses çıkışı', value: exists(settings.outputDeviceId, outputs) ? 'Kullanılabilir' : 'Bulunamadı; sistem varsayılanını seç', ok: exists(settings.outputDeviceId, outputs) },
      { label: 'Mikrofon testi', value: micTest.error ? `Hata: ${micTest.error}` : micTest.active ? 'Çalışıyor' : 'Hazır', ok: !micTest.error },
    ] });
  };
  const makeOptions = kind => [
    { value: '', label: devices[kind][0]?.label ? `Sistem varsayılanı · ${devices[kind][0].label}` : 'Sistem varsayılanı' },
    ...devices[kind].map((device, index) => ({ value: device.deviceId, label: device.label || `${kind === 'audioinput' ? 'Mikrofon' : 'Hoparlör'} ${index + 1}` })),
  ];

  return <section className="rounded-2xl border border-cyan-200/10 bg-[linear-gradient(145deg,rgba(30,38,54,.6),rgba(13,18,28,.55))] p-4">
    <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-200/[0.08] text-cyan-100"><AudioLines className="h-4 w-4" /></span><span><span className="block text-sm font-semibold text-white">Ses ve video</span><span className="mt-1 block text-xs text-slate-400">Aygıtları ve mikrofon filtrelerini seç. Tercihler bu cihazda saklanır.</span></span></div>
    <label className="mb-3 block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Giden ses kalitesi</span><AnimatedSelect ariaLabel="Mikrofon yayın kalitesi" value={settings.audioQuality} onValueChange={audioQuality => update('audioQuality', audioQuality)} options={[{ value: 'speech', label: 'Konuşma · düşük gecikme' }, { value: 'high', label: 'Yüksek kalite · daha çok internet' }]} className="w-full" /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Mic className="mr-1 inline h-3 w-3" />Mikrofon</span><AnimatedSelect ariaLabel="Varsayılan mikrofon" value={settings.inputDeviceId} onValueChange={deviceId => update('inputDeviceId', deviceId)} options={makeOptions('audioinput')} className="w-full" /></label>
      <label><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Headphones className="mr-1 inline h-3 w-3" />Ses çıkışı</span><AnimatedSelect ariaLabel="Varsayılan hoparlör" value={settings.outputDeviceId} onValueChange={deviceId => update('outputDeviceId', deviceId)} options={makeOptions('audiooutput')} className="w-full" /></label>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><span className="flex justify-between text-[10px] font-semibold text-slate-300"><span>Mikrofon ses seviyesi</span><span>{inputVolumeDraft}%</span></span><input aria-label="Mikrofon ses seviyesi" type="range" min="0" max="200" step="1" value={inputVolumeDraft} onChange={event => setInputVolumeDraft(Number(event.target.value))} onPointerUp={event => update('inputVolume', Number(event.currentTarget.value))} onKeyUp={event => update('inputVolume', Number(event.currentTarget.value))} className="mt-2 w-full accent-cyan-300" /></label>
      <label className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><span className="flex justify-between text-[10px] font-semibold text-slate-300"><span>Hoparlör ses seviyesi</span><span>{outputVolumeDraft}%</span></span><input aria-label="Hoparlör ses seviyesi" type="range" min="0" max="200" step="1" value={outputVolumeDraft} onChange={event => setOutputVolumeDraft(Number(event.target.value))} onPointerUp={event => update('outputVolume', Number(event.currentTarget.value))} onKeyUp={event => update('outputVolume', Number(event.currentTarget.value))} className="mt-2 w-full accent-cyan-300" /></label>
    </div>
    <label className="mt-3 block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Gürültü filtresi</span><AnimatedSelect ariaLabel="Gürültü filtresi" value={settings.noiseProcessor} onValueChange={value => update('noiseProcessor', value)} options={[{ value: 'krisp', label: 'Krisp · en güçlü filtre' }, { value: 'rnnoise', label: 'RNNoise · cihazda, çevrim dışı' }, { value: 'standard', label: 'Standart · düşük işlemci kullanımı' }]} className="w-full" /></label>
    <div className="mt-3 space-y-2">
      <PreferenceRow icon={<AudioLines className="h-4 w-4" />} title="Mikrofon giriş eşiği" description="Açıldığında belirlediğin dB seviyesinin altındaki sesleri keser." checked={Boolean(settings.inputSensitivityEnabled)} onChange={checked => update('inputSensitivityEnabled', checked)} />
      {settings.inputSensitivityEnabled && <label className="block rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><span className="flex items-center justify-between text-xs font-semibold text-white"><span>Mikrofon giriş eşiği</span><span>{sensitivityDraft} dB</span></span><input aria-label="Mikrofon giriş eşiği (dB)" type="range" min="-100" max="0" step="1" value={sensitivityDraft} onChange={event => setSensitivityDraft(Number(event.target.value))} onPointerUp={event => update('inputSensitivityDb', Number(event.currentTarget.value))} onKeyUp={event => update('inputSensitivityDb', Number(event.currentTarget.value))} className="mt-3 w-full accent-violet-400" /><span className="mt-1 block text-[10px] text-slate-500">Daha düşük değerler kısık sesi geçirir; eşiği yükseltmek arka plan sesini azaltır. −100 dB sesi açık bırakır, 0 dB neredeyse tüm sesi keser.</span></label>}
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {[["echoCancellation", 'Yankı engelleme', 'Hoparlör yankısını azalt'], ["noiseSuppression", 'Gürültü engelleme', 'Arka plan sesini azalt']].map(([key, title, description]) => <PreferenceRow key={key} icon={<AudioLines className="h-4 w-4" />} title={title} description={description} checked={Boolean(settings[key])} onChange={checked => update(key, checked)} />)}
    </div>
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3.5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-white">Ses sorunlarını denetle</p><p className="mt-1 text-[10px] text-slate-500">İzinleri, bağlantıyı ve seçili aygıtları kontrol eder.</p></div><button type="button" disabled={diagnostic.busy} onClick={() => void runDiagnostics()} className="rounded-xl bg-violet-300/10 px-3 py-2 text-[10px] font-semibold text-violet-100 hover:bg-violet-300/15 disabled:opacity-50">{diagnostic.busy ? 'Denetleniyor…' : 'Denetle'}</button></div>{diagnostic.results && <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">{diagnostic.results.map(item => <li key={item.label} className="flex justify-between gap-3 text-[10px]"><span className="text-slate-400">{item.label}</span><span className={item.ok ? 'text-emerald-200' : 'text-amber-200'}>{item.value}</span></li>)}</ul>}</div>
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-[#0b1019]/70 p-3.5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/[0.09] text-cyan-100"><Mic className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-100">Mikrofon testi</p><p className="mt-1 text-[10px] leading-4 text-slate-400">Ses seviyesini ölçer ve mikrofonunu %60 düzeyinde geri verir. Yankıyı önlemek için kulaklık kullan.</p></div>
        <button type="button" onClick={() => void startMicTest()} className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${micTest.active ? 'border border-rose-300/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15' : 'bg-cyan-200/10 text-cyan-100 hover:bg-cyan-200/15'}`}>{micTest.active ? 'Testi bitir' : 'Test et'}</button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]" role="meter" aria-label="Mikrofon giriş seviyesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={micTest.level}><div className={`h-full rounded-full transition-[width] duration-100 ${micTest.level > 82 ? 'bg-amber-300' : 'bg-gradient-to-r from-cyan-400 to-emerald-300'}`} style={{ width: `${micTest.level}%` }} /></div>
      <div className="mt-1.5 flex justify-between text-[9px] text-slate-500"><span>{micTest.error || (micTest.active ? 'Konuş; test 10 saniye içinde otomatik biter.' : 'Hazır')}</span><span>{micTest.active ? `${micTest.level}%` : ''}</span></div>
    </div>
    <p className="mt-3 text-[10px] leading-4 text-slate-500">Krisp, uyumlu LiveKit Cloud bağlantısında daha güçlü filtre uygular. İlk kullanımda model indirilir; desteklenmiyorsa RNNoise yedeğine geçer.</p>
  </section>;
}
