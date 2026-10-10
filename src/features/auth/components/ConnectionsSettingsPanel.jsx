import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Gamepad2, Camera, LoaderCircle, Music2, Save, Video, Radio } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { SpotifyActivityPanel } from './SpotifyActivityPanel';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';

const PLATFORMS = [
  { id: 'spotify', name: 'Spotify', Icon: Music2, placeholder: 'https://open.spotify.com/user/…', hosts: ['open.spotify.com', 'spotify.com'] },
  { id: 'listenbrainz', name: 'ListenBrainz', Icon: Radio, placeholder: 'https://listenbrainz.org/user/kullanici-adin', hosts: ['listenbrainz.org'] },
  { id: 'steam', name: 'Steam', Icon: Gamepad2, placeholder: 'https://steamcommunity.com/id/…', hosts: ['steamcommunity.com', 'steampowered.com'] },
  { id: 'youtube', name: 'YouTube', Icon: Video, placeholder: 'https://youtube.com/@…', hosts: ['youtube.com', 'youtu.be'] },
  { id: 'instagram', name: 'Instagram', Icon: Camera, placeholder: 'https://instagram.com/…', hosts: ['instagram.com'] },
];

function isPlatformUrlValid(value, hosts) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export function ConnectionsSettingsPanel({ userId }) {
  const [links, setLinks] = useState({});
  const [savedLinks, setSavedLinks] = useState({});
  const [busyPlatform, setBusyPlatform] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from('user_social_links').select('platform,profile_url,visibility').eq('user_id', userId);
    if (error) { setNotice('Bağlantılar için migration_profile_social_activity.sql dosyasını Supabase’te çalıştır.'); return; }
    const next = Object.fromEntries((data || []).map((item) => [item.platform, { url: item.profile_url, visibility: item.visibility || 'connections' }]));
    setLinks(next);
    setSavedLinks(next);
    setNotice('');
  }, [userId]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`social-links-settings:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_social_links', filter: `user_id=eq.${userId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, userId]);

  const save = async (platform) => {
    const config = PLATFORMS.find((item) => item.id === platform);
    const setting = links[platform] || {};
    const value = (setting.url || '').trim();
    if (!config || !userId || busyPlatform) return;
    if (value && !isPlatformUrlValid(value, config.hosts)) { setNotice(`${config.name} için https:// bağlantısı ve doğru alan adı gerekli.`); return; }
    setBusyPlatform(platform);
    setNotice('');
    const result = value
      ? await supabase.from('user_social_links').upsert({ user_id: userId, platform, profile_url: value, visibility: setting.visibility || 'connections', updated_at: new Date().toISOString() }, { onConflict: 'user_id,platform' })
      : await supabase.from('user_social_links').delete().eq('user_id', userId).eq('platform', platform);
    setBusyPlatform('');
    if (result.error) setNotice(result.error.message);
    else {
      setSavedLinks((current) => ({ ...current, [platform]: { url: value, visibility: setting.visibility || 'connections' } }));
      setNotice(`${config.name} bağlantısı ${value ? 'kaydedildi' : 'kaldırıldı'}.`);
    }
  };

  return <section className="max-w-2xl space-y-4">
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><h2 className="text-sm font-semibold text-white">Profil bağlantıları</h2><p className="mt-1 text-xs leading-5 text-slate-400">Hesaplarının herkese açık profil adreslerini ekle. Her bağlantı için görünürlüğü seçebilirsin. ListenBrainz herkese açık dinleme etkinliği sunar ve Spotify Premium/API erişimi olmadan müzik durumunu paylaşmak için alternatif olarak kullanılabilir.</p>
      <div className="mt-4 space-y-3">{PLATFORMS.map(({ id, name, Icon, placeholder }) => {
        const setting = links[id] || { url: '', visibility: 'connections' };
        const saved = savedLinks[id] || { url: '', visibility: 'connections' };
        const dirty = setting.url !== saved.url || setting.visibility !== saved.visibility;
        return <div key={id} className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className="flex w-28 shrink-0 items-center gap-2 text-xs font-semibold text-slate-200"><Icon className="h-4 w-4 text-slate-400" />{name}</span><input type="url" value={setting.url} onChange={(event) => setLinks((current) => ({ ...current, [id]: { ...setting, url: event.target.value } }))} placeholder={placeholder} aria-label={`${name} profil bağlantısı`} className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#0b1018] px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-violet-300/30" /><button type="button" disabled={busyPlatform === id || !dirty} onClick={() => void save(id)} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] font-semibold text-slate-300 hover:bg-white/[0.05] disabled:cursor-default disabled:opacity-40">{busyPlatform === id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{setting.url ? 'Kaydet' : 'Kaldır'}</button>{saved.url && <a href={saved.url} target="_blank" rel="noreferrer" aria-label={`${name} profilini aç`} className="hidden rounded-lg p-2 text-slate-500 hover:bg-white/[0.05] hover:text-white sm:block"><ExternalLink className="h-4 w-4" /></a>}</div><div className="mt-2 flex flex-col gap-1.5 pl-0 sm:pl-28"><span className="text-[10px] text-slate-500">Profilde kimler görsün?</span><AnimatedSelect value={setting.visibility} onValueChange={(visibility) => setLinks((current) => ({ ...current, [id]: { ...setting, visibility } }))} ariaLabel={`${name} bağlantı görünürlüğü`} className="min-h-9 w-full text-[10px]" options={[{ value: 'connections', label: 'Arkadaşlar ve ortak sunucular' }, { value: 'friends', label: 'Yalnızca arkadaşlar' }, { value: 'everyone', label: 'Giriş yapan herkes' }]} /></div></div>;
      })}</div>
      {notice && <p role="status" className="mt-3 text-[11px] text-violet-200">{notice}</p>}
      <p className="mt-3 text-[10px] text-slate-600">Profil linki eklemek hesabı doğrulamaz; otomatik veri aktarımı yalnızca ilgili servisin OAuth/API erişimi varsa çalışır.</p>
    </div>
    <SpotifyActivityPanel userId={userId} />
  </section>;
}
