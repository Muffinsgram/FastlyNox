import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function ScheduleMessageModal({ channelId, userId, content, onClose, onScheduled }) {
  const [localMinimum] = useState(() => {
    const min = new Date(Date.now() + 60_000);
    return new Date(min.getTime() - min.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [sendAt, setSendAt] = useState(localMinimum);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [scheduledRows, setScheduledRows] = useState([]);
  useEscapeClose(onClose, !busy);
  const refreshScheduledRows = useCallback(async () => {
    const { data } = await supabase.from('scheduled_messages').select('id,content,send_at').eq('channel_id', channelId).eq('user_id', userId).is('sent_at', null).order('send_at').limit(20);
    setScheduledRows(data || []);
  }, [channelId, userId]);
  useEffect(() => { void refreshScheduledRows(); }, [refreshScheduledRows]);
  const submit = async (event) => {
    event.preventDefault();
    if (busy || new Date(sendAt).getTime() <= Date.now()) return;
    setBusy(true);
    const { error } = await supabase.from('scheduled_messages').insert({ channel_id: channelId, user_id: userId, content: content.trim(), send_at: new Date(sendAt).toISOString() });
    if (error) setErrorMessage('Zamanlama kaydedilemedi. Supabase’de migration_community_features.sql dosyasını çalıştır.');
    else { onScheduled(); onClose(); }
    setBusy(false);
  };
  return <div role="dialog" aria-modal="true" aria-labelledby="schedule-title" onClick={onClose} className="fixed inset-0 z-[230] grid place-items-center bg-black/70 p-4 backdrop-blur-md"><section onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[24px] border border-white/10 bg-[#111722]/95 p-5 shadow-2xl"><header className="mb-4 flex items-center gap-3"><CalendarClock className="h-5 w-5 text-cyan-200" /><h2 id="schedule-title" className="flex-1 font-bold text-white">Zamanlanmış mesajlar</h2><button type="button" onClick={onClose} aria-label="Zamanlamayı kapat" className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button></header>{content.trim() ? <form onSubmit={submit} className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3"><p className="mb-3 line-clamp-3 rounded-xl bg-black/20 p-3 text-sm text-slate-300">{content}</p><label className="mb-1.5 block text-xs font-semibold text-slate-400">Gönderim zamanı</label><input type="datetime-local" min={localMinimum} required value={sendAt} onChange={(event) => setSendAt(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-100" />{errorMessage && <p role="alert" className="mt-3 text-xs text-rose-300">{errorMessage}</p>}<button disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}Zamanlamayı kaydet</button><p className="mt-2 text-center text-[10px] text-slate-500">Fastlynox açık ve çevrimiçiyken gönderilir.</p></form> : <p className="mb-4 rounded-xl border border-dashed border-white/10 p-3 text-xs text-slate-500">Mesaj alanına yazıp takvim düğmesine basarak yeni bir mesaj zamanlayabilirsin.</p>}<div className="space-y-2">{scheduledRows.map((row) => <article key={row.id} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-black/15 p-3"><div className="min-w-0 flex-1"><p className="line-clamp-2 break-words text-xs text-slate-200">{row.content}</p><time className="mt-1 block text-[10px] text-cyan-100/70">{new Date(row.send_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><button type="button" disabled={busy} onClick={async () => { const { error } = await supabase.from('scheduled_messages').delete().eq('id', row.id).eq('user_id', userId); if (error) setErrorMessage('Zamanlanmış mesaj silinemedi.'); else void refreshScheduledRows(); }} className="rounded-lg px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-300/10">İptal</button></article>)}{scheduledRows.length === 0 && <p className="text-center text-xs text-slate-500">Bekleyen mesaj yok.</p>}</div></section></div>;
}
