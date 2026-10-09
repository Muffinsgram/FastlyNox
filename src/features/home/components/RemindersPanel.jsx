import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, Check, Clock3, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const getLocalDateTime = (offsetMinutes = 30) => {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const MINIMUM_DUE_AT = getLocalDateTime(1);
const toIsoTimestamp = () => new Date().toISOString();
const formatReminderTime = value => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function RemindersPanel({ user }) {
  const [reminders, setReminders] = useState([]);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(getLocalDateTime());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [notificationPermission, setNotificationPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('user_reminders').select('*').eq('user_id', user.id).order('due_at', { ascending: true });
    if (error) setNotice(/user_reminders|schema cache|does not exist/i.test(error.message) ? 'Hatırlatıcılar için migration_global_announcements.sql dosyasını Supabase SQL Editor’da çalıştır.' : error.message);
    else { setReminders(data || []); setNotice(''); }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => { void refresh(); }, 0);
    if (!user?.id) return undefined;
    const channel = supabase.channel(`reminders:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_reminders', filter: `user_id=eq.${user.id}` }, () => { void refresh(); })
      .subscribe();
    return () => { window.clearTimeout(initialFetch); void supabase.removeChannel(channel); };
  }, [refresh, user]);

  useEffect(() => {
    const notify = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const now = Date.now();
      for (const reminder of reminders) {
        if (reminder.completed_at || new Date(reminder.due_at).getTime() > now) continue;
        const key = `fastcord-reminder:${reminder.id}`;
        if (localStorage.getItem(key)) continue;
        new Notification('Fastlynox hatırlatıcısı', { body: reminder.title, tag: key, icon: '/favicon.ico' });
        localStorage.setItem(key, '1');
      }
    };
    notify();
    const timer = setInterval(notify, 30_000);
    return () => clearInterval(timer);
  }, [reminders]);

  const createReminder = async event => {
    event.preventDefault();
    if (!title.trim() || !dueAt || isSaving) return;
    setIsSaving(true);
    setNotice('');
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
    const { error } = await supabase.from('user_reminders').insert({ user_id: user.id, title: title.trim(), due_at: new Date(dueAt).toISOString() });
    setIsSaving(false);
    if (error) { setNotice(error.message); return; }
    setTitle('');
    setDueAt(getLocalDateTime());
    void refresh();
  };

  const complete = async reminder => {
    const completedAt = reminder.completed_at ? null : toIsoTimestamp();
    const { error } = await supabase.from('user_reminders').update({ completed_at: completedAt }).eq('id', reminder.id).eq('user_id', user.id);
    if (error) setNotice(error.message);
    else { localStorage.removeItem(`fastcord-reminder:${reminder.id}`); void refresh(); }
  };

  const remove = async reminder => {
    const { error } = await supabase.from('user_reminders').delete().eq('id', reminder.id).eq('user_id', user.id);
    if (error) setNotice(error.message);
    else { localStorage.removeItem(`fastcord-reminder:${reminder.id}`); setReminders(items => items.filter(item => item.id !== reminder.id)); }
  };

  const pending = reminders.filter(reminder => !reminder.completed_at);
  const completed = reminders.filter(reminder => reminder.completed_at);

  return (
    <section className="mx-auto w-full max-w-3xl pb-10">
      <header className="mb-7 flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-200/15 bg-cyan-300/[0.08] text-cyan-100"><Clock3 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">Kişisel alanın</p><h1 className="mt-1 text-2xl font-bold text-white">Hatırlatıcılar</h1><p className="mt-1 text-sm text-slate-400">Küçük işler aklında kalsın; zamanı gelince bildirim al.</p></div><span title={notificationPermission === 'granted' ? 'Bildirimler açık' : 'Bildirim izni kapalı'} className={`mt-1 rounded-full border px-3 py-1.5 text-[11px] ${notificationPermission === 'granted' ? 'border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200' : 'border-white/10 bg-white/[0.03] text-slate-400'}`}><Bell className="mr-1 inline h-3.5 w-3.5" />{notificationPermission === 'granted' ? 'Bildirim açık' : notificationPermission === 'unsupported' ? 'Bildirim desteklenmiyor' : 'Bildirim izni bekliyor'}</span></header>

      <form onSubmit={createReminder} className="mb-7 rounded-[22px] border border-cyan-200/10 bg-gradient-to-br from-cyan-300/[0.06] to-violet-400/[0.025] p-4 sm:p-5"><div className="mb-3 text-sm font-semibold text-slate-100">Yeni hatırlatıcı</div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]"><input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Örn. toplantı notlarını gönder" aria-label="Hatırlatıcı adı" className="min-w-0 rounded-xl border border-white/10 bg-[#090d14]/70 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/35" /><input type="datetime-local" value={dueAt} min={MINIMUM_DUE_AT} onChange={event => setDueAt(event.target.value)} aria-label="Hatırlatma zamanı" className="min-w-0 rounded-xl border border-white/10 bg-[#090d14]/70 px-3 py-3 text-xs text-slate-200 outline-none focus:border-cyan-200/35" /><button type="submit" disabled={!title.trim() || !dueAt || isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300/15 px-4 py-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/25 disabled:opacity-40">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ekle</button></div></form>

      {notice && <p role="status" className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2.5 text-xs text-amber-100">{notice}</p>}
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[.16em] text-slate-500">Yaklaşanlar · {pending.length}</h2>
      {isLoading ? <div className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" /> : pending.length === 0 ? <div className="mb-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">Ajandan şimdilik boş. Bir hatırlatıcı ekle.</div> : <div className="mb-7 space-y-2">{pending.map(reminder => <article key={reminder.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 transition"><button type="button" onClick={() => void complete(reminder)} aria-label="Hatırlatıcıyı tamamla" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-400 hover:border-emerald-200/25 hover:bg-emerald-300/10 hover:text-emerald-200"><Check className="h-4 w-4" /></button><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium text-slate-100">{reminder.title}</h3><p className="mt-1 text-[11px] text-slate-500">{formatReminderTime(reminder.due_at)}</p></div><BellRing className="h-4 w-4 text-cyan-200/70" /><button type="button" onClick={() => void remove(reminder)} aria-label="Hatırlatıcıyı sil" className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-200"><Trash2 className="h-4 w-4" /></button></article>)}</div>}
      {completed.length > 0 && <><h2 className="mb-3 text-[11px] font-bold uppercase tracking-[.16em] text-slate-500">Tamamlanan · {completed.length}</h2><div className="space-y-2">{completed.slice(0, 20).map(reminder => <article key={reminder.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-3 opacity-65"><button type="button" onClick={() => void complete(reminder)} aria-label="Hatırlatıcıyı yeniden aç" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200"><Check className="h-4 w-4" /></button><span className="min-w-0 flex-1 truncate text-sm text-slate-300 line-through">{reminder.title}</span><button type="button" onClick={() => void remove(reminder)} aria-label="Hatırlatıcıyı sil" className="rounded-lg p-2 text-slate-500 hover:text-rose-200"><Trash2 className="h-4 w-4" /></button></article>)}</div></>}
    </section>
  );
}
