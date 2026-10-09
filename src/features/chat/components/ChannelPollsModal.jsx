import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Check, Loader2, Plus, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function ChannelPollsModal({ channelId, serverId, userId, onClose }) {
  const [polls, setPolls] = useState([]);
  const [votes, setVotes] = useState({});
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEscapeClose(onClose);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('channel_polls').select('*').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(30);
    if (error) { setNotice('Anketler açılamadı. Supabase’de migration_community_features.sql dosyasını çalıştır.'); return; }
    setPolls(data || []);
    if (!data?.length) { setVotes({}); return; }
    const { data: voteRows } = await supabase.from('channel_poll_votes').select('poll_id,user_id,option_index').in('poll_id', data.map((poll) => poll.id));
    const grouped = {};
    (voteRows || []).forEach((vote) => { (grouped[vote.poll_id] ||= []).push(vote); });
    setVotes(grouped);
  }, [channelId]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`polls:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_polls', filter: `channel_id=eq.${channelId}` }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_poll_votes' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [channelId, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const createPoll = async (event) => {
    event.preventDefault();
    const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2 || busy) return;
    setBusy(true);
    const { error } = await supabase.from('channel_polls').insert({ channel_id: channelId, server_id: serverId, creator_id: userId, question: question.trim(), options: cleanOptions });
    if (error) setNotice('Anket oluşturulamadı. Sunucu izinlerini ve migration dosyasını kontrol et.');
    else { setQuestion(''); setOptions(['', '']); setNotice('Anket kanala eklendi.'); void refresh(); }
    setBusy(false);
  };

  const castVote = async (poll, optionIndex) => {
    const { error } = await supabase.from('channel_poll_votes').upsert({ poll_id: poll.id, user_id: userId, option_index: optionIndex }, { onConflict: 'poll_id,user_id' });
    if (error) setNotice('Oy kaydedilemedi. Anket kapanmış olabilir.');
    else void refresh();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="polls-title" onClick={onClose} className="fixed inset-0 z-[230] grid place-items-center bg-black/70 p-4 backdrop-blur-md">
      <section onClick={(event) => event.stopPropagation()} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-white/10 bg-[#111722]/95 p-5 shadow-2xl backdrop-blur-2xl sm:p-7">
        <header className="mb-5 flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-400/10 text-violet-200"><BarChart3 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-200/70">Kanal etkileşimi</p><h2 id="polls-title" className="mt-1 text-xl font-bold text-white">Anketler</h2></div><button onClick={onClose} aria-label="Anketleri kapat" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></header>
        <form onSubmit={createPoll} className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><label className="mb-2 block text-xs font-semibold text-slate-300">Yeni anket</label><input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="Ne hakkında oylama yapalım?" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white placeholder:text-slate-500" /><div className="mt-2 space-y-2">{options.map((option, index) => <input key={index} value={option} onChange={(event) => setOptions((current) => current.map((value, item) => item === index ? event.target.value : value))} maxLength={120} placeholder={`Seçenek ${index + 1}`} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-slate-500" />)}</div><div className="mt-3 flex items-center justify-between"><button type="button" disabled={options.length >= 8} onClick={() => setOptions((current) => [...current, ''])} className="text-xs font-semibold text-violet-200 hover:text-white disabled:opacity-40">+ Seçenek ekle</button><button disabled={busy || !question.trim()} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Anket oluştur</button></div></form>
        {notice && <p role="status" className="mb-4 text-xs text-slate-300">{notice}</p>}
        <div className="space-y-3">{polls.map((poll) => {
          const pollVotes = votes[poll.id] || [];
          const ownVote = pollVotes.find((vote) => vote.user_id === userId)?.option_index;
          const closed = poll.closes_at && Date.parse(poll.closes_at) <= now;
          return <article key={poll.id} className="rounded-2xl border border-white/[0.08] bg-black/15 p-4"><h3 className="font-semibold text-white">{poll.question}</h3><div className="mt-3 space-y-2">{poll.options.map((option, index) => { const count = pollVotes.filter((vote) => vote.option_index === index).length; const percent = pollVotes.length ? Math.round(count * 100 / pollVotes.length) : 0; return <button key={`${poll.id}-${index}`} disabled={closed} onClick={() => void castVote(poll, index)} className={`relative flex w-full items-center justify-between overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm ${ownVote === index ? 'border-violet-300/30 text-violet-100' : 'border-white/[0.07] text-slate-300'} disabled:cursor-default`}><span className="absolute inset-y-0 left-0 bg-violet-400/10 transition-[width]" style={{ width: `${percent}%` }} /><span className="relative z-[1]">{option}</span><span className="relative z-[1] flex items-center gap-1 text-xs text-slate-400">{ownVote === index && <Check className="h-3.5 w-3.5 text-violet-200" />}{count} · {percent}%</span></button>; })}</div><p className="mt-2 text-[10px] text-slate-500">{pollVotes.length} oy{closed ? ' · Kapandı' : ' · Oyunu değiştirebilirsin'}</p></article>;
        })}{polls.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">Henüz anket yok.</p>}</div>
      </section>
    </div>
  );
}
