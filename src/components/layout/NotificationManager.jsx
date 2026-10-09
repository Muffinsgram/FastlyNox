import React, { useEffect } from 'react';
import { Bell, MessageSquare, X } from 'lucide-react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useAuthStore } from '../../store/useAuthStore';

export function NotificationManager({ onOpenNotification }) {
  const { user } = useAuthStore();
  const { fetchNotifications, subscribeToNotifications, unsubscribe, activeToasts, removeToast } = useNotificationStore();
  const userId = user?.id;

  useEffect(() => {
    if (userId) {
      fetchNotifications();
      subscribeToNotifications();
    }
    
    return () => {
      unsubscribe();
    };
  }, [userId, fetchNotifications, subscribeToNotifications, unsubscribe]);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {activeToasts.map((toast) => (
        <div key={toast.id} role="button" tabIndex={0} onClick={() => { onOpenNotification?.(toast); removeToast(toast.id); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenNotification?.(toast); removeToast(toast.id); } }} className="pointer-events-auto w-80 cursor-pointer bg-[#11151E]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 flex gap-4 animate-in slide-in-from-right-8 fade-in duration-300 hover:border-violet-300/25 focus:outline-none focus:ring-2 focus:ring-violet-300/50">
           <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
             {toast.type === 'dm_message' ? <MessageSquare className="w-5 h-5 text-violet-400" /> : <Bell className="w-5 h-5 text-violet-400" />}
           </div>
           <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-start justify-between gap-2">
                 <span className="font-bold text-slate-200 text-sm truncate">{toast.title}</span>
                 <button onClick={(event) => { event.stopPropagation(); removeToast(toast.id); }} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0">
                    <X className="w-4 h-4" />
                 </button>
              </div>
              <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{toast.body}</p>
              {toast.channel_id && <p className="mt-2 text-[10px] font-semibold text-violet-200">Kanala git →</p>}
           </div>
        </div>
      ))}
    </div>
  );
}
