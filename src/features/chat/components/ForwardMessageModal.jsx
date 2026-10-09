import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Forward, Search, X } from 'lucide-react';
import { useFriendStore } from '../../../store/useFriendStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { useDMChatStore } from '../../../store/useDMChatStore';
import { getAvatarUrl } from '../../../lib/profileMedia';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function ForwardMessageModal({ message, onClose }) {
  const { user } = useAuthStore();
  const { dmChannels } = useFriendStore();
  const [search, setSearch] = useState('');
  const [sendingTo, setSendingTo] = useState('');
  const [error, setError] = useState('');
  useEscapeClose(onClose, !sendingTo);
  const channels = useMemo(() => dmChannels.map((dm) => ({
    id: dm.id,
    user: dm.user1_id === user?.id ? dm.user2 : dm.user1,
  })).filter((item) => item.user?.id && item.user.id !== message.user_id && item.user.username?.toLowerCase().includes(search.toLowerCase())), [dmChannels, user?.id, message.user_id, search]);

  const forwardTo = async (channel) => {
    if (sendingTo) return;
    setSendingTo(channel.id); setError('');
    const author = message.profiles?.username || 'Kullanıcı';
    const text = `↪ ${author} tarafından iletildi${message.content ? `\n${message.content}` : ''}`;
    const result = await useDMChatStore.getState().sendMessage(channel.id, text, message.image_url || null);
    if (!result?.success) { setError(result?.error || 'Mesaj iletilemedi.'); setSendingTo(''); return; }
    onClose();
  };

  return createPortal(<div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#111722]/95 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-3 border-b border-white/[0.07] p-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-400/10 text-violet-200"><Forward className="h-4 w-4" /></div><div className="min-w-0 flex-1"><h2 className="font-semibold text-white">Mesajı ilet</h2><p className="truncate text-xs text-slate-500">{message.content || 'Ek'}</p></div><button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
      <div className="p-4"><label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3"><Search className="h-4 w-4 text-slate-500" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="DM ara" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></label>
        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">{channels.map((channel) => <button key={channel.id} type="button" disabled={Boolean(sendingTo)} onClick={() => void forwardTo(channel)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.06] disabled:opacity-60"><img src={getAvatarUrl(channel.user.avatar_url, channel.user.username)} alt="" className="h-9 w-9 rounded-full object-cover" /><span className="flex-1 truncate text-sm text-slate-200">{channel.user.username}</span><span className="text-xs text-violet-200">{sendingTo === channel.id ? 'İletiliyor…' : 'İlet'}</span></button>)}{!channels.length && <p className="py-8 text-center text-sm text-slate-500">Uygun DM bulunamadı.</p>}</div>
        {error && <p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
      </div>
    </div>
  </div>, document.body);
}
