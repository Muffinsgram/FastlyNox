import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, CalendarClock, CalendarDays, Check, Clock3, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useServerStore } from '../../../store/useServerStore';
import { hasEventReminder, toggleEventReminder } from '../../../lib/eventReminders';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';

const asLocalInput = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function ServerEventsPanel({ user, onOpenChannel, serverFilterId = null }) {
  const servers = useServerStore((state) => state.servers);
  const [events, setEvents] = useState([]);
  const [rsvps, setRsvps] = useState({});
  const [serverId, setServerId] = useState(serverFilterId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => asLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [channelId, setChannelId] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [reminderRevision, setReminderRevision] = useState(0);
  const reminderIds = new Set(events.filter((event) => hasEventReminder(event.id)).map((event) => event.id));
  const serverMap = useMemo(() => new Map(servers.map((server) => [server.id, server])), [servers]);
  const selectedServerId = serverFilterId || serverId;
  const selectedServer = serverMap.get(selectedServerId);
  const textChannels = (selectedServer?.categories || []).flatMap((category) => category.channels || []).filter((channel) => channel.type === 'text');

  const refresh = useCallback(async () => {
    const serverIds = serverFilterId ? [serverFilterId] : servers.map((server) => server.id);
    if (!serverIds.length) { setEvents([]); return; }
    const { data, error } = await supabase.from('server_events').select('*').in('server_id', serverIds).gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).order('starts_at').limit(100);
    if (error) { setNotice('Etkinlikler yüklenemedi. Supabase’de migration_community_features.sql dosyasını çalıştır.'); return; }
    setEvents(data || []);
    const eventIds = (data || []).map((event) => event.id);
    if (!eventIds.length) { setRsvps({}); return; }
    const { data: responseRows } = await supabase.from('server_event_rsvps').select('event_id,user_id,status').in('event_id', eventIds);
    const next = {};
    (responseRows || []).forEach((row) => { (next[row.event_id] ||= []).push(row); });
    setRsvps(next);
  }, [servers, serverFilterId]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel('community-server-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_events' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_event_rsvps' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const toggleReminder = async (event) => {
    if (!hasEventReminder(event.id)) {
      if (typeof Notification === 'undefined') { setNotice('Bu tarayıcı sistem bildirimi desteklemiyor.'); return; }
      if (Notification.permission === 'denied') { setNotice('Bildirim izni kapalı. Tarayıcı ayarlarından Fastlynox bildirimlerine izin ver.'); return; }
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { setNotice('Etkinlik hatırlatması için tarayıcı bildirim iznini açmalısın.'); return; }
      }
    }
    const enabled = toggleEventReminder(event);
    setReminderRevision((value) => value + 1);
    setNotice(enabled ? 'Uygulama açıkken etkinlikten 10 dakika önce bu cihazda hatırlatacağım.' : 'Etkinlik hatırlatıcısı kaldırıldı.');
  };

  const publishEvent = async (event) => {
    event.preventDefault();
    const destinationServerId = serverFilterId || serverId;
    if (!destinationServerId) { setNotice('Etkinlik için önce bir sunucu seç.'); return; }
    if (!title.trim() || !startsAt || saving) return;
    setSaving(true);
    setNotice('');
    const { error } = await supabase.from('server_events').insert({ server_id: destinationServerId, channel_id: channelId || null, creator_id: user.id, title: title.trim(), description: description.trim(), starts_at: new Date(startsAt).toISOString() });
    if (error) setNotice('Etkinlik oluşturulamadı. Sunucu üyeliğini ve migration_community_features.sql dosyasını kontrol et.');
    else { setTitle(''); setDescription(''); setChannelId(''); setNotice('Etkinlik sunucuyla paylaşıldı.'); void refresh(); }
    setSaving(false);
  };

  const respond = async (eventId, status) => {
    const current = rsvps[eventId]?.find((item) => item.user_id === user?.id);
    const query = current?.status === status
      ? supabase.from('server_event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id)
      : supabase.from('server_event_rsvps').upsert({ event_id: eventId, user_id: user.id, status }, { onConflict: 'event_id,user_id' });
    const { error } = await query;
    if (error) setNotice('Katılım yanıtı kaydedilemedi. Veritabanı migration’ını kontrol et.');
    else void refresh();
  };

  const removeEvent = async (eventId) => {
    const { error } = await supabase.from('server_events').delete().eq('id', eventId);
    if (error) setNotice('Etkinlik silinemedi; yalnızca oluşturan kişi veya sunucu yöneticisi silebilir.');
    else void refresh();
  };

  return (
    <section className="mx-auto w-full max-w-4xl pb-10">
      <header className="mb-6 flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-200/15 bg-cyan-300/[0.08] text-cyan-100"><CalendarDays className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">Topluluk takvimi</p><h1 className="mt-1 text-2xl font-bold text-white">Sunucu etkinlikleri</h1><p className="mt-1 text-sm text-slate-400">Planları paylaşın, katılımı görün ve buluşmayı kaçırmayın.</p></div></header>
      <form onSubmit={publishEvent} className="mb-6 rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white"><Plus className="h-4 w-4 text-cyan-200" /> Etkinlik oluştur</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {serverFilterId ? <div className="flex items-center rounded-xl border border-cyan-200/10 bg-cyan-300/[0.05] px-3 py-2.5 text-sm font-semibold text-cyan-100">{selectedServer?.name || 'Bu sunucu'}</div> : <AnimatedSelect ariaLabel="Etkinlik sunucusu" value={serverId} onValueChange={(value) => { setServerId(value); setChannelId(''); }} placeholder="Sunucu seç" options={[{ value: '', label: 'Sunucu seç' }, ...servers.map((server) => ({ value: server.id, label: server.name }))]} className="w-full" />}
          <input required value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Etkinlik adı" className="rounded-xl border border-white/10 bg-[#0a0e15] px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />
          <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="rounded-xl border border-white/10 bg-[#0a0e15] px-3 py-2.5 text-sm text-slate-200" />
          <AnimatedSelect ariaLabel="Etkinliği kanala bağla" value={channelId} onValueChange={setChannelId} placeholder="Kanala bağlama (isteğe bağlı)" options={[{ value: '', label: 'Kanala bağlama (isteğe bağlı)' }, ...textChannels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))]} className="w-full" />
        </div>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={2} placeholder="Etkinlik ayrıntıları" className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-[#0a0e15] px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />
        <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Saat, bulunduğun saat dilimine göre kaydedilir.</span><button disabled={saving || !(serverFilterId || servers.length)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Etkinliği paylaş</button></div>
      </form>
      {notice && <p role="status" className="mb-4 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-xs text-slate-300">{notice}</p>}
      <div className="space-y-3">{events.map((event) => {
        const server = serverMap.get(event.server_id);
        const responses = rsvps[event.id] || [];
        const ownStatus = responses.find((item) => item.user_id === user?.id)?.status;
        const mayDelete = event.creator_id === user?.id || ['owner', 'admin'].includes(server?.member_role);
        const linkedChannel = (server?.categories || []).flatMap((category) => category.channels || []).find((channel) => channel.id === event.channel_id);
        return <article key={event.id} data-reminder-revision={reminderRevision} className="rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200/10 bg-cyan-300/[0.07] text-cyan-100"><CalendarClock className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-100/70">{server?.name || 'Sunucu etkinliği'}</p><h2 className="mt-1 break-words text-base font-bold text-white">{event.title}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5" />{new Date(event.starts_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</p>{event.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{event.description}</p>}{linkedChannel && <button type="button" onClick={() => onOpenChannel?.(event.server_id, event.channel_id)} className="mt-3 rounded-lg bg-violet-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-400/20">#{linkedChannel.name} kanalını aç</button>}<p className="mt-3 text-[11px] text-slate-500">{responses.filter((item) => item.status === 'going').length} katılıyor · {responses.filter((item) => item.status === 'interested').length} ilgili</p></div><button type="button" onClick={() => void toggleReminder(event)} aria-pressed={reminderIds.has(event.id)} title={reminderIds.has(event.id) ? 'Hatırlatıcıyı kaldır' : '10 dakika önce hatırlat'} aria-label={reminderIds.has(event.id) ? 'Hatırlatıcıyı kaldır' : 'Etkinlik için hatırlatıcı kur'} className={`rounded-lg p-2 transition ${reminderIds.has(event.id) ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-500 hover:bg-cyan-300/10 hover:text-cyan-100'}`}>{reminderIds.has(event.id) ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}</button>{mayDelete && <button type="button" onClick={() => void removeEvent(event.id)} aria-label="Etkinliği sil" className="rounded-lg p-2 text-slate-500 hover:bg-rose-400/10 hover:text-rose-200"><Trash2 className="h-4 w-4" /></button>}</div><div className="mt-4 flex gap-2"><button type="button" onClick={() => void respond(event.id, 'going')} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${ownStatus === 'going' ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/[0.05] text-slate-300 hover:bg-emerald-400/10'}`}><Check className="h-3.5 w-3.5" /> Katılıyorum</button><button type="button" onClick={() => void respond(event.id, 'interested')} className={`rounded-xl px-3 py-2 text-xs font-semibold ${ownStatus === 'interested' ? 'bg-cyan-300/15 text-cyan-100' : 'bg-white/[0.05] text-slate-300 hover:bg-cyan-300/10'}`}>İlgileniyorum</button></div></article>;
      })}{events.length === 0 && <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] px-5 py-12 text-center"><CalendarDays className="mx-auto mb-3 h-7 w-7 text-slate-600" /><p className="text-sm text-slate-400">Yaklaşan etkinlik yok. İlk buluşmayı sen oluştur.</p></div>}</div>
    </section>
  );
}
