import React, { useEffect, useState } from 'react';
import { Users, MessageSquare, Check, X, UserPlus, Plus, Megaphone, Clock3, Rss, Bookmark, Copy, Pin, PinOff, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';
import { useFriendStore } from '../../../store/useFriendStore';
import { DMChatArea } from '../../chat/components/DMChatArea';
import { getAvatarUrl } from '../../../lib/profileMedia';
import { GlobalAnnouncements } from './GlobalAnnouncements';
import { RemindersPanel } from './RemindersPanel';
import { SocialFeed } from './SocialFeed';
import { SavedMessagesPanel } from './SavedMessagesPanel';
import { usePresenceStore } from '../../../store/usePresenceStore';
import { resolvePresenceStatus } from '../../../lib/presenceSessions';
import { getAppPreferences } from '../../../lib/appPreferences';
import { saveAppPreferences } from '../../../lib/appPreferences';
import { ActionContextMenu } from '../../../components/layout/ActionContextMenu';
import { useNotificationStore } from '../../../store/useNotificationStore';

const presenceLabel = (status) => status === 'idle' ? 'Boşta' : status === 'dnd' ? 'Rahatsız etmeyin' : status === 'online' ? 'Çevrim içi' : 'Çevrim dışı';
const presenceDot = (status) => status === 'idle' ? 'bg-amber-300' : status === 'dnd' ? 'bg-rose-400' : status === 'online' ? 'bg-emerald-400' : 'bg-slate-600';
const formatDMTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
};
const dmPreview = (message) => message?.content?.trim() || (message?.image_url ? '🖼️ Fotoğraf' : '');

