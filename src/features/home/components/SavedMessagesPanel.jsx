import { useEffect, useState } from 'react';
import { Bookmark, MessageSquare, Hash, Trash2, Search } from 'lucide-react';
import { readSavedMessages, removeSavedMessage } from '../../../lib/savedMessages';

export function SavedMessagesPanel({ user }) {
  const [savedMessages, setSavedMessages] = useState(() => readSavedMessages(user?.id));
  const [query, setQuery] = useState('');

  useEffect(() => {
    const refresh = (event) => {
      if (!event?.detail?.userId || event.detail.userId === user?.id) setSavedMessages(readSavedMessages(user?.id));
    };
    globalThis.addEventListener?.('fastcord:saved-messages-changed', refresh);
    return () => globalThis.removeEventListener?.('fastcord:saved-messages-changed', refresh);
  }, [user?.id]);

  const filtered = savedMessages.filter((item) => `${item.content || ''} ${item.author || ''}`.toLocaleLowerCase('tr').includes(query.trim().toLocaleLowerCase('tr')));

  return (
    <div className="mx-auto max-w-4xl animate-in fade-in duration-300">
      <header className="mb-7 flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-200/15 bg-violet-300/[0.08] text-violet-100"><Bookmark className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-violet-200/70">Kişisel alanın</p><h1 className="mt-1 text-2xl font-bold text-white">Kaydedilen mesajlar</h1><p className="mt-1 text-sm text-slate-400">Sonra dönmek istediğin mesajlar bu cihazda saklanır.</p></div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">{savedMessages.length} kayıt</span>
      </header>
      <label className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-slate-400 focus-within:border-violet-300/40"><Search className="h-4 w-4 shrink-0" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kaydedilenlerde ara" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></label>
      {filtered.length ? <div className="space-y-2">{filtered.map((message) => <article key={message.id} className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition hover:border-violet-200/20 hover:bg-white/[0.04]"><div className="flex items-start gap-3"><div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-slate-400">{message.source_type === 'dm' ? <MessageSquare className="h-4 w-4" /> : <Hash className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm text-slate-100">{message.author || 'Kullanıcı'}</strong><span className="text-[11px] text-slate-500">{message.channel_name || (message.source_type === 'dm' ? 'Özel mesaj' : 'Sunucu mesajı')}</span><time className="ml-auto text-[10px] text-slate-500">{message.created_at ? new Date(message.created_at).toLocaleString('tr-TR') : ''}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{message.content || 'Ekli medya'}</p>{message.image_url && <p className="mt-2 text-xs text-violet-200">Mesajda medya eki var</p>}</div><button type="button" aria-label="Kaydedilen mesajı kaldır" title="Kaydı kaldır" onClick={() => removeSavedMessage(user?.id, message.id)} className="rounded-lg p-2 text-slate-500 opacity-0 transition hover:bg-rose-400/10 hover:text-rose-200 group-hover:opacity-100 focus:opacity-100"><Trash2 className="h-4 w-4" /></button></div></article>)}</div> : <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center"><Bookmark className="mx-auto mb-3 h-8 w-8 text-slate-600" /><p className="font-semibold text-slate-300">{query ? 'Eşleşen kayıt bulunamadı' : 'Henüz kayıtlı mesaj yok'}</p><p className="mt-1 text-sm text-slate-500">Bir mesajın üzerindeki yer imi düğmesiyle buraya ekleyebilirsin.</p></div>}
    </div>
  );
}
