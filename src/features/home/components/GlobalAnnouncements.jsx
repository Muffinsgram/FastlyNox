import { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, Megaphone, Send, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getAvatarUrl } from '../../../lib/profileMedia';

export function GlobalAnnouncements({ user }) {
  const [announcements, setAnnouncements] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');

  const fetchAnnouncements = useCallback(async () => {
    const { data, error } = await supabase.from('global_announcements')
      .select('id,title,body,author_id,created_at,profiles:author_id(username,avatar_url)')
      .order('created_at', { ascending: false }).limit(50);
    if (error) {
      setNotice(/global_announcements|schema cache|does not exist/i.test(error.message)
        ? 'Duyuru panosu için migration_global_announcements.sql dosyasını Supabase SQL Editor’da çalıştır.'
        : error.message);
    } else {
      setAnnouncements(data || []);
      setNotice('');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const checkAdmin = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase.from('app_admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (alive && !error) setIsAdmin(Boolean(data));
    };
    void checkAdmin();
    const initialFetch = window.setTimeout(() => { void fetchAnnouncements(); }, 0);
    const channel = supabase.channel('global-announcements-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_announcements' }, () => { void fetchAnnouncements(); })
      .subscribe();
    return () => {
      alive = false;
      window.clearTimeout(initialFetch);
      void supabase.removeChannel(channel);
    };
  }, [fetchAnnouncements, user?.id]);

  const publish = async event => {
    event.preventDefault();
    if (!isAdmin || !title.trim() || !body.trim() || isPublishing) return;
    setIsPublishing(true);
    setNotice('');
    const { error } = await supabase.from('global_announcements').insert({
      title: title.trim(), body: body.trim(), author_id: user.id,
    });
    setIsPublishing(false);
    if (error) { setNotice(error.message); return; }
    setTitle('');
    setBody('');
    setNotice('Duyuru yayınlandı; tüm Fastlynox kullanıcılarına anında iletildi.');
    void fetchAnnouncements();
  };

  const remove = async announcementId => {
    const { error } = await supabase.from('global_announcements').delete().eq('id', announcementId);
    if (error) setNotice(error.message);
    else setAnnouncements(items => items.filter(item => item.id !== announcementId));
  };

  return (
    <section className="mx-auto w-full max-w-4xl pb-10">
      <header className="mb-7 flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-200/15 bg-amber-300/[0.08] text-amber-200 shadow-[0_10px_30px_rgba(251,191,36,.08)]"><Megaphone className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-200/70">Fastlynox duyuru merkezi</p><h1 className="mt-1 text-2xl font-bold text-white">Herkes için güncellemeler</h1><p className="mt-1 text-sm text-slate-400">Uygulama duyuruları yayınlanır yayınlanmaz tüm kullanıcılara ulaşır.</p></div>
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1.5 text-[11px] font-medium text-emerald-200 sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Canlı akış</span>
      </header>

      {isAdmin && <form onSubmit={publish} className="mb-6 rounded-[22px] border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.08] to-cyan-300/[0.025] p-4 shadow-[0_20px_55px_rgba(0,0,0,.18)] sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-violet-100"><BellRing className="h-4 w-4" /> Yeni uygulama duyurusu</div>
        <input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="Kısa ve net bir başlık" aria-label="Duyuru başlığı" className="mb-2 w-full rounded-xl border border-white/10 bg-[#090d14]/70 px-3.5 py-3 text-sm font-semibold text-white outline-none placeholder:font-normal placeholder:text-slate-500 focus:border-violet-300/35" />
        <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={5000} rows={4} placeholder="Fastlynox topluluğuna ne duyurmak istiyorsun?" aria-label="Duyuru metni" className="w-full resize-y rounded-xl border border-white/10 bg-[#090d14]/70 px-3.5 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-300/35" />
        <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] text-slate-500">{body.length}/5000 · Her kullanıcı bu duyuruyu görebilir</span><button type="submit" disabled={!title.trim() || !body.trim() || isPublishing} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:bg-violet-400 disabled:opacity-40">{isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{isPublishing ? 'Yayınlanıyor…' : 'Duyuruyu yayınla'}</button></div>
      </form>}

      {notice && <p role="status" className={`mb-4 rounded-xl border px-3 py-2.5 text-xs ${notice.includes('yayınlandı') ? 'border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200' : 'border-amber-300/15 bg-amber-300/[0.04] text-amber-100'}`}>{notice}</p>}

      {isLoading ? <div className="space-y-3" aria-label="Duyurular yükleniyor"><div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" /><div className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" /></div>
        : announcements.length === 0 ? <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] px-6 py-16 text-center"><Megaphone className="mx-auto mb-3 h-7 w-7 text-slate-600" /><h2 className="text-sm font-semibold text-slate-300">Şimdilik duyuru yok</h2><p className="mt-1 text-xs text-slate-500">Yeni gelişmeler bu alanda görünecek.</p></div>
          : <div className="space-y-3">{announcements.map(announcement => <article key={announcement.id} className="group relative overflow-hidden rounded-[22px] border border-white/[0.075] bg-white/[0.025] p-5 shadow-[0_12px_40px_rgba(0,0,0,.12)] transition hover:border-amber-200/15 hover:bg-white/[0.035] sm:p-6"><div className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-amber-200/70 via-violet-300/50 to-transparent" /><div className="flex items-center gap-2.5"><img src={getAvatarUrl(announcement.profiles?.avatar_url, announcement.profiles?.username || 'Fastlynox')} alt="" className="h-8 w-8 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">{announcement.profiles?.username || 'Fastlynox ekibi'}</p><time className="text-[10px] text-slate-500" dateTime={announcement.created_at}>{new Date(announcement.created_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><span className="rounded-full bg-amber-300/[0.08] px-2.5 py-1 text-[10px] font-semibold text-amber-100">DUYURU</span>{isAdmin && <button type="button" onClick={() => void remove(announcement.id)} aria-label="Duyuruyu sil" className="rounded-lg p-2 text-slate-500 opacity-0 transition hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"><Trash2 className="h-4 w-4" /></button>}</div><h2 className="mt-4 text-lg font-semibold tracking-tight text-white">{announcement.title}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{announcement.body}</p></article>)}</div>}
    </section>
  );
}
