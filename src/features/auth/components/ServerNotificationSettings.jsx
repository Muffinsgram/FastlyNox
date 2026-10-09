import { useState } from 'react';
import { BellOff, ChevronDown, Hash, Server, VolumeX } from 'lucide-react';
import { useServerStore } from '../../../store/useServerStore';

export function ServerNotificationSettings({ preferences, onChange }) {
  const servers = useServerStore((state) => state.servers);
  const [expandedServerId, setExpandedServerId] = useState(null);
  const mutedServerIds = Array.isArray(preferences.mutedServerIds) ? preferences.mutedServerIds : [];
  const mutedChannelIds = Array.isArray(preferences.mutedChannelIds) ? preferences.mutedChannelIds : [];

  const toggleId = (key, id) => {
    const selected = Array.isArray(preferences[key]) ? preferences[key] : [];
    onChange(key, selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };

  return <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
    <header className="border-b border-white/[0.06] p-4 sm:p-5">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-200/10 bg-violet-300/[0.08] text-violet-100"><VolumeX className="h-4 w-4" /></span><span><span className="block text-sm font-semibold text-white">Sunucu ve kanal bildirimleri</span><span className="mt-1 block text-xs text-slate-400">Susturulan yerlerden ses ve açılır uyarı gelmez; okunmamışlar bildirim merkezinde kalır.</span></span></div>
    </header>
    <div className="max-h-[22rem] space-y-1 overflow-y-auto p-2 custom-scrollbar">
      {servers.length ? servers.map((server) => {
        const channels = (server.categories || []).flatMap((category) => category.channels || []);
        const muted = mutedServerIds.includes(server.id);
        const expanded = expandedServerId === server.id;
        return <article key={server.id} className="overflow-hidden rounded-xl border border-white/[0.045] bg-black/[0.08]">
          <div className="flex items-center gap-2 p-2">
            <button type="button" aria-expanded={expanded} onClick={() => setExpandedServerId(expanded ? null : server.id)} className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/[0.045]">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${muted ? 'border-rose-200/10 bg-rose-300/[0.07] text-rose-200' : 'border-white/[0.07] bg-white/[0.04] text-slate-300'}`}>{muted ? <BellOff className="h-4 w-4" /> : <Server className="h-4 w-4" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-100">{server.name}</span><span className="mt-0.5 block text-[10px] text-slate-500">{channels.length} kanal{muted ? ' · sessiz' : ''}</span></span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180 text-violet-200' : ''}`} />
            </button>
            <MiniSwitch label={`${server.name} sunucusunu sustur`} checked={muted} onChange={() => toggleId('mutedServerIds', server.id)} />
          </div>
          {expanded && channels.length > 0 && <div className="dropdown-surface space-y-0.5 border-t border-white/[0.05] px-2 py-1.5" style={{ transformOrigin: 'top center' }}>
            {channels.map((channel) => {
              const channelMuted = mutedChannelIds.includes(channel.id);
              return <div key={channel.id} className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/[0.035]">
                <Hash className={`h-3.5 w-3.5 shrink-0 ${channelMuted ? 'text-rose-200/70' : 'text-slate-500'}`} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{channel.name}</span>
                <MiniSwitch label={`#${channel.name} kanalını sustur`} checked={channelMuted} onChange={() => toggleId('mutedChannelIds', channel.id)} />
              </div>;
            })}
          </div>}
          {expanded && channels.length === 0 && <p className="border-t border-white/[0.05] px-5 py-3 text-[10px] text-slate-500">Bu sunucuda kanal bulunamadı.</p>}
        </article>;
      }) : <p className="px-4 py-8 text-center text-xs text-slate-500">Sunucu bildirimlerini yönetmek için önce bir sunucuya katıl.</p>}
    </div>
    <div className="border-t border-white/[0.06] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-black/[0.08] p-3">
        <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-200">Sessiz saatler</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">Belirlediğin saatlerde ses ve masaüstü uyarıları durur.</span></span>
        <div className="flex items-center gap-2"><TimeInput ariaLabel="Sessiz saat başlangıcı" value={preferences.quietHoursStart || '22:00'} onChange={(value) => onChange('quietHoursStart', value)} disabled={!preferences.quietHoursEnabled} /><span className="text-[10px] text-slate-600">–</span><TimeInput ariaLabel="Sessiz saat bitişi" value={preferences.quietHoursEnd || '08:00'} onChange={(value) => onChange('quietHoursEnd', value)} disabled={!preferences.quietHoursEnabled} /><MiniSwitch label="Sessiz saatleri aç" checked={Boolean(preferences.quietHoursEnabled)} onChange={() => onChange('quietHoursEnabled', !preferences.quietHoursEnabled)} /></div>
      </div>
    </div>
  </section>;
}

function MiniSwitch({ label, checked, onChange }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={onChange} className={`relative h-6 w-10 shrink-0 rounded-full border p-0.5 outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-violet-200/70 ${checked ? 'border-violet-200/40 bg-violet-400/70' : 'border-white/10 bg-slate-800 hover:bg-slate-700'}`}><span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} /></button>;
}

function TimeInput({ ariaLabel, value, onChange, disabled }) {
  return <input type="time" aria-label={ariaLabel} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8 w-[5.15rem] rounded-lg border border-white/[0.08] bg-[#10151e] px-2 text-[10px] text-slate-200 outline-none transition focus:border-violet-200/30 disabled:cursor-not-allowed disabled:opacity-35" />;
}