export function HomeLayout({ onOpenSearch, pendingDMId, onPendingDMHandled, onStartCall, incomingCallInvite, onAcceptCall, onDeclineCall, onInviteClick, navigationRequest }) {
  const { user } = useAuthStore();
  const searchShortcut = getAppPreferences(user?.id).searchShortcut || 'ctrl+k';
  const searchShortcutLabel = searchShortcut === 'alt+k' ? 'Alt K' : searchShortcut === 'ctrl+shift+k' ? 'Ctrl ⇧ K' : 'Ctrl K';
  const { friendships, dmChannels, sendFriendRequest, acceptFriendRequest, removeFriend, getOrCreateDM } = useFriendStore();
  const [activeTab, setActiveTab] = useState('all');
  const [addUsername, setAddUsername] = useState('');
  const [addStatus, setAddStatus] = useState(null);
  const [friendActionError, setFriendActionError] = useState('');
  const [activeDM, setActiveDM] = useState(null);
  const [dmContextMenu, setDmContextMenu] = useState(null);
  const presenceStatuses = usePresenceStore((state) => state.statuses);
  const presenceVisibility = usePresenceStore((state) => state.visibility);
  const voiceStatuses = usePresenceStore((state) => state.voiceStatuses);
  const ownPresenceStatus = usePresenceStore((state) => state.status);
  const [presenceClock, setPresenceClock] = useState(Date.now);
  const visiblePresence = (profile) => resolvePresenceStatus(profile?.id, presenceStatuses, presenceVisibility, voiceStatuses, presenceClock, user?.id, ownPresenceStatus);
  const dmUnreadCounts = useNotificationStore((state) => state.dmUnreadCounts);
  const markDMNotificationsRead = useNotificationStore((state) => state.markDMNotificationsRead);
  const setActiveDMChannel = useNotificationStore((state) => state.setActiveDMChannel);
  const [showGettingStarted, setShowGettingStarted] = useState(() => {
    try { return !localStorage.getItem(`fastcord:onboarding:${user?.id || 'guest'}`); } catch { return false; }
  });

  useEffect(() => {
    const timer = window.setInterval(() => setPresenceClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigationRequest?.tab) return;
    setActiveDM(null);
    setActiveTab(navigationRequest.tab);
  }, [navigationRequest?.id, navigationRequest?.tab]);

  useEffect(() => {
    if (!pendingDMId) return;
    const dm = dmChannels.find((channel) => channel.id === pendingDMId);
    if (!dm) return;
    const otherUser = dm.user1_id === user.id ? dm.user2 : dm.user1;
    setActiveDM({ id: dm.id, user: otherUser });
    onPendingDMHandled();
  }, [pendingDMId, dmChannels, user?.id, onPendingDMHandled]);

  useEffect(() => {
    setActiveDMChannel(activeDM?.id || null);
    if (activeDM?.id) void markDMNotificationsRead(activeDM.id);
    return () => setActiveDMChannel(null);
  }, [activeDM?.id, markDMNotificationsRead, setActiveDMChannel]);

  const openDM = async (otherUserId) => {
    const dm = await getOrCreateDM(otherUserId);
    if (dm) {
      const otherUser = dm.user1_id === user.id ? dm.user2 : dm.user1;
      const preferences = getAppPreferences(user?.id);
      if (preferences.hiddenDMIds.includes(dm.id)) saveAppPreferences(user.id, { ...preferences, hiddenDMIds: preferences.hiddenDMIds.filter((id) => id !== dm.id) });
      setActiveDM({ id: dm.id, user: otherUser });
    }
  };

  const appPreferences = getAppPreferences(user?.id);
  const hiddenDMIds = appPreferences.hiddenDMIds || [];
  const pinnedDMIds = appPreferences.pinnedDMIds || [];
  const visibleDMs = dmChannels.filter((dm) => !hiddenDMIds.includes(dm.id));
  const pinnedDMs = visibleDMs.filter((dm) => pinnedDMIds.includes(dm.id));
  const unpinnedDMs = visibleDMs.filter((dm) => !pinnedDMIds.includes(dm.id));
  const togglePinDM = (channelId) => {
    const preferences = getAppPreferences(user?.id);
    const pinned = preferences.pinnedDMIds || [];
    saveAppPreferences(user?.id, { ...preferences, pinnedDMIds: pinned.includes(channelId) ? pinned.filter((id) => id !== channelId) : [channelId, ...pinned] });
  };
  const hideDM = (channelId) => {
    const preferences = getAppPreferences(user?.id);
    if (!preferences.hiddenDMIds.includes(channelId)) saveAppPreferences(user?.id, { ...preferences, hiddenDMIds: [...preferences.hiddenDMIds, channelId] });
    if (activeDM?.id === channelId) setActiveDM(null);
  };
  const dmMenuItems = dmContextMenu ? [
    { id: 'pin-dm', label: pinnedDMIds.includes(dmContextMenu.dm.id) ? 'Sabitlemeyi kaldır' : 'DM’yi sabitle', icon: pinnedDMIds.includes(dmContextMenu.dm.id) ? PinOff : Pin, onSelect: () => togglePinDM(dmContextMenu.dm.id) },
    { id: 'copy-user-id', label: 'Kullanıcı ID’sini kopyala', icon: Copy, onSelect: () => { const id = dmContextMenu.otherUser?.public_id ?? dmContextMenu.otherUser?.id; if (id != null) void navigator.clipboard.writeText(String(id)); } },
    { separator: true },
    { id: 'hide-dm', label: 'DM listesinden kaldır', icon: Trash2, danger: true, onSelect: () => hideDM(dmContextMenu.dm.id) },
  ] : [];

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!addUsername.trim()) return;
    
    setAddStatus({ loading: true });
    const res = await sendFriendRequest(addUsername.trim());
    if (res.success) {
      setAddStatus({ success: true, message: `Arkadaşlık isteği gönderildi: ${addUsername}` });
      setAddUsername('');
    } else {
      setAddStatus({ success: false, message: res.error });
    }
  };

  const pendingRequests = friendships.filter(f => f.status === 'pending');
  const incomingRequestCount = pendingRequests.filter(request => request.addressee_id === user?.id).length;
  const acceptedFriends = friendships.filter(f => f.status === 'accepted');
  const onlineFriends = acceptedFriends.filter((friend) => {
    const profile = friend.requester_id === user.id ? friend.addressee : friend.requester;
    return visiblePresence(profile) !== 'offline';
  });
  const displayedFriends = activeTab === 'online' ? onlineFriends : acceptedFriends;

  return (
    <div className="macos-home flex-1 h-full min-h-0 flex min-w-0 bg-fastcord-bg">
      {/* İkincil Kenar Çubuğu (DM Listesi vb.) */}
      <div className="macos-rail h-full min-h-0 w-64 bg-[#11151d]/75 backdrop-blur-2xl flex flex-col shrink-0 border-r border-white/[0.06] relative z-10 shadow-[10px_0_30px_-15px_rgba(0,0,0,0.5)]">
        <div className="h-12 border-b border-white/5 flex items-center px-3 shrink-0">
           <button type="button" onClick={onOpenSearch} className="w-full bg-[#040608] border border-white/5 text-slate-400 text-sm py-1.5 px-3 rounded-lg text-left flex items-center gap-2 hover:bg-white/5 hover:text-slate-200 transition-colors">
              <span className="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400 font-bold">{searchShortcutLabel}</span> Sohbet bul veya başlat
           </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-2 custom-scrollbar space-y-1">
           <button onClick={() => { setActiveDM(null); setActiveTab('all'); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-all ${!activeDM && !['announcements', 'reminders', 'feed', 'saved'].includes(activeTab) ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 shadow-[inset_0_0_12px_rgba(139,92,246,0.1)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
              <Users className={`w-5 h-5 ${!activeDM ? 'text-violet-400' : ''}`} />
              <span className="font-bold text-sm">Arkadaşlar</span>
           </button>

           <div className="mt-4 border-t border-white/[0.06] pt-3">
             <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-600">Topluluk</p>
             <button onClick={() => { setActiveDM(null); setActiveTab('announcements'); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${activeTab === 'announcements' && !activeDM ? 'bg-amber-300/10 text-amber-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Megaphone className="h-4 w-4" /> Duyurular</button>
             <button onClick={() => { setActiveDM(null); setActiveTab('feed'); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${activeTab === 'feed' && !activeDM ? 'bg-violet-300/10 text-violet-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Rss className="h-4 w-4" /> Akış</button>
           </div>
           
           <div className="pt-5 pb-1 px-3 mt-4 border-t border-white/5">
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between cursor-pointer group hover:text-slate-300 transition-colors">
                  Özel Mesajlar
                  <button type="button" aria-label="Add a friend" onClick={() => { setActiveDM(null); setActiveTab('add'); }} className="rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white/10 hover:text-white"><Plus className="w-3.5 h-3.5 text-slate-300" /></button>
              </h3>
           </div>
           
           {pinnedDMs.length > 0 && <p className="mb-1 mt-2 px-3 text-[9px] font-bold uppercase tracking-[.15em] text-slate-600">Sabitlenenler</p>}
           {pinnedDMs.map(dm => {
             const otherUser = dm.user1_id === user.id ? dm.user2 : dm.user1;
             const isActive = activeDM?.id === dm.id;
             const unreadCount = dmUnreadCounts[dm.id] || 0;
             return (
               <div key={dm.id} onContextMenu={(event) => { event.preventDefault(); setDmContextMenu({ x: event.clientX, y: event.clientY, dm, otherUser }); }}>
                 <button type="button" onClick={() => setActiveDM({ id: dm.id, user: otherUser })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg group transition-all ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                   <img src={getAvatarUrl(otherUser?.avatar_url, otherUser?.username)} className="w-8 h-8 rounded-full bg-slate-800 object-cover shrink-0" alt="avatar" />
                   <span className="min-w-0 flex-1 truncate text-left"><span className="block truncate text-sm font-medium">{otherUser?.username}</span>{dm.last_message && <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-slate-500"><span className="min-w-0 flex-1 truncate">{dmPreview(dm.last_message)}</span><time className="shrink-0 text-[9px] text-slate-600">{formatDMTime(dm.last_message.created_at)}</time></span>}</span>
                   {unreadCount > 0 && <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-violet-400 px-1 text-[9px] font-bold text-slate-950">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                   {pinnedDMIds.includes(dm.id) && <Pin className="ml-auto h-3 w-3 shrink-0 text-violet-300/70" aria-label="Sabitlenmiş" />}
                 </button>
               </div>
             );
           })}
           {unpinnedDMs.length > 0 && pinnedDMs.length > 0 && <p className="mb-1 mt-3 border-t border-white/[0.06] px-3 pt-3 text-[9px] font-bold uppercase tracking-[.15em] text-slate-600">Özel mesajlar</p>}
           {unpinnedDMs.map(dm => {
             const otherUser = dm.user1_id === user.id ? dm.user2 : dm.user1;
             const isActive = activeDM?.id === dm.id;
             const unreadCount = dmUnreadCounts[dm.id] || 0;
             return <div key={dm.id} onContextMenu={(event) => { event.preventDefault(); setDmContextMenu({ x: event.clientX, y: event.clientY, dm, otherUser }); }}><button type="button" onClick={() => setActiveDM({ id: dm.id, user: otherUser })} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg group transition-all ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><img src={getAvatarUrl(otherUser?.avatar_url, otherUser?.username)} className="w-8 h-8 rounded-full bg-slate-800 object-cover shrink-0" alt="avatar" /><span className="min-w-0 flex-1 truncate text-left"><span className="block truncate text-sm font-medium">{otherUser?.username}</span>{dm.last_message && <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-slate-500"><span className="min-w-0 flex-1 truncate">{dmPreview(dm.last_message)}</span><time className="shrink-0 text-[9px] text-slate-600">{formatDMTime(dm.last_message.created_at)}</time></span>}</span>{unreadCount > 0 && <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-violet-400 px-1 text-[9px] font-bold text-slate-950">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button></div>;
           })}
        </div>
      </div>

      {/* Ana İçerik */}
      <div className="macos-main flex-1 h-full min-h-0 flex flex-col min-w-0 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,.055),_transparent_48%),#0B0E14] relative">
        {activeDM ? (
          <DMChatArea activeChannelId={activeDM.id} otherUser={activeDM.user} channelName={activeDM.user?.username} avatarUrl={getAvatarUrl(activeDM.user?.avatar_url, activeDM.user?.username)} onStartCall={onStartCall} incomingCallInvite={incomingCallInvite} onAcceptCall={onAcceptCall} onDeclineCall={onDeclineCall} onInviteClick={onInviteClick} />
        ) : (
          <>
            {/* Dekoratif Arka Plan Işığı */}
            <div className="absolute top-0 left-1/4 w-1/2 h-64 bg-violet-600/5 blur-[120px] rounded-full pointer-events-none"></div>

            {/* Üst Bar */}
            <div className="h-12 border-b border-white/5 flex items-center px-5 shrink-0 justify-between relative z-10 bg-fastcord-bg/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-white font-bold mr-2">
                        <Users className="w-5 h-5 text-slate-400" />
                        <span className="tracking-tight">{['announcements', 'reminders', 'feed', 'saved'].includes(activeTab) ? 'Fastlynox' : 'Arkadaşlar'}</span>
                    </div>
                    <div className="h-6 w-px bg-white/10 mx-1"></div>
                    <button onClick={() => setActiveTab('online')} className={`px-3 py-1 rounded-md text-sm font-bold flex items-center gap-1.5 transition-all duration-200 ${activeTab === 'online' ? 'bg-emerald-400/10 text-emerald-200 shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Çevrim içi<span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-400">{onlineFriends.length}</span></button>
                    <button onClick={() => setActiveTab('all')} className={`px-3 py-1 rounded-md text-sm font-bold transition-all duration-200 ${activeTab === 'all' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>Tümü</button>
                    <button onClick={() => setActiveTab('pending')} className={`px-3 py-1 rounded-md text-sm font-bold flex items-center gap-1.5 transition-all duration-200 ${activeTab === 'pending' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                      Bekleyen
                      {incomingRequestCount > 0 && <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none shadow-[0_0_10px_rgba(244,63,94,0.4)]">{incomingRequestCount}</span>}
                    </button>
                    <button onClick={() => setActiveTab('add')} className={`px-3 py-1 rounded-md text-sm font-bold transition-all duration-200 ${activeTab === 'add' ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'}`}>Arkadaş Ekle</button>
                    <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/10" />
                    <button onClick={() => { setActiveDM(null); setActiveTab('reminders'); }} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-bold transition-all duration-200 ${activeTab === 'reminders' ? 'bg-cyan-300/[0.1] text-cyan-100' : 'text-slate-400 hover:bg-white/5 hover:text-cyan-100'}`}><Clock3 className="h-3.5 w-3.5" /> Hatırlatıcılar</button>
                    <button onClick={() => { setActiveDM(null); setActiveTab('saved'); }} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-bold transition-all duration-200 ${activeTab === 'saved' ? 'bg-violet-300/[0.1] text-violet-100' : 'text-slate-400 hover:bg-white/5 hover:text-violet-100'}`}><Bookmark className="h-3.5 w-3.5" /> Kaydedilenler</button>
                </div>
                <button type="button" onClick={onOpenSearch} aria-label="Search messages" className="text-slate-400 hover:text-white transition-colors"><MessageSquare className="w-5 h-5" /></button>
            </div>

            {/* Tab İçerikleri */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative z-10">
                {activeTab === 'all' && showGettingStarted && <section aria-label="Fastlynox başlangıç rehberi" className="mb-6 flex flex-wrap items-center gap-4 rounded-[22px] border border-violet-200/10 bg-[linear-gradient(110deg,rgba(139,92,246,.10),rgba(34,211,238,.035),rgba(255,255,255,.015))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"><div className="min-w-48 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-200/75">Hızlı başlangıç</p><h2 className="mt-1 text-sm font-bold text-white">Fastlynox’da ilk adımların</h2><p className="mt-1 text-xs text-slate-400">Arkadaşlarını bul, mesajlarda ara ve sunucu topluluklarına katıl.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setActiveTab('add')} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10">Arkadaş ekle</button><button type="button" onClick={onOpenSearch} className="rounded-xl border border-violet-200/15 bg-violet-300/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-300/15">Sohbetlerde ara</button><button type="button" onClick={() => { setShowGettingStarted(false); try { localStorage.setItem(`fastcord:onboarding:${user?.id || 'guest'}`, 'done'); } catch { /* Onboarding can still be dismissed for this session. */ } }} className="rounded-xl p-2 text-slate-500 hover:bg-white/10 hover:text-white" aria-label="Başlangıç rehberini kapat"><X className="h-4 w-4" /></button></div></section>}
                {activeTab === 'add' && (
                  <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
                     <h2 className="text-white font-black tracking-tight mb-2 text-lg">ARKADAŞ EKLE</h2>
                     <p className="text-slate-400 text-sm mb-6">Fastlynox kullanıcı adlarını kullanarak arkadaşlarını ekleyebilirsin. Yeni insanlarla tanışma vakti!</p>
                     <form onSubmit={handleAddFriend} className={`flex items-center bg-[#0A0D14] rounded-xl px-4 py-3 border-2 transition-all duration-200 shadow-lg ${addStatus?.success === false ? 'border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.1)]' : addStatus?.success === true ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'border-white/5 focus-within:border-violet-500/50 focus-within:shadow-[0_0_20px_rgba(139,92,246,0.1)]'}`}>
                        <input
                          aria-label="Arkadaş eklenecek kullanıcı adı"
                          type="text" 
                          value={addUsername}
                          onChange={(e) => setAddUsername(e.target.value)}
                          placeholder="Kullanıcı adı girerek arkadaş ekle..." 
                          className="friend-add-input min-w-0 flex-1 border-0 bg-transparent text-white text-sm placeholder-slate-500 font-medium focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                        />
                        <button disabled={!addUsername.trim() || addStatus?.loading} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold px-6 py-2 rounded-lg transition-all shadow-[0_0_15px_rgba(139,92,246,0.4)] disabled:shadow-none ml-4">
                            İstek Gönder
                        </button>
                     </form>
                     {addStatus?.message && (
                        <p className={`mt-3 text-sm font-medium flex items-center gap-2 animate-in fade-in duration-200 ${addStatus.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {addStatus.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          {addStatus.message}
                        </p>
                     )}
                  </div>
                )}

                {activeTab === 'announcements' && <GlobalAnnouncements user={user} />}
                {activeTab === 'reminders' && <RemindersPanel user={user} />}
                {activeTab === 'feed' && <SocialFeed user={user} />}
                {activeTab === 'saved' && <SavedMessagesPanel user={user} />}

                {activeTab === 'pending' && (
                  <div className="animate-in fade-in duration-300">
                      <h2 className="text-slate-400 text-xs font-black tracking-widest mb-6">BEKLEYEN İSTEKLER — {pendingRequests.length}</h2>
                      {friendActionError && <p role="alert" className="mb-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-xs text-rose-200">{friendActionError}</p>}
                      {pendingRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                           <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 shadow-inner">
                             <UserPlus className="w-10 h-10 text-slate-600" />
                           </div>
                           <p className="font-medium text-slate-400">Bekleyen bir arkadaşlık isteğin yok.</p>
                           <p className="text-sm text-slate-500 mt-1">Görünüşe göre herkesle arkadaşsın, ya da hiç kimseyle...</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pendingRequests.map(req => {
                            const isIncoming = req.addressee_id === user.id;
                            const otherProfile = isIncoming ? req.requester : req.addressee;

                            return (
                              <div key={req.id} className="flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] p-3 rounded-xl group border border-white/5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
                                 <div className="flex items-center gap-4">
                                    <img src={getAvatarUrl(otherProfile?.avatar_url, otherProfile?.username)} className="w-10 h-10 rounded-full bg-[#11151E] object-cover shadow-sm" alt="avatar" />
                                    <div className="flex flex-col">
                                       <span className="text-white font-bold text-sm">{otherProfile?.username}</span>
                                       <span className={`text-xs font-medium ${isIncoming ? 'text-violet-400' : 'text-slate-400'}`}>{isIncoming ? 'Gelen İstek' : 'Giden İstek'}</span>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-2 pr-2">
                                    {isIncoming && (
                                      <button onClick={async () => { const result = await acceptFriendRequest(req.id); setFriendActionError(result?.success ? '' : result?.error || 'İstek kabul edilemedi.'); }} className="w-9 h-9 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all">
                                         <Check className="w-4 h-4" />
                                      </button>
                                    )}
                                      <button onClick={async () => { const result = await removeFriend(req.id); setFriendActionError(result?.success ? '' : result?.error || 'İstek kaldırılamadı.'); }} className="w-9 h-9 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:shadow-[0_0_15px_rgba(244,63,94,0.2)] transition-all">
                                       <X className="w-4 h-4" />
                                    </button>
                                 </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                )}

                {['all', 'online'].includes(activeTab) && (
                  <div className="animate-in fade-in duration-300">
                      <h2 className="text-slate-400 text-xs font-black tracking-widest mb-6">{activeTab === 'online' ? `ÇEVRİM İÇİ — ${onlineFriends.length}` : `TÜM ARKADAŞLAR — ${acceptedFriends.length}`}</h2>
                      {displayedFriends.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                           <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 shadow-inner">
                             <Users className="w-10 h-10 text-slate-600" />
                           </div>
                           <p className="font-medium text-slate-400">{activeTab === 'online' ? 'Şu anda çevrim içi arkadaşın yok.' : 'Hiç arkadaşın yok. Wumpus senin için burada.'}</p>
                           {activeTab === 'all' && <button onClick={() => setActiveTab('add')} className="mt-6 bg-violet-600/20 border border-violet-500/50 text-violet-400 px-6 py-2 rounded-lg font-bold hover:bg-violet-600 hover:text-white transition-all shadow-[0_0_15px_rgba(139,92,246,0.2)]">Arkadaş Ekle</button>}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {displayedFriends.map(friend => {
                            const otherProfile = friend.requester_id === user.id ? friend.addressee : friend.requester;
                            const friendPresence = visiblePresence(otherProfile);
                            
                            return (
                              <div key={friend.id} onClick={(e) => { e.stopPropagation(); openDM(otherProfile.id); }} className="flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] p-3 rounded-xl group border border-white/5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer">
                                 <div className="flex items-center gap-4">
                                    <div className="relative">
                                      <img src={getAvatarUrl(otherProfile?.avatar_url, otherProfile?.username)} className="w-10 h-10 rounded-full bg-[#11151E] object-cover shadow-sm" alt="avatar" />
                                      <div title={presenceLabel(friendPresence)} className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 ${presenceDot(friendPresence)} border-[3px] border-fastcord-bg rounded-full`}></div>
                                    </div>
                                    <div className="flex flex-col">
                                       <span className="text-white font-bold text-sm group-hover:text-violet-300 transition-colors">{otherProfile?.username}</span>
                                       <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium"><span className={`h-1.5 w-1.5 rounded-full ${presenceDot(friendPresence)}`} />{presenceLabel(friendPresence)}</span>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-2 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); openDM(otherProfile.id); }} className="w-9 h-9 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-slate-400 hover:text-violet-400 hover:border-violet-500/30 hover:bg-violet-500/10 hover:shadow-[0_0_15px_rgba(139,92,246,0.2)] transition-all">
                                       <MessageSquare className="w-4 h-4" />
                                    </button>
                                    <button onClick={async (e) => { e.stopPropagation(); const result = await removeFriend(friend.id); setFriendActionError(result?.success ? '' : result?.error || 'Arkadaş kaldırılamadı.'); }} className="w-9 h-9 rounded-full bg-black/40 border border-white/5 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 hover:shadow-[0_0_15px_rgba(244,63,94,0.2)] transition-all">
                                       <X className="w-4 h-4" />
                                    </button>
                                 </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                )}
            </div>
            
          </>
        )}
      </div>
      <ActionContextMenu position={dmContextMenu} items={dmMenuItems} onClose={() => setDmContextMenu(null)} label="Özel mesaj işlemleri" />
    </div>
  );
}
