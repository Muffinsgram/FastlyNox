import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, Check, ChevronDown, ChevronUp, Copy, Folder, FolderPlus, MessageSquare, Plus, Search, Star, Volume2, VolumeX, X } from 'lucide-react';
import { useServerStore } from '../../store/useServerStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getAppPreferences, saveAppPreferences } from '../../lib/appPreferences';
import { ActionContextMenu } from './ActionContextMenu';
import { UserDock } from './UserDock';

const VISIBLE_SERVER_COUNT = 3;
const FOLDER_COLORS = ['#8b9cff', '#45d6c5', '#f1b85b', '#f27c9a', '#9b83ff'];
const FOLDER_ICONS = ['📁', '🎮', '👥', '💼', '🎨', '⭐'];

export function ServerSidebar({ layout, setLayout, setShowCreateServer, setShowSettings }) {
  const { servers, activeServerId, isLoading, openServer, setActiveServer } = useServerStore();
  const serverUnreadCounts = useNotificationStore((state) => state.serverUnreadCounts);
  const dmUnreadCounts = useNotificationStore((state) => state.dmUnreadCounts);
  const totalDMUnread = Object.values(dmUnreadCounts).reduce((total, count) => total + (Number(count) || 0), 0);
  const user = useAuthStore((state) => state.user);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [serverContext, setServerContext] = useState(null);
  const [notice, setNotice] = useState('');
  const [serverHover, setServerHover] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState('');
  const [editingFolderName, setEditingFolderName] = useState('');
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(() => new Set(getAppPreferences(user?.id).collapsedServerFolderIds));
  const [preferences, setPreferences] = useState(() => getAppPreferences(user?.id));
  const dockRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    setPreferences(getAppPreferences(user?.id));
    setCollapsedFolderIds(new Set(getAppPreferences(user?.id).collapsedServerFolderIds));
    const refresh = event => {
      if (!event?.detail?.userId || event.detail.userId === user?.id) setPreferences(getAppPreferences(user?.id));
    };
    window.addEventListener('fastcord:preferences-updated', refresh);
    return () => window.removeEventListener('fastcord:preferences-updated', refresh);
  }, [user?.id]);

  useEffect(() => {
    const expirations = Object.values(preferences.serverMuteUntil || {}).map(Number).filter(timestamp => timestamp > Date.now());
    if (!expirations.length) return undefined;
    const timer = window.setTimeout(() => void useNotificationStore.getState().fetchNotifications(), Math.max(0, Math.min(...expirations) - Date.now()) + 100);
    return () => window.clearTimeout(timer);
  }, [preferences.serverMuteUntil]);

  const savePreferences = (next, refreshNotifications = false) => {
    setPreferences(next);
    saveAppPreferences(user?.id, next);
    if (refreshNotifications) void useNotificationStore.getState().fetchNotifications();
  };

  const featuredServerIds = useMemo(() => {
    const availableIds = servers.map(server => server.id);
    const savedIds = preferences.featuredServersConfigured
      ? preferences.featuredServerIds.filter(id => availableIds.includes(id))
      : availableIds.slice(0, VISIBLE_SERVER_COUNT);
    return savedIds.slice(0, VISIBLE_SERVER_COUNT);
  }, [servers, preferences.featuredServersConfigured, preferences.featuredServerIds]);
  const visibleServers = useMemo(() => featuredServerIds.map(id => servers.find(server => server.id === id)).filter(Boolean), [featuredServerIds, servers]);
  const hiddenServers = useMemo(() => servers.filter(server => !featuredServerIds.includes(server.id)), [servers, featuredServerIds]);
  const hiddenServerCount = hiddenServers.length;
  const mutedServerIds = preferences.mutedServerIds;
  const filteredServers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr');
    if (!normalizedQuery) return servers;
    return servers.filter(server => server.name.toLocaleLowerCase('tr').includes(normalizedQuery));
  }, [query, servers]);

  useEffect(() => {
    if (!pickerOpen) return undefined;

    searchRef.current?.focus();
    const handlePointerDown = event => {
      if (!dockRef.current?.contains(event.target)) setPickerOpen(false);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') setPickerOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerOpen]);

  const selectServer = serverId => {
    setLayout('server');
    openServer(serverId);
    setPickerOpen(false);
    setQuery('');
  };

  const showNotice = message => {
    setNotice(message);
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(''), 2600);
  };

  const openServerMenu = (event, server) => {
    event.preventDefault();
    event.stopPropagation();
    setServerHover(null);
    setServerContext({ x: event.clientX, y: event.clientY, server });
  };

  const showServerTooltip = (event, server) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setServerHover({ name: server.name, left: rect.left + rect.width / 2, top: rect.top - 8 });
  };

  const toggleServerMute = server => {
    const isMuted = preferences.mutedServerIds.includes(server.id) || Number(preferences.serverMuteUntil?.[server.id]) > Date.now();
    const mutedServerIds = isMuted ? preferences.mutedServerIds.filter(id => id !== server.id) : [...preferences.mutedServerIds, server.id];
    const serverMuteUntil = { ...preferences.serverMuteUntil };
    delete serverMuteUntil[server.id];
    savePreferences({ ...preferences, mutedServerIds, serverMuteUntil }, true);
    showNotice(isMuted ? `${server.name} bildirimleri açıldı` : `${server.name} susturuldu`);
  };

  const muteServerFor = (server, hours) => {
    const mutedServerIds = preferences.mutedServerIds.filter(id => id !== server.id);
    const serverMuteUntil = { ...preferences.serverMuteUntil, [server.id]: Date.now() + hours * 60 * 60 * 1000 };
    savePreferences({ ...preferences, mutedServerIds, serverMuteUntil }, true);
    showNotice(`${server.name} ${hours} saatliğine susturuldu`);
  };

  const muteServerForever = server => {
    const serverMuteUntil = { ...preferences.serverMuteUntil };
    delete serverMuteUntil[server.id];
    const mutedServerIds = preferences.mutedServerIds.includes(server.id) ? preferences.mutedServerIds : [...preferences.mutedServerIds, server.id];
    savePreferences({ ...preferences, mutedServerIds, serverMuteUntil }, true);
    showNotice(`${server.name} süresiz susturuldu`);
  };

  const setServerNotificationMode = (server, mode) => {
    savePreferences({ ...preferences, serverNotificationModes: { ...preferences.serverNotificationModes, [server.id]: mode } }, true);
    const modeName = { all: 'Tüm bildirimler', mentions: 'Yalnızca etiketler', none: 'Bildirim yok' }[mode];
    showNotice(`${server.name}: ${modeName}`);
  };

  const copyServerId = async server => {
    if (!server.public_id) {
      showNotice('Sayısal sunucu kimliği için migration_public_numeric_ids.sql dosyasını Supabase’te çalıştır.');
      return;
    }
    try {
      await navigator.clipboard.writeText(String(server.public_id));
      showNotice(`${server.name} sunucu kimliği kopyalandı`);
    } catch {
      showNotice('Kimlik panoya kopyalanamadı. Tarayıcı izinlerini kontrol et.');
    }
  };

  const serverMenuItems = serverContext ? (() => {
    const server = serverContext.server;
    const muted = preferences.mutedServerIds.includes(server.id) || Number(preferences.serverMuteUntil?.[server.id]) > Date.now();
    const mode = preferences.serverNotificationModes?.[server.id] || 'all';
    const muteRemaining = Number(preferences.serverMuteUntil?.[server.id]) - Date.now();
    return [
      { id: 'mute-server', label: 'Sunucuyu sustur', icon: VolumeX, children: [
        ...(muted ? [{ id: 'unmute-server', label: 'Susturmayı kaldır', icon: Volume2, onSelect: () => toggleServerMute(server) }] : []),
        { id: 'mute-1h', label: '1 saat', icon: VolumeX, checked: muteRemaining > 0 && muteRemaining <= 60 * 60 * 1000, hint: muteRemaining > 0 && muteRemaining <= 60 * 60 * 1000 ? 'Seçili' : '', onSelect: () => muteServerFor(server, 1) },
        { id: 'mute-8h', label: '8 saat', icon: VolumeX, checked: muteRemaining > 60 * 60 * 1000 && muteRemaining <= 8 * 60 * 60 * 1000, hint: muteRemaining > 60 * 60 * 1000 && muteRemaining <= 8 * 60 * 60 * 1000 ? 'Seçili' : '', onSelect: () => muteServerFor(server, 8) },
        { id: 'mute-24h', label: '24 saat', icon: VolumeX, checked: muteRemaining > 8 * 60 * 60 * 1000 && muteRemaining <= 24 * 60 * 60 * 1000, hint: muteRemaining > 8 * 60 * 60 * 1000 && muteRemaining <= 24 * 60 * 60 * 1000 ? 'Seçili' : '', onSelect: () => muteServerFor(server, 24) },
        { id: 'mute-forever', label: 'Süresiz', icon: VolumeX, checked: preferences.mutedServerIds.includes(server.id), hint: preferences.mutedServerIds.includes(server.id) ? 'Seçili' : '', onSelect: () => muteServerForever(server) },
      ] },
      { id: 'server-notifications', label: 'Bildirim ayarları', icon: Bell, children: [
        { id: 'notify-all', label: 'Tüm mesajlar', icon: Bell, checked: mode === 'all', hint: mode === 'all' ? 'Seçili' : '', onSelect: () => setServerNotificationMode(server, 'all') },
        { id: 'notify-mentions', label: 'Yalnızca etiketler', icon: BellOff, checked: mode === 'mentions', hint: mode === 'mentions' ? 'Seçili' : '', onSelect: () => setServerNotificationMode(server, 'mentions') },
        { id: 'notify-none', label: 'Hiçbiri', icon: VolumeX, checked: mode === 'none', hint: mode === 'none' ? 'Seçili' : '', onSelect: () => setServerNotificationMode(server, 'none') },
      ] },
      { id: 'move-server-folder', label: 'Klasöre taşı', icon: Folder, children: preferences.serverFolders.length
        ? [{ id: 'folder-none', label: 'Klasörsüz', icon: Folder, checked: !preferences.serverFolderIds[server.id], hint: !preferences.serverFolderIds[server.id] ? 'Seçili' : '', onSelect: () => moveServerToFolder(server, '') }, ...preferences.serverFolders.map(folder => ({ id: `folder-${folder.id}`, label: folder.name, icon: Folder, checked: preferences.serverFolderIds[server.id] === folder.id, hint: preferences.serverFolderIds[server.id] === folder.id ? 'Seçili' : '', onSelect: () => moveServerToFolder(server, folder.id) }))]
        : [{ id: 'create-server-folder', label: 'Klasör oluştur…', icon: FolderPlus, onSelect: () => { setManageOpen(true); setPickerOpen(true); } }] },
      { id: 'copy-server-id', label: 'Sunucu kimliğini kopyala', icon: Copy, onSelect: () => void copyServerId(server) },
      { separator: true },
      { id: 'open-server', label: 'Sunucuya git', icon: MessageSquare, onSelect: () => selectServer(server.id) },
    ];
  })() : [];

  const toggleFeatured = server => {
    const isFeatured = featuredServerIds.includes(server.id);
    if (!isFeatured && featuredServerIds.length >= VISIBLE_SERVER_COUNT) {
      showNotice('En fazla 3 öne çıkan sunucu seçebilirsin. Önce birinin yıldızını kaldır.');
      return;
    }
    const nextIds = isFeatured ? featuredServerIds.filter(id => id !== server.id) : [...featuredServerIds, server.id];
    savePreferences({ ...preferences, featuredServerIds: nextIds, featuredServersConfigured: true });
  };

  const moveFeatured = (serverId, direction) => {
    const nextIds = [...featuredServerIds];
    const index = nextIds.indexOf(serverId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= nextIds.length) return;
    [nextIds[index], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[index]];
    savePreferences({ ...preferences, featuredServerIds: nextIds, featuredServersConfigured: true });
  };

  const addFolder = event => {
    event.preventDefault();
    const name = folderName.trim().slice(0, 24);
    if (!name) return;
    if (preferences.serverFolders.some(folder => folder.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
      showNotice('Bu isimde bir klasör zaten var.');
      return;
    }
    const folder = { id: globalThis.crypto?.randomUUID?.() || `folder-${Date.now()}`, name, color: FOLDER_COLORS[0], icon: FOLDER_ICONS[0] };
    savePreferences({ ...preferences, serverFolders: [...preferences.serverFolders, folder] });
    setFolderName('');
  };

  const cycleFolder = server => {
    const folderIds = ['', ...preferences.serverFolders.map(folder => folder.id)];
    const current = preferences.serverFolderIds[server.id] || '';
    const next = folderIds[(folderIds.indexOf(current) + 1) % folderIds.length];
    const serverFolderIds = { ...preferences.serverFolderIds };
    if (next) serverFolderIds[server.id] = next;
    else delete serverFolderIds[server.id];
    savePreferences({ ...preferences, serverFolderIds });
  };

  const moveServerToFolder = (server, folderId) => {
    const serverFolderIds = { ...preferences.serverFolderIds };
    if (folderId) serverFolderIds[server.id] = folderId;
    else delete serverFolderIds[server.id];
    savePreferences({ ...preferences, serverFolderIds });
    showNotice(folderId ? `${server.name} klasöre taşındı` : `${server.name} klasörlerden çıkarıldı`);
  };

  const deleteFolder = folderId => {
    const serverFolderIds = Object.fromEntries(Object.entries(preferences.serverFolderIds).filter(([, id]) => id !== folderId));
    savePreferences({ ...preferences, serverFolders: preferences.serverFolders.filter(folder => folder.id !== folderId), serverFolderIds });
  };

  const renameFolder = event => {
    event.preventDefault();
    const nextName = editingFolderName.trim().slice(0, 24);
    if (!nextName) return;
    if (preferences.serverFolders.some(folder => folder.id !== editingFolderId && folder.name.toLocaleLowerCase('tr') === nextName.toLocaleLowerCase('tr'))) {
      showNotice('Bu isimde bir klasör zaten var.');
      return;
    }
    savePreferences({ ...preferences, serverFolders: preferences.serverFolders.map(folder => folder.id === editingFolderId ? { ...folder, name: nextName } : folder) });
    setEditingFolderId('');
  };

  const recolorFolder = (folderId, color) => savePreferences({ ...preferences, serverFolders: preferences.serverFolders.map(folder => folder.id === folderId ? { ...folder, color } : folder) });

  const cycleFolderIcon = folder => {
    const index = FOLDER_ICONS.indexOf(folder.icon || FOLDER_ICONS[0]);
    const icon = FOLDER_ICONS[(index + 1) % FOLDER_ICONS.length];
    savePreferences({ ...preferences, serverFolders: preferences.serverFolders.map(item => item.id === folder.id ? { ...item, icon } : item) });
  };

  const toggleFolderCollapsed = folderId => {
    const next = new Set(collapsedFolderIds);
    if (next.has(folderId)) next.delete(folderId);
    else next.add(folderId);
    setCollapsedFolderIds(next);
    savePreferences({ ...preferences, collapsedServerFolderIds: [...next] });
  };

  const reorderFolder = (folderId, direction) => {
    const next = [...preferences.serverFolders];
    const index = next.findIndex(folder => folder.id === folderId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    savePreferences({ ...preferences, serverFolders: next });
  };

  const toggleFolderMute = folder => {
    const ids = servers.filter(server => preferences.serverFolderIds[server.id] === folder.id).map(server => server.id);
    if (!ids.length) {
      showNotice('Önce bu klasöre bir sunucu ekle');
      return;
    }
    const alreadyMuted = ids.length > 0 && ids.every(id => mutedServerIds.includes(id) || Number(preferences.serverMuteUntil?.[id]) > Date.now());
    const nextMutedServerIds = alreadyMuted ? mutedServerIds.filter(id => !ids.includes(id)) : [...new Set([...mutedServerIds, ...ids])];
    const serverMuteUntil = { ...preferences.serverMuteUntil };
    ids.forEach(id => delete serverMuteUntil[id]);
    savePreferences({ ...preferences, mutedServerIds: nextMutedServerIds, serverMuteUntil }, true);
    showNotice(alreadyMuted ? `${folder.name} klasörünün susturması kaldırıldı` : `${folder.name} klasörü susturuldu`);
  };

  const renderServerRow = server => {
    const isActive = layout === 'server' && activeServerId === server.id;
    const isFeatured = featuredServerIds.includes(server.id);
    const mutedUntil = Number(preferences.serverMuteUntil?.[server.id]);
    const isMuted = mutedServerIds.includes(server.id) || mutedUntil > Date.now();
    const folder = preferences.serverFolders.find(item => item.id === preferences.serverFolderIds[server.id]);
    const status = isMuted ? (mutedUntil > Date.now() ? `Susturuldu · ${new Date(mutedUntil).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}’ye kadar` : 'Bildirimler susturuldu') : isActive ? 'Şu an görüntüleniyor' : 'Sunucuya geç';
    const content = <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-white/[0.08] text-sm font-bold text-slate-200 transition ${isActive ? 'ring-2 ring-violet-400/70 ring-offset-2 ring-offset-[#11151e]' : 'group-hover:rounded-xl'}`}>
        {server.icon_url ? <img src={server.icon_url} alt="" className="h-full w-full object-cover" /> : server.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-100">{server.name}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{manageOpen && folder ? `${folder.name} · ` : ''}{status}</span>
      </span>
      {serverUnreadCounts[server.id] > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-rose-400 px-1.5 text-[10px] font-bold text-[#200b0b]">{serverUnreadCounts[server.id] > 99 ? '99+' : serverUnreadCounts[server.id]}</span>}
      {isActive && <Check className="mr-1 h-4 w-4 shrink-0 text-emerald-300" />}
    </>;
    if (!manageOpen) return <button key={server.id} type="button" onContextMenu={event => openServerMenu(event, server)} onClick={() => selectServer(server.id)} className={`group flex w-full items-center gap-3 rounded-[14px] border px-2.5 py-2 text-left transition ${isActive ? 'border-violet-300/20 bg-violet-400/[0.12]' : 'border-transparent hover:border-white/[0.06] hover:bg-white/[0.06]'}`}>{content}</button>;
    return <div key={server.id} onContextMenu={event => openServerMenu(event, server)} className={`group flex items-center gap-2 rounded-[14px] border px-2.5 py-2 ${isActive ? 'border-violet-300/20 bg-violet-400/[0.08]' : 'border-transparent hover:bg-white/[0.035]'}`}>
      <button type="button" onClick={() => selectServer(server.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">{content}</button>
      <button type="button" aria-label={isFeatured ? `${server.name} öne çıkanlardan kaldır` : `${server.name} öne çıkanlara ekle`} onClick={() => toggleFeatured(server)} className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl transition ${isFeatured ? 'bg-amber-300/10 text-amber-200 hover:bg-amber-300/20' : 'text-slate-500 hover:bg-white/[0.08] hover:text-amber-100'}`}><Star className={`h-4 w-4 ${isFeatured ? 'fill-current' : ''}`} /></button>
      {preferences.serverFolders.length > 0 && <button type="button" onClick={() => cycleFolder(server)} title="Klasör atamasını değiştir" aria-label={`${server.name} klasörünü değiştir`} className="flex max-w-28 shrink-0 items-center gap-1 rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] text-slate-400 hover:bg-white/[0.1] hover:text-white"><Folder className="h-3 w-3" /><span className="truncate">{folder?.name || 'Klasörsüz'}</span></button>}
    </div>;
  };

  return (
    <nav ref={dockRef} aria-label="Ana gezinme" className="macos-server-dock absolute bottom-3 left-1/2 z-50 w-max max-w-[calc(100%-24px)] -translate-x-1/2 overflow-visible rounded-[22px] border border-white/[0.12] bg-[#151a24]/85 p-1.5 shadow-[0_16px_56px_rgba(0,0,0,.5)] backdrop-blur-2xl">
      {pickerOpen && (
        <section id="server-picker" aria-label="Sunucu seç" className="dropdown-surface absolute bottom-[calc(100%+12px)] left-1/2 z-[60] max-h-[calc(100vh-110px)] w-[min(460px,calc(100vw-28px))] -translate-x-1/2 overflow-y-auto rounded-[22px] border border-white/[0.12] bg-[#11151e]/95 p-3 shadow-[0_24px_80px_rgba(0,0,0,.6)] backdrop-blur-2xl" style={{ transformOrigin: 'bottom center' }}>
          <header className="mb-3 flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-semibold text-white">Sunucu alanın</h2>
              <p className="mt-0.5 text-xs text-slate-400">{featuredServerIds.length}/3 öne çıkan · {servers.length} sunucu</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setManageOpen(value => !value)} className={`rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition ${manageOpen ? 'border-violet-300/25 bg-violet-300/10 text-violet-100' : 'border-white/[0.08] text-slate-300 hover:bg-white/[0.06]'}`}>{manageOpen ? 'Bitti' : 'Düzenle'}</button>
              <button type="button" aria-label="Sunucu listesini kapat" onClick={() => { setPickerOpen(false); setManageOpen(false); }} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/[0.08] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {manageOpen && <div className="mb-3 rounded-2xl border border-violet-300/10 bg-violet-300/[0.035] p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Öne çıkanlar</span><span className="text-[10px] text-slate-500">Dock sırası</span></div>
            {featuredServerIds.length ? <div className="flex flex-wrap gap-1.5">{featuredServerIds.map((id, index) => { const server = servers.find(item => item.id === id); return server ? <div key={id} className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/20 py-1 pl-2.5 pr-1"><span className="max-w-24 truncate text-[11px] text-slate-200">{index + 1}. {server.name}</span><button type="button" aria-label={`${server.name} yukarı taşı`} disabled={index === 0} onClick={() => moveFeatured(id, -1)} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button><button type="button" aria-label={`${server.name} aşağı taşı`} disabled={index === featuredServerIds.length - 1} onClick={() => moveFeatured(id, 1)} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button></div> : null; })}</div> : <p className="text-[11px] text-slate-500">Henüz öne çıkan sunucu yok. Listeden yıldızla seç.</p>}
            <form onSubmit={addFolder} className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3">
              <input value={folderName} onChange={event => setFolderName(event.target.value)} maxLength={24} placeholder="Yeni klasör adı" aria-label="Yeni klasör adı" className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-violet-300/35" />
              <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-violet-300/10 px-3 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-300/20"><FolderPlus className="h-3.5 w-3.5" /> Klasör</button>
            </form>
            {preferences.serverFolders.length > 0 && <div className="mt-2 space-y-1.5">{preferences.serverFolders.map((folder, index) => <div key={folder.id} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.06] bg-black/15 px-2 py-1.5">
              <button type="button" title="Klasör simgesini değiştir" aria-label={`${folder.name} simgesini değiştir`} onClick={() => cycleFolderIcon(folder)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-sm transition hover:bg-white/[0.1]">{folder.icon || FOLDER_ICONS[0]}</button>
              {editingFolderId === folder.id ? <form onSubmit={renameFolder} className="flex min-w-28 flex-1 gap-1"><input autoFocus value={editingFolderName} onChange={event => setEditingFolderName(event.target.value)} maxLength={24} aria-label="Klasör adını düzenle" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white outline-none focus:border-violet-300/30" /><button type="submit" className="rounded-md px-1.5 text-[10px] text-emerald-200 hover:bg-emerald-300/10">Kaydet</button></form> : <button type="button" title="Klasör adını değiştir" onClick={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name); }} className="max-w-28 truncate text-left text-[10px] font-semibold text-slate-200 hover:text-white">{folder.name}</button>}
              <div className="flex items-center gap-1" aria-label={`${folder.name} rengi`}>
                {FOLDER_COLORS.map(color => <button key={color} type="button" aria-label={`${folder.name} rengini değiştir`} aria-pressed={(folder.color || FOLDER_COLORS[0]) === color} onClick={() => recolorFolder(folder.id, color)} className={`h-3 w-3 rounded-full transition hover:scale-125 ${(folder.color || FOLDER_COLORS[0]) === color ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-[#11151e]' : ''}`} style={{ backgroundColor: color }} />)}
              </div>
              <button type="button" title="Klasördeki tüm sunucuları sustur/aç" aria-label={`${folder.name} klasöründeki sunucuları sustur veya aç`} onClick={() => toggleFolderMute(folder)} className="rounded-md p-1 text-slate-400 transition hover:bg-white/[0.08] hover:text-violet-100"><BellOff className="h-3 w-3" /></button>
              <button type="button" aria-label={`${folder.name} klasörünü yukarı taşı`} disabled={index === 0} onClick={() => reorderFolder(folder.id, -1)} className="rounded-md p-1 text-slate-500 hover:bg-white/[0.08] hover:text-white disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
              <button type="button" aria-label={`${folder.name} klasörünü aşağı taşı`} disabled={index === preferences.serverFolders.length - 1} onClick={() => reorderFolder(folder.id, 1)} className="rounded-md p-1 text-slate-500 hover:bg-white/[0.08] hover:text-white disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
              <button type="button" aria-label={`${folder.name} klasörünü sil`} onClick={() => deleteFolder(folder.id)} className="rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-rose-300/10 hover:text-rose-200">×</button>
            </div>)}</div>}
          </div>}

          <label className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 text-slate-400 focus-within:border-violet-400/40 focus-within:text-violet-200">
            <Search className="h-4 w-4 shrink-0" />
            <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Sunucularda ara..." aria-label="Sunucularda ara" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
            {query && <button type="button" aria-label="Aramayı temizle" onClick={() => setQuery('')} className="rounded-md p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>}
          </label>

          <div className="mt-3 max-h-[min(340px,55vh)] space-y-1 overflow-y-auto pr-1">
            {preferences.serverFolders.map(folder => {
              const folderServers = filteredServers.filter(server => preferences.serverFolderIds[server.id] === folder.id);
              if (!folderServers.length) return null;
              return <div key={folder.id} className="mb-2 rounded-r-lg border-l-2 pl-1" style={{ borderColor: folder.color || FOLDER_COLORS[0] }}>
                <button type="button" aria-expanded={!collapsedFolderIds.has(folder.id)} onClick={() => toggleFolderCollapsed(folder.id)} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[9px] font-bold uppercase tracking-[.16em] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"><span className="text-xs" aria-hidden="true">{folder.icon || FOLDER_ICONS[0]}</span>{folder.name}<span className="text-[9px] font-medium tracking-normal text-slate-600">{folderServers.length}</span><span className="h-px flex-1 bg-white/[0.06]" /><ChevronDown className={`h-3 w-3 transition-transform ${collapsedFolderIds.has(folder.id) ? '-rotate-90' : ''}`} /></button>
                {!collapsedFolderIds.has(folder.id) && folderServers.map(server => renderServerRow(server))}
              </div>;
            })}
            {filteredServers.filter(server => !preferences.serverFolderIds[server.id]).map(server => renderServerRow(server))}
            {filteredServers.length === 0 && (
              <div className="rounded-xl px-3 py-8 text-center">
                <Search className="mx-auto mb-2 h-5 w-5 text-slate-500" />
                <p className="text-sm text-slate-300">Sunucu bulunamadı</p>
                <p className="mt-1 text-xs text-slate-500">Farklı bir isimle tekrar ara.</p>
              </div>
            )}
          </div>

          <footer className="mt-3 border-t border-white/[0.08] pt-3">
            <button type="button" onClick={() => { setPickerOpen(false); setShowCreateServer(true); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400/[0.1] px-3 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/[0.18]">
              <Plus className="h-4 w-4" /> Yeni sunucu oluştur
            </button>
          </footer>
        </section>
      )}

      <div className="macos-server-dock-items flex max-w-[calc(100vw-36px)] flex-row items-center gap-1 overflow-x-auto px-1">
        <button type="button" aria-label={`Direkt mesajlar${totalDMUnread ? `, ${totalDMUnread} okunmamış mesaj` : ''}`} onClick={() => { setLayout('home'); setActiveServer(null); }} className="relative group server-icon flex h-11 w-11 shrink-0 items-center justify-center has-tooltip">
          <div className={`server-icon-bg flex h-10 w-10 items-center justify-center rounded-[14px] text-white transition-all ${layout === 'home' ? 'bg-gradient-to-br from-violet-500 to-cyan-500 shadow-[0_4px_18px_rgba(113,133,255,.35)]' : 'bg-white/[0.06] hover:bg-white/[0.12]'}`}>
            <MessageSquare className="h-5 w-5" />
          </div>
          {totalDMUnread > 0 && <span aria-label={`${totalDMUnread} okunmamış DM`} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#151a24] bg-rose-400 px-1 text-[8px] font-black text-[#200b0b]">{totalDMUnread > 99 ? '99+' : totalDMUnread}</span>}
          <div className="fast-tooltip">Direkt Mesajlar</div>
        </button>

        <div aria-hidden="true" className="mx-1 h-8 w-px shrink-0 rounded-full bg-white/10" />

        {visibleServers.map(server => {
          const isActive = layout === 'server' && activeServerId === server.id;
          const unreadCount = serverUnreadCounts[server.id] || 0;
          return (
            <button type="button" aria-label={`${server.name}${unreadCount ? `, ${unreadCount} okunmamış etiket` : ''}`} key={server.id} onMouseEnter={event => showServerTooltip(event, server)} onMouseLeave={() => setServerHover(null)} onFocus={event => showServerTooltip(event, server)} onBlur={() => setServerHover(null)} onContextMenu={event => openServerMenu(event, server)} onClick={() => selectServer(server.id)} className="relative group server-icon flex h-11 w-11 shrink-0 items-center justify-center has-tooltip">
              <div className={`server-icon-bg flex h-10 w-10 items-center justify-center overflow-hidden rounded-[15px] font-bold text-lg text-slate-200 transition-all ${isActive ? 'rounded-[13px] bg-fastcord-violet text-white shadow-[0_4px_18px_rgba(113,133,255,.3)]' : 'bg-white/[0.06] hover:rounded-[13px] hover:bg-white/[0.12]'}`}>
                {server.icon_url ? <img src={server.icon_url} alt="" className="h-full w-full rounded-[inherit] object-cover" /> : server.name.charAt(0).toUpperCase()}
              </div>
              {unreadCount > 0 && <span aria-label={`${unreadCount} bildirim`} className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-[#151a24] bg-rose-400 px-1 text-[8px] font-black text-[#200b0b]">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              {(mutedServerIds.includes(server.id) || Number(preferences.serverMuteUntil?.[server.id]) > Date.now()) && <span aria-label="Sunucu susturuldu" className="absolute -bottom-0.5 -left-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-[#151a24] bg-slate-700 text-slate-300"><BellOff className="h-2.5 w-2.5" /></span>}
            </button>
          );
        })}

        {servers.length > 0 && (
          <button type="button" aria-expanded={pickerOpen} aria-controls="server-picker" aria-label={`${hiddenServerCount} diğer sunucuyu göster ve sunucuları düzenle`} onClick={() => setPickerOpen(open => !open)} className={`group flex h-10 shrink-0 items-center gap-1.5 rounded-[14px] border px-3 text-xs font-semibold transition ${pickerOpen ? 'border-violet-300/30 bg-violet-400/[0.16] text-violet-100' : 'border-white/[0.08] bg-white/[0.05] text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.1] hover:text-white'}`}>
            <span>{hiddenServerCount > 0 ? `+${hiddenServerCount}` : 'Düzenle'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>
        )}

        {isLoading && servers.length === 0 && <div role="status" aria-label="Sunucular yükleniyor" className="h-10 w-10 shrink-0 animate-pulse rounded-[14px] bg-white/10" />}

        <button type="button" aria-label="Sunucu ekle" onClick={() => setShowCreateServer(true)} className="relative group server-icon flex h-11 w-11 shrink-0 items-center justify-center has-tooltip">
          <div className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-emerald-400/10 text-emerald-300 transition-all hover:rounded-[13px] hover:bg-emerald-500 hover:text-white">
            <Plus className="h-5 w-5" />
          </div>
          <div className="fast-tooltip">Sunucu Ekle</div>
        </button>

        <div aria-hidden="true" className="mx-1 h-8 w-px shrink-0 rounded-full bg-white/10" />
        <UserDock placement="dock" setShowSettings={setShowSettings} />
      </div>
      {serverHover && createPortal(<div role="tooltip" className="fast-server-tooltip" style={{ left: serverHover.left, top: serverHover.top }}>{serverHover.name}</div>, document.body)}
      {notice && <div role="status" className="pointer-events-none fixed bottom-24 left-1/2 z-[710] -translate-x-1/2 rounded-xl border border-white/10 bg-[#202633]/95 px-4 py-2.5 text-xs font-medium text-slate-100 shadow-2xl backdrop-blur-xl">{notice}</div>}
      <ActionContextMenu position={serverContext} items={serverMenuItems} onClose={() => setServerContext(null)} label="Sunucu işlemleri" />
    </nav>
  );
}
