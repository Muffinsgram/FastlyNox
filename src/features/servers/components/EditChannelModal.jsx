import { useEffect, useState } from 'react';
import { Check, Flame, Hash, LockKeyhole, MessageSquareText, Settings2, Shield, Sparkles, Volume2, X, Save, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useServerStore } from '../../../store/useServerStore';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';
import { RoleEmoji } from '../../../components/ui/RoleEmoji';

function SettingSwitch({ checked, onChange, label, description, icon: Icon, tone = 'violet' }) {
  const tones = tone === 'rose'
    ? { icon: 'bg-rose-300/10 text-rose-200', active: 'bg-rose-400' }
    : { icon: 'bg-violet-300/10 text-violet-200', active: 'bg-violet-500' };
  return <div className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition ${checked ? 'border-white/[0.12] bg-white/[0.045]' : 'border-white/[0.07] bg-black/10 hover:bg-white/[0.025]'}`}>
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones.icon}`}><Icon className="h-4 w-4" /></span>
    <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">{label}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{description}</p></div>
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300/20 ${checked ? tones.active : 'bg-slate-700'}`}>
      <span className={`absolute left-1 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  </div>;
}

function ChannelSection({ eyebrow, title, description, icon: Icon, children }) {
  return <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
    <div className="mb-4 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-200/10 bg-violet-300/[0.08] text-violet-100"><Icon className="h-4 w-4" /></span><div><p className="text-[9px] font-bold uppercase tracking-[.18em] text-violet-200/65">{eyebrow}</p><h3 className="mt-1 text-sm font-bold text-slate-100">{title}</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p></div></div>
    {children}
  </section>;
}

