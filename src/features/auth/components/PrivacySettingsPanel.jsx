import { useCallback, useEffect, useState } from 'react';
import { Eye, Shield, ShieldOff } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { fetchProfiles, getAvatarUrl } from '../../../lib/profileMedia';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';

export function PrivacySettingsPanel({ userId }) {
  const [settings, setSettings] = useState({ dm_policy: 'everyone', show_online: true, read_receipts: true });
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [settingsResult, blocksResult] = await Promise.all([
      supabase.from('user_privacy_settings').select('dm_policy,show_online,read_receipts').eq('user_id', userId).maybeSingle(),
      supabase.from('user_blocks').select('blocked_id,created_at').eq('blocker_id', userId).order('created_at', { ascending: false }),
    ]);
    if (settingsResult.error || blocksResult.error) {
      setNotice('Gizlilik ayarları için migration_user_controls.sql dosyasını Supabase SQL Editor’da çalıştır.');
      setLoading(false);
      return;
    }
    setSettings((current) => ({ ...current, ...(settingsResult.data || {}) }));
    const profiles = await fetchProfiles((blocksResult.data || []).map((item) => item.blocked_id));
    setBlocked((blocksResult.data || []).map((item) => ({ ...item, profile: profiles.find((profile) => profile.id === item.blocked_id) })));
    setNotice('');
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (userId) void load(); }, [load, userId]);

  const update = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setNotice('');
    const { error } = await supabase.from('user_privacy_settings').upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) setNotice('Ayar kaydedilemedi. migration_user_controls.sql dosyasını kontrol et.');
    else setNotice('Gizlilik ayarın kaydedildi.');
  };

  const unblock = async (blockedId) => {
    const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', blockedId);
    if (error) setNotice(error.message);
    else { setBlocked((current) => current.filter((item) => item.blocked_id !== blockedId)); setNotice('Engel kaldırıldı.'); }
  };

  return <section className="max-w-2xl space-y-5">
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/[0.08] text-violet-200"><Shield className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-white">Mesaj ve görünürlük</h2><p className="mt-1 text-xs text-slate-400">Bu ayarlar hesabınla eşitlenir ve DM/kanal politikalarında kullanılır.</p></div></div>
      <label className="mt-5 block"><span className="mb-2 block text-xs font-semibold text-slate-300">Kimler sana özel mesaj gönderebilir?</span><AnimatedSelect disabled={loading || saving} value={settings.dm_policy} onValueChange={(value) => void update({ dm_policy: value })} ariaLabel="Kimler sana DM gönderebilir?" options={[{ value: 'everyone', label: 'Herkes' }, { value: 'friends', label: 'Yalnızca arkadaşların' }, { value: 'nobody', label: 'Hiç kimse' }]} className="w-full" /></label>
      <div className="mt-4 space-y-2"><PrivacyToggle icon={<Eye className="h-4 w-4" />} title="Çevrimiçi durumumu göster" description="Kapalıyken arkadaşların ve sunucu üyeleri seni çevrim dışı görür." checked={settings.show_online} disabled={loading || saving} onChange={(value) => void update({ show_online: value })} /><PrivacyToggle icon={<Eye className="h-4 w-4" />} title="Okundu bilgisini paylaş" description="Kapalıyken diğer kullanıcılar mesajlarını okuyup okumadığını göremez." checked={settings.read_receipts} disabled={loading || saving} onChange={(value) => void update({ read_receipts: value })} /></div>
    </div>
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-300/[0.08] text-rose-200"><ShieldOff className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-white">Engellenen hesaplar</h2><p className="mt-1 text-xs text-slate-400">Engellediğin kişiler DM veya arkadaşlık isteği başlatamaz.</p></div></div><div className="mt-4 space-y-2">{blocked.length ? blocked.map((item) => <div key={item.blocked_id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-2.5"><img src={getAvatarUrl(item.profile?.avatar_url, item.profile?.username || item.blocked_id)} alt="" className="h-8 w-8 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{item.profile?.username || 'Kullanıcı'}</span><button type="button" onClick={() => void unblock(item.blocked_id)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-slate-300 hover:bg-white/[0.06]">Engeli kaldır</button></div>) : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-slate-500">Engellenen kullanıcı yok.</p>}</div></div>
    {notice && <p role="status" className="text-xs text-violet-200">{notice}</p>}
  </section>;
}

function PrivacyToggle({ icon, title, description, checked, disabled, onChange }) {
  return <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3"><span className="text-slate-400">{icon}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-200">{title}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{description}</span></span><button type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full border p-0.5 transition duration-200 disabled:opacity-50 ${checked ? 'border-violet-300/40 bg-violet-500' : 'border-white/10 bg-slate-800'}`}><span className={`block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} /></button></div>;
}
