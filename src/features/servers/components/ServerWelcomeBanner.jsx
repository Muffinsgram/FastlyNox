import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Pencil, Sparkles, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';

export function ServerWelcomeBanner({ server, user, onNavigate }) {
  const [settings, setSettings] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('Sunucuya hoş geldin!');
  const [body, setBody] = useState('Kanalları keşfet, topluluğa katıl ve kendini tanıt.');
  const [channelId, setChannelId] = useState('');
  const [notice, setNotice] = useState('');
  const channels = useMemo(() => (server?.categories || []).flatMap((category) => category.channels || []).filter((channel) => channel.type === 'text'), [server]);
  const mayEdit = server?.owner_id === user?.id || ['owner', 'admin'].includes(server?.member_role);
  const dismissKey = `fastcord:welcome-dismissed:${user?.id}:${server?.id}`;

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setDismissed(localStorage.getItem(dismissKey) === '1');
    void supabase.from('server_welcome_settings').select('*').eq('server_id', server.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      setSettings(data || null);
      if (data) { setTitle(data.title); setBody(data.body); setChannelId(data.channel_id || ''); }
      if (error) setNotice('Karşılama ayarları yüklenemedi. community features migration’ını çalıştır.');
      setLoaded(true);
    });
    return () => { active = false; };
  }, [server.id, dismissKey]);

  const save = async (event) => {
    event.preventDefault();
    const { data, error } = await supabase.from('server_welcome_settings').upsert({ server_id: server.id, enabled: true, title: title.trim(), body: body.trim(), channel_id: channelId || null }, { onConflict: 'server_id' }).select('*').single();
    if (error) setNotice('Ayarlar kaydedilemedi. Sunucu sahibi/yönetici iznini ve migration’ı kontrol et.');
    else { setSettings(data); setEditing(false); setDismissed(false); setNotice('Karşılama kartı güncellendi.'); }
  };

  const disable = async () => {
    const { error } = await supabase.from('server_welcome_settings').upsert({ server_id: server.id, enabled: false, title: title.trim() || 'Sunucuya hoş geldin!', body: body.trim(), channel_id: channelId || null }, { onConflict: 'server_id' });
    if (error) setNotice('Karşılama kartı kapatılamadı.');
    else { setSettings((current) => ({ ...current, enabled: false })); setEditing(false); }
  };

  if (!loaded || dismissed || (!settings?.enabled && !mayEdit)) return null;
  return <aside className="relative mx-4 mt-4 overflow-hidden rounded-2xl border border-violet-300/15 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,.18),transparent_60%),linear-gradient(120deg,rgba(18,24,36,.95),rgba(12,16,24,.95))] p-4 sm:mx-5"><div className="pointer-events-none absolute -right-8 -top-12 h-32 w-32 rounded-full bg-cyan-300/[0.07] blur-2xl" /><div className="relative flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-200/15 bg-violet-300/10 text-violet-100"><Sparkles className="h-5 w-5" /></div><div className="min-w-0 flex-1">{editing ? <form onSubmit={save} className="space-y-2"><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm font-bold text-white" /><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} rows={2} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-200" /><AnimatedSelect ariaLabel="Karşılama kartı kanalı" value={channelId} onValueChange={setChannelId} placeholder="Kanal bağlantısı yok" options={[{ value: '', label: 'Kanal bağlantısı yok' }, ...channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))]} className="w-full text-xs" /><div className="flex gap-2"><button className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white"><Check className="h-3.5 w-3.5" /> Kaydet</button>{settings?.enabled && <button type="button" onClick={() => void disable()} className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs text-rose-200">Kartı kapat</button>}<button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-xs text-slate-400">Vazgeç</button></div></form> : <><p className="text-sm font-bold text-white">{settings?.enabled ? settings.title : 'Yeni üyeler için karşılama kartı'}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-300">{settings?.enabled ? settings.body : 'Topluluğun için kısa bir mesaj ve başlangıç kanalı belirle.'}</p><div className="mt-3 flex flex-wrap gap-2">{settings?.channel_id && <button type="button" onClick={() => onNavigate(settings.channel_id)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-400/15 px-3 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-400/25">Başlangıç kanalına git <ArrowRight className="h-3.5 w-3.5" /></button>}{mayEdit && <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="h-3 w-3" /> Düzenle</button>}{settings?.enabled && <button type="button" onClick={() => { localStorage.setItem(dismissKey, '1'); setDismissed(true); }} aria-label="Karşılama kartını kapat" className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>}</div></>}</div></div>{notice && <p role="status" className="relative mt-2 text-[10px] text-amber-200">{notice}</p>}</aside>;
}
