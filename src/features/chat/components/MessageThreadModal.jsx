import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquareText, Send, X } from 'lucide-react';
import { getAvatarUrl } from '../../../lib/profileMedia';
import { supabase } from '../../../lib/supabase';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function MessageThreadModal({ message, channelId, user, onClose }) {
  const [thread, setThread] = useState(null);
  const [replies, setReplies] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEscapeClose(onClose, !busy);

  const loadReplies = useCallback(async (threadId) => {
    const { data, error } = await supabase.from('message_thread_replies').select('*').eq('thread_id', threadId).order('created_at').limit(100);
    if (error) setNotice('Yanıtlar yüklenemedi. migration_community_features.sql dosyasını kontrol et.');
    else {
      const authorIds = [...new Set((data || []).map((reply) => reply.user_id))];
      const { data: profiles } = authorIds.length ? await supabase.from('profiles').select('id,username,avatar_url').in('id', authorIds) : { data: [] };
      const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      setReplies((data || []).map((reply) => ({ ...reply, profiles: profileById.get(reply.user_id) })));
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      let { data: current } = await supabase.from('message_threads').select('*').eq('root_message_id', message.id).maybeSingle();
      if (!current) {
        const { data: created } = await supabase.from('message_threads').insert({ root_message_id: message.id, channel_id: channelId, created_by: user.id }).select('*').single();
        current = created;
      }
      if (!active) return;
      if (!current) { setNotice('Başlık açılamadı. Üyeliği ve migration_community_features.sql dosyasını kontrol et.'); return; }
      setThread(current);
      await loadReplies(current.id);
    };
    void initialize();
    return () => { active = false; };
  }, [message.id, channelId, user.id, loadReplies]);

  useEffect(() => {
    if (!thread?.id) return undefined;
    const channel = supabase.channel(`thread-replies:${thread.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'message_thread_replies', filter: `thread_id=eq.${thread.id}` }, () => { void loadReplies(thread.id); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [thread?.id, loadReplies]);

  const sendReply = async (event) => {
    event.preventDefault();
    if (!draft.trim() || !thread || busy) return;
    setBusy(true);
    const { error } = await supabase.from('message_thread_replies').insert({ thread_id: thread.id, user_id: user.id, content: draft.trim() });
    if (error) setNotice('Yanıt gönderilemedi. Tekrar dene.');
    else { setDraft(''); void loadReplies(thread.id); }
    setBusy(false);
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="thread-title" onClick={onClose} className="fixed inset-0 z-[230] flex justify-end bg-black/55 backdrop-blur-sm"><section onClick={(event) => event.stopPropagation()} className="flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-[#10151f]/98 shadow-2xl"><header className="flex items-center gap-3 border-b border-white/[0.07] p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-400/10 text-violet-200"><MessageSquareText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-200/70">Kanal başlığı</p><h2 id="thread-title" className="text-base font-bold text-white">Yanıtlar</h2></div><button onClick={onClose} aria-label="Başlığı kapat" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></header><div className="flex-1 overflow-y-auto p-5"><article className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.05] p-4"><p className="text-xs font-semibold text-violet-100">{message.profiles?.username || 'Kullanıcı'}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{message.content || 'Ekli mesaj'}</p></article><div className="my-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500"><span className="h-px flex-1 bg-white/[0.07]" />{replies.length} yanıt<span className="h-px flex-1 bg-white/[0.07]" /></div>{!thread && !notice && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-violet-200" /></div>}<div className="space-y-4">{replies.map((reply) => <article key={reply.id} className="flex gap-3"><img src={getAvatarUrl(reply.profiles?.avatar_url, reply.profiles?.username)} alt="" className="h-8 w-8 rounded-full object-cover" /><div className="min-w-0 flex-1 rounded-2xl bg-white/[0.035] px-3.5 py-2.5"><div className="flex items-center justify-between gap-2"><b className="truncate text-xs text-slate-200">{reply.profiles?.username || 'Kullanıcı'}</b><time className="text-[10px] text-slate-500">{new Date(reply.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">{reply.content}</p></div></article>)}</div>{notice && <p role="status" className="mt-4 text-xs text-amber-200">{notice}</p>}</div><form onSubmit={sendReply} className="flex gap-2 border-t border-white/[0.07] p-4"><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder="Başlığa yanıt yaz…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-slate-500" /><button disabled={!draft.trim() || busy || !thread} aria-label="Yanıt gönder" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500 text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></form></section></div>;
}