export function EditChannelModal({ serverId, channel, onClose }) {
  const [name, setName] = useState(channel?.name || '');
  const [topic, setTopic] = useState(channel?.topic || '');
  const [categoryId, setCategoryId] = useState(channel?.category_id || '');
  const [isPrivate, setIsPrivate] = useState(Boolean(channel?.is_private));
  const [nsfw, setNsfw] = useState(Boolean(channel?.nsfw));
  const [slowmodeSeconds, setSlowmodeSeconds] = useState(Number(channel?.slowmode_seconds) || 0);
  const [roles, setRoles] = useState([]);
  const [visibleRoleIds, setVisibleRoleIds] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const updateChannel = useServerStore((state) => state.updateChannel);
  const categories = useServerStore((state) => state.servers.find((server) => server.id === serverId)?.categories || []);
  const isVoice = channel?.type === 'voice';

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('server_roles').select('id,name,color,emoji,gradient_color,animated').eq('server_id', serverId).order('position', { ascending: false }),
      supabase.from('channel_permission_overrides').select('role_id').eq('channel_id', channel.id).not('role_id', 'is', null),
    ]).then(([roleResult, overrideResult]) => {
      if (!active) return;
      if (roleResult.error || overrideResult.error) setError('Kanal izinleri yüklenemedi. migration_server_roles_permissions.sql dosyasını ve Supabase izinlerini kontrol et.');
      setRoles(roleResult.data || []);
      setVisibleRoleIds((overrideResult.data || []).map((row) => row.role_id));
    }).catch(() => { if (active) setError('Kanal ayarları yüklenirken bağlantı hatası oluştu.'); });
    return () => { active = false; };
  }, [serverId, channel.id]);

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const setRoleAllowed = (roleId, enabled) => setVisibleRoleIds((current) => enabled
    ? current.includes(roleId) ? current : [...current, roleId]
    : current.filter((id) => id !== roleId));

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Kanal adı boş bırakılamaz.'); return; }
    setBusy(true);
    setError('');
    const formattedName = channel.type === 'text' ? trimmedName.toLowerCase().replace(/\s+/g, '-') : trimmedName;
    try {
      const result = await updateChannel(serverId, channel.id, { name: formattedName, topic: topic.trim(), isPrivate, nsfw, slowmodeSeconds, categoryId, currentCategoryId: channel.category_id }, { visibleRoleIds });
      if (result?.success) onClose();
      else setError(result?.error || 'Kanal değişiklikleri kaydedilemedi.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Kanal değişiklikleri kaydedilemedi.');
    } finally { setBusy(false); }
  };

  return <div role="presentation" className="fixed inset-0 z-[500] grid place-items-center bg-[#05070c]/75 p-4 backdrop-blur-md animate-in fade-in duration-200" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="edit-channel-title" className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/[0.11] bg-[#111722]/95 shadow-[0_32px_110px_rgba(0,0,0,.7)] animate-in fade-in zoom-in-95 duration-200">
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-violet-200/40 to-transparent" />
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-300/15 to-cyan-300/[0.06] text-violet-100 shadow-inner">{isVoice ? <Volume2 className="h-5 w-5" /> : <Hash className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-violet-200/65">Kanal ayarları</p><h2 id="edit-channel-title" className="mt-0.5 truncate text-base font-bold text-white">#{channel.name} kanalını düzenle</h2><p className="mt-0.5 text-[10px] text-slate-500">Adı, erişimi ve kanal davranışını tek yerden yönet.</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat" className="rounded-xl border border-white/[0.07] p-2.5 text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"><X className="h-4 w-4" /></button>
      </header>

      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <ChannelSection eyebrow="Temel bilgiler" title="Kanal kimliği" description="Üyelerin kanalı bulmasını ve amacını anlamasını kolaylaştır." icon={MessageSquareText}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-300">Kanal adı<div className="relative mt-1.5"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{isVoice ? <Volume2 className="h-4 w-4" /> : <Hash className="h-4 w-4" />}</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="w-full rounded-xl border border-white/[0.08] bg-[#0b1018] py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-200/35 focus:ring-4 focus:ring-violet-300/[0.06]" /></div><span className="mt-1 block text-right text-[9px] font-normal text-slate-600">{name.length}/100</span></label>
              {categories.length > 1 && <label className="block text-xs font-semibold text-slate-300">Kategori<AnimatedSelect value={categoryId} onValueChange={setCategoryId} ariaLabel="Kanal kategorisi" options={categories.map((category) => ({ value: category.id, label: category.name }))} className="mt-1.5 w-full" /></label>}
              <label className="block text-xs font-semibold text-slate-300 sm:col-span-2">Kanal konusu <span className="font-normal text-slate-500">· isteğe bağlı</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={240} rows={3} placeholder="Bu kanalda neler konuşuluyor?" className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.08] bg-[#0b1018] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-200/35 focus:ring-4 focus:ring-violet-300/[0.06]" /><span className="mt-1 block text-right text-[9px] font-normal text-slate-600">{topic.length}/240</span></label>
            </div>
          </ChannelSection>

          <ChannelSection eyebrow="Erişim ve güvenlik" title="Kimler görebilir?" description="Gizli kanalda yalnızca seçtiğin roller ve yetkili yöneticiler erişebilir." icon={Shield}>
            <div className="space-y-2.5">
              <SettingSwitch checked={isPrivate} onChange={setIsPrivate} label="Gizli kanal" description="Kanalı genel listeden gizle ve rol bazlı erişim uygula." icon={LockKeyhole} />
              {!isVoice && <SettingSwitch checked={nsfw} onChange={setNsfw} label="18+ içerik" description="Yetişkin içerik uyarısını kanal başlığında göster." icon={Flame} tone="rose" />}
            </div>
            {isPrivate && <div className="mt-3 rounded-2xl border border-violet-200/10 bg-violet-300/[0.035] p-3.5"><div className="mb-3 flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-violet-100/80">Erişebilecek roller</p><span className="rounded-full bg-violet-200/10 px-2 py-1 text-[9px] text-violet-100">{visibleRoleIds.length} seçili</span></div>{roles.length ? <div className="flex flex-wrap gap-2">{roles.map((role) => { const selected = visibleRoleIds.includes(role.id); return <button key={role.id} type="button" aria-pressed={selected} onClick={() => setRoleAllowed(role.id, !selected)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-semibold transition ${selected ? 'border-violet-200/20 bg-violet-300/[0.11]' : 'border-white/[0.07] bg-black/10 opacity-70 hover:opacity-100'}`} style={{ color: selected ? role.gradient_color || role.color : undefined, borderColor: selected ? `${role.color}55` : undefined }}><span className="inline-grid h-4 w-4 place-items-center">{role.emoji ? <RoleEmoji value={role.emoji} className="h-3.5 w-3.5" /> : <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: role.color }} />}</span><span>{role.name}</span><span className={`ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full ${selected ? 'bg-violet-200/15 text-violet-100' : 'border border-white/15 text-transparent'}`}>{selected && <Check className="h-2.5 w-2.5" />}</span></button>; })}</div> : <p className="text-[10px] leading-4 text-slate-500">Henüz özel rol yok. Rol oluşturduktan sonra buradan erişim verebilirsin.</p>}</div>}
          </ChannelSection>

          {!isVoice && <ChannelSection eyebrow="Sohbet davranışı" title="Yazışma ayarları" description="Yoğun kanallarda mesaj akışını daha rahat yönet." icon={Settings2}>
            <div className="max-w-sm"><label className="block text-xs font-semibold text-slate-300">Yavaş mod<AnimatedSelect value={slowmodeSeconds} onValueChange={(value) => setSlowmodeSeconds(Number(value))} ariaLabel="Yavaş mod süresi" options={[{ value: 0, label: 'Kapalı' }, { value: 5, label: '5 saniye' }, { value: 10, label: '10 saniye' }, { value: 30, label: '30 saniye' }, { value: 60, label: '1 dakika' }, { value: 300, label: '5 dakika' }]} className="mt-1.5 w-full" /></label><p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500"><Sparkles className="h-3 w-3 text-violet-200/70" />Üyeler mesajlar arasında seçilen süre kadar bekler.</p></div>
          </ChannelSection>}

          {error && <p role="alert" className="rounded-xl border border-rose-300/15 bg-rose-300/[0.06] px-3.5 py-3 text-xs leading-5 text-rose-200">{error}</p>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-white/[0.07] bg-black/15 px-4 py-3.5 sm:px-6"><p className="hidden text-[10px] text-slate-500 sm:block">Değişiklikler kaydedildiğinde kanala anında uygulanır.</p><div className="ml-auto flex gap-2"><button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.05] hover:text-white">Vazgeç</button><button type="submit" disabled={!name.trim() || busy} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_24px_rgba(111,100,245,.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Değişiklikleri kaydet</button></div></footer>
      </form>
    </section>
  </div>;
}
