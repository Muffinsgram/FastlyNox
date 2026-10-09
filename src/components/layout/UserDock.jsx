import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronUp, Circle, CircleMinus, Clock3, EyeOff, Settings } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { getAvatarUrl } from '../../lib/profileMedia';

const STATUS_OPTIONS = [
  { id: 'online', label: 'Çevrim içi', hint: 'Bildirimleri normal al', icon: Circle, color: 'text-emerald-300', dot: 'bg-emerald-400' },
  { id: 'idle', label: 'Boşta', hint: 'Kısa süreliğine uzaktasın', icon: Clock3, color: 'text-amber-300', dot: 'bg-amber-300' },
  { id: 'dnd', label: 'Rahatsız etmeyin', hint: 'Dikkat dağıtıcıları azalt', icon: CircleMinus, color: 'text-rose-300', dot: 'bg-rose-400' },
  { id: 'invisible', label: 'Görünmez', hint: 'Diğerlerine çevrim dışı görün', icon: EyeOff, color: 'text-slate-400', dot: 'bg-slate-500' },
];

export function UserDock({ isSidebarMode, placement, setShowSettings }) {
  const { user: currentUser } = useAuthStore();
  const { status, error: statusError, setStatus } = usePresenceStore();
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusMenuPosition, setStatusMenuPosition] = useState({ bottom: 100, right: 20 });
  const statusMenuRef = useRef(null);
  const statusPopoverRef = useRef(null);
  const currentStatus = STATUS_OPTIONS.find((option) => option.id === status) || STATUS_OPTIONS[0];

  useEffect(() => {
    if (!statusOpen) return undefined;
    const closeOnOutside = (event) => { if (!statusMenuRef.current?.contains(event.target) && !statusPopoverRef.current?.contains(event.target)) setStatusOpen(false); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setStatusOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [statusOpen]);

  const toggleStatusMenu = () => {
    if (statusOpen) { setStatusOpen(false); return; }
    const bounds = statusMenuRef.current?.getBoundingClientRect();
    if (bounds) setStatusMenuPosition({ bottom: Math.max(16, window.innerHeight - bounds.top + 12), right: Math.max(12, window.innerWidth - bounds.right) });
    setStatusOpen(true);
  };

  if (!currentUser) return null;

  if (placement === 'dock') {
    return (
      <div className="flex shrink-0 items-center gap-1 pl-0.5 pr-1">
        <div ref={statusMenuRef} className="relative min-w-0">
          <button type="button" aria-label={`${currentUser.username || 'Profil'} durumunu ayarla`} aria-expanded={statusOpen} aria-haspopup="menu" title="Durumunu değiştir" onClick={toggleStatusMenu} className="group flex min-w-0 items-center gap-2 rounded-[16px] border border-transparent py-1 pl-1 pr-2 text-left transition hover:border-white/[0.08] hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70">
            <span className="relative block shrink-0">
              <img src={getAvatarUrl(currentUser.avatar_url, currentUser.username || currentUser.id)} className="h-9 w-9 rounded-[13px] bg-slate-800 object-cover ring-1 ring-white/10 transition group-hover:ring-violet-300/50" alt="" />
              <span aria-label={currentStatus.label} title={currentStatus.label} className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#151a24] ${currentStatus.dot} ${status === 'online' ? 'shadow-[0_0_8px_rgba(52,211,153,.45)]' : ''}`} />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-28 truncate text-xs font-semibold leading-4 text-slate-100 transition group-hover:text-white">{currentUser.username || 'Fastlynox hesabı'}</span>
              <span className="flex items-center gap-1 text-[10px] leading-3 text-slate-500"><span className={currentStatus.color}>●</span>{currentStatus.label}</span>
            </span>
            <ChevronUp className={`hidden h-3.5 w-3.5 text-slate-500 transition group-hover:text-slate-200 sm:block ${statusOpen ? '' : 'rotate-180'}`} />
          </button>
          {statusOpen && createPortal(<section ref={statusPopoverRef} role="menu" aria-label="Çevrimiçi durumunu seç" style={{ bottom: statusMenuPosition.bottom, right: statusMenuPosition.right, transformOrigin: 'bottom right' }} className="dropdown-surface fixed z-[500] w-[min(290px,calc(100vw-32px))] overflow-hidden rounded-[22px] border border-white/[0.12] bg-[#11151e]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,.62)] backdrop-blur-2xl"><header className="mb-1 flex items-center gap-3 rounded-[16px] bg-white/[0.035] p-3"><img src={getAvatarUrl(currentUser.avatar_url, currentUser.username || currentUser.id)} alt="" className="h-10 w-10 rounded-[14px] object-cover" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{currentUser.username || 'Fastlynox hesabı'}</p><p className="mt-0.5 text-[10px] text-slate-500">Görünürlük ve durum</p></div></header><p className="px-3 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">Çevrimiçi durumunu ayarla</p>{STATUS_OPTIONS.map((option) => { const Icon = option.icon; const selected = status === option.id; return <button key={option.id} role="menuitemradio" aria-checked={selected} type="button" onClick={() => { void setStatus(option.id); setStatusOpen(false); }} className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition ${selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.055]'}`}><span className={`grid h-8 w-8 place-items-center rounded-xl bg-white/[0.045] ${option.color}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-100">{option.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{option.hint}</span></span>{selected && <Check className="h-4 w-4 text-violet-200" />}</button>; })}{statusError && <p role="alert" className="mt-2 rounded-xl border border-amber-200/10 bg-amber-300/[0.05] px-3 py-2 text-[10px] leading-4 text-amber-100">{statusError}</p>}</section>, document.body)}
        </div>
        <button type="button" aria-label="Ayarları aç" title="Ayarlar" onClick={() => setShowSettings(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70"><Settings className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div className={isSidebarMode
      ? "macos-user-dock mt-auto bg-[#141820]/70 border-t border-white/5 p-3 flex items-center justify-between shrink-0"
      : placement === 'floating'
        ? "macos-profile-dock macos-surface absolute bottom-3 right-3 z-[60] flex items-center gap-3 rounded-full px-3 py-2 shadow-2xl transition-all"
        : "absolute bottom-8 left-1/2 -translate-x-1/2 z-[45] glass-panel rounded-full px-5 py-3 flex items-center gap-5 shadow-2xl transition-all hover:scale-105"}>
      <button type="button" aria-label="Open user settings" className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-1 rounded-md transition-colors text-left" onClick={() => setShowSettings(true)}>
        <div className="relative">
          <img src={getAvatarUrl(currentUser.avatar_url, currentUser.username || currentUser.id)} className="w-9 h-9 rounded-full bg-slate-800 object-cover" alt={`${currentUser.username} avatar`} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white leading-none mb-1 group-hover:text-violet-400 transition-colors">{currentUser.username}</span>
          <span className="text-[11px] font-medium text-slate-400 leading-none">Fastlynox account</span>
        </div>
      </button>
      {!isSidebarMode && <div className="w-px h-8 bg-white/10"></div>}
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Open user settings" onClick={() => setShowSettings(true)} className="p-2 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"><Settings className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
