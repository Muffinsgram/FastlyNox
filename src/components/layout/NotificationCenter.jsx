import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Hash, MessageSquare, UserCheck, UserPlus, X } from 'lucide-react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useServerStore } from '../../store/useServerStore';

export function NotificationCenter({ onOpenNotification, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const notifications = useNotificationStore((state) => state.notifications);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const servers = useServerStore((state) => state.servers);
  const visibleNotifications = filter === 'unread' ? notifications.filter((notification) => !notification.is_read) : notifications;

  const getLocation = (notification) => {
    if (!notification.server_id) return notification.type === 'dm_message' ? 'Özel mesaj' : 'Fastlynox';
    const server = servers.find((item) => item.id === notification.server_id);
    const channel = server?.categories?.flatMap((category) => category.channels || []).find((item) => item.id === notification.channel_id);
    return [server?.name, channel?.name ? `#${channel.name}` : null].filter(Boolean).join(' · ') || 'Sunucu kanalı';
  };

  const openNotification = (notification) => {
    if (!notification.is_read) void markAsRead(notification.id);
    setIsOpen(false);
    onOpenNotification?.(notification);
  };

  return <>
    <button type="button" aria-label={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ''}`} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)} className={`relative grid h-8 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 transition duration-200 hover:border-violet-200/20 hover:bg-violet-200/[0.07] hover:text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 ${className}`}>
      <Bell className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'scale-110 text-violet-100' : ''}`} />{unreadCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-[#080b10] bg-rose-400 px-1 text-[8px] font-black text-slate-950">{unreadCount > 9 ? '9+' : unreadCount}</span>}
    </button>
    {isOpen && createPortal(<>
      <button type="button" aria-label="Bildirim panelini kapat" onClick={() => setIsOpen(false)} className="fixed inset-0 z-[110] cursor-default bg-transparent" />
      <section aria-label="Bildirim merkezi" className="dropdown-surface fixed right-[184px] top-12 z-[111] flex max-h-[min(70vh,38rem)] w-[min(23rem,calc(100vw-10rem))] flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#111722]/95 shadow-[0_24px_80px_rgba(0,0,0,.65)] backdrop-blur-2xl">
        <header className="flex items-center gap-3 border-b border-white/[0.07] p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><Bell className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-white">Bildirimler</h2><p className="text-[10px] text-slate-500">{unreadCount ? `${unreadCount} okunmamış` : 'Hepsi güncel'}</p></div>{unreadCount > 0 && <button type="button" title="Tümünü okundu işaretle" onClick={() => void markAllAsRead()} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.07] hover:text-violet-100"><CheckCheck className="h-4 w-4" /></button>}<button type="button" aria-label="Kapat" onClick={() => setIsOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button></header>
        <div className="flex gap-1 border-b border-white/[0.06] px-3 py-2"><button type="button" onClick={() => setFilter('all')} className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold ${filter === 'all' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200'}`}>Tümü</button><button type="button" onClick={() => setFilter('unread')} className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold ${filter === 'unread' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200'}`}>Okunmamış{unreadCount > 0 ? ` · ${unreadCount}` : ''}</button></div>
        <div className="min-h-24 flex-1 overflow-y-auto p-2">{visibleNotifications.length ? visibleNotifications.map((notification) => <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`group flex w-full gap-3 rounded-2xl p-3 text-left transition hover:bg-white/[0.06] ${notification.is_read ? 'opacity-65' : 'bg-violet-300/[0.035]'}`}><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${notification.type === 'dm_message' ? 'bg-cyan-300/10 text-cyan-200' : notification.type.startsWith('friend_') ? 'bg-emerald-300/10 text-emerald-200' : 'bg-violet-300/10 text-violet-200'}`}>{notification.type === 'dm_message' ? <MessageSquare className="h-4 w-4" /> : notification.type === 'friend_request' ? <UserPlus className="h-4 w-4" /> : notification.type === 'friend_accepted' ? <UserCheck className="h-4 w-4" /> : notification.channel_id ? <Hash className="h-4 w-4" /> : <Bell className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-slate-100">{notification.title}</span>{!notification.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-300" />}</span><span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-slate-400">{notification.body}</span><span className="mt-1.5 block truncate text-[9px] font-medium text-slate-500">{getLocation(notification)} · {new Date(notification.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</span></span></button>) : <div className="px-5 py-10 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.04] text-slate-500"><CheckCheck className="h-5 w-5" /></span><p className="mt-3 text-xs font-semibold text-slate-300">{filter === 'unread' ? 'Okunmamış bildirim yok' : 'Şimdilik bildirim yok'}</p><p className="mt-1 text-[10px] text-slate-500">Etiketler ve yeni mesajlar burada görünür.</p></div>}</div>
      </section>
    </>, document.body)}
  </>;
}
