import React, { useEffect, useState } from 'react';
import { X, Hash, Volume2, LockKeyhole, Shield, Flame } from 'lucide-react';
import { useServerStore } from '../../../store/useServerStore';
import { supabase } from '../../../lib/supabase';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function CreateChannelModal({ serverId, categoryId, categoryName, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isNsfw, setIsNsfw] = useState(false);
  const [roles, setRoles] = useState([]);
  const [visibleRoleIds, setVisibleRoleIds] = useState([]);
  useEscapeClose(onClose, !isSubmitting);
  const { createChannel } = useServerStore();

  useEffect(() => {
    let active = true;
    void supabase.from('server_roles').select('id,name,color').eq('server_id', serverId).order('position', { ascending: false })
      .then(({ data }) => { if (active) setRoles(data || []); });
    return () => { active = false; };
  }, [serverId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (trimmedName.length > 100) {
      setError('Channel names can be at most 100 characters.');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    // Format name (lowercase, no spaces for text channels)
    const formattedName = type === 'text' ? trimmedName.toLowerCase().replace(/\s+/g, '-') : trimmedName;
    const result = await createChannel(serverId, categoryId, formattedName, type, { topic: topic.trim(), isPrivate, nsfw: isNsfw, visibleRoleIds });
    setIsSubmitting(false);
    if (result?.success) onClose();
    else setError(result?.error || 'Could not create this channel. Check your server permissions.');
  };

  return (
    <div className="fixed inset-0 z-[500] bg-black/70 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="max-h-[90vh] bg-[#111722] w-full max-w-lg rounded-[24px] border border-white/10 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-100">{categoryName ? `${categoryName} içinde kanal oluştur` : 'Kanal oluştur'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-5">
          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Kanal Türü</p>
          <div className="space-y-2 mb-6">
            <button 
              type="button"
              onClick={() => setType('text')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border ${type === 'text' ? 'bg-[#404249] border-white/10' : 'bg-[#2B2D31] border-transparent hover:bg-[#35373C]'} transition-colors`}
            >
              <Hash className="w-6 h-6 text-slate-400" />
              <div className="text-left flex-1">
                <div className="font-bold text-slate-200 text-sm">Metin Kanalı</div>
                <div className="text-xs text-slate-400">Mesaj, resim, GIF ve ifade gönderin.</div>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${type === 'text' ? 'border-white' : 'border-slate-500'}`}>
                {type === 'text' && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
            </button>

            <button 
              type="button"
              onClick={() => setType('voice')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border ${type === 'voice' ? 'bg-[#404249] border-white/10' : 'bg-[#2B2D31] border-transparent hover:bg-[#35373C]'} transition-colors`}
            >
              <Volume2 className="w-6 h-6 text-slate-400" />
              <div className="text-left flex-1">
                <div className="font-bold text-slate-200 text-sm">Ses Kanalı</div>
                <div className="text-xs text-slate-400">Sesli sohbet, video ve ekran paylaşımı yapın.</div>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${type === 'voice' ? 'border-white' : 'border-slate-500'}`}>
                {type === 'voice' && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
            </button>
          </div>

          <p className="text-xs font-bold text-slate-400 uppercase mb-2">Kanal Adı</p>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {type === 'text' ? <Hash className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </div>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="yeni-kanal"
              maxLength={100}
              aria-label="Channel name"
              className="w-full bg-[#1E1F22] border-none text-slate-200 px-9 py-2.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <label className="mt-4 block text-xs font-bold uppercase text-slate-400">Konu <span className="font-normal normal-case text-slate-500">· isteğe bağlı</span><input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={240} placeholder="Bu kanalın amacı nedir?" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm font-normal normal-case text-white outline-none placeholder:text-slate-500 focus:border-violet-300/35" /></label>
          <div className="mt-4 space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="accent-violet-400" /><LockKeyhole className="h-4 w-4 text-violet-200" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-200">Gizli kanal</span><span className="mt-0.5 block text-[10px] text-slate-500">Yalnızca seçilen roller ve sen görebilirsiniz.</span></span></label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><input type="checkbox" checked={isNsfw} onChange={(event) => setIsNsfw(event.target.checked)} className="accent-rose-400" /><Flame className="h-4 w-4 text-rose-300" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-200">18+ içerik kanalı</span><span className="mt-0.5 block text-[10px] text-slate-500">Kanal listesinde yaş uyarısı gösterilir.</span></span></label>
          </div>
          {isPrivate && <div className="mt-3 rounded-xl border border-violet-200/10 bg-violet-300/[0.04] p-3"><p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-violet-100"><Shield className="h-3.5 w-3.5" />Kanala erişebilecek roller</p>{roles.length ? <div className="flex flex-wrap gap-2">{roles.map((role) => <label key={role.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-black/15 px-2.5 py-1.5 text-[10px] text-slate-200"><input type="checkbox" checked={visibleRoleIds.includes(role.id)} onChange={(event) => setVisibleRoleIds((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} className="accent-violet-400" /><span style={{ color: role.color }}>{role.name}</span></label>)}</div> : <p className="text-[10px] leading-4 text-slate-500">Özel rol oluşturulmadı. Gizli kanala yalnızca sen ve yöneticiler erişebilir.</p>}</div>}
          {error && <p role="alert" className="mt-3 rounded-xl border border-rose-300/10 bg-rose-300/[0.04] px-3 py-2 text-xs text-rose-200">{error}</p>}
        </div>

        <div className="border-t border-white/[0.07] bg-black/10 p-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-slate-300 hover:underline px-4 py-2 text-sm font-medium">İptal</button>
          <button 
            onClick={handleSubmit} 
            disabled={!name.trim() || isSubmitting}
            className="bg-gradient-to-r from-violet-500 to-indigo-500 hover:brightness-110 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Creating…' : 'Kanal oluştur'}
          </button>
        </div>
      </div>
    </div>
  );
}
