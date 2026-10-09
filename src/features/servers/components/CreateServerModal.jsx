import React, { useState } from 'react';
import { X, Upload, Plus, ChevronRight } from 'lucide-react';
import { useServerStore } from '../../../store/useServerStore';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function CreateServerModal({ onClose }) {
  const [mode, setMode] = useState('initial'); // 'initial', 'create', 'join'
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const { createServer, joinServer } = useServerStore();
  useEscapeClose(onClose, !isCreating);

  const handleCreate = async () => {
    if (!serverName.trim()) return;
    setIsCreating(true);
    setError('');
    const result = await createServer(serverName);
    setIsCreating(false);
    if (result?.success) onClose();
    else setError(result?.error || 'Sunucu oluşturulamadı.');
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setIsCreating(true);
    setError('');
    const result = await joinServer(inviteCode.trim());
    setIsCreating(false);
    if (result?.success) onClose();
    else setError(result?.error || 'Could not join this server.');
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-fastcord-panel w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {mode === 'initial' && (
          <>
            <div className="p-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Sunucu Oluştur</h2>
              <p className="text-slate-400 text-sm">Sunucun senin ve arkadaşlarının takıldığı yerdir. Kendi sunucunu oluştur ve sohbete başla.</p>
            </div>
            
            <div className="px-6 flex flex-col gap-3 pb-6">
              <button onClick={() => setMode('create')} className="w-full bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-violet-500/50 p-4 rounded-xl flex items-center justify-between transition-all group">
                 <div className="flex items-center gap-4">
                   <div className="bg-violet-500/20 text-violet-400 p-2.5 rounded-lg"><Plus className="w-6 h-6" /></div>
                   <span className="font-bold text-slate-200">Kendi Sunucumu Oluştur</span>
                 </div>
                 <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors" />
              </button>
            </div>

            <div className="bg-[#181F2A] p-6 text-center">
               <h3 className="text-lg font-bold text-white mb-2">Zaten bir davetin var mı?</h3>
               <button onClick={() => setMode('join')} className="w-full bg-slate-600/20 hover:bg-slate-600/40 text-white font-bold py-2.5 rounded-lg transition-colors">Sunucuya Katıl</button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <div className="p-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Sunucunu Özelleştir</h2>
              <p className="text-slate-400 text-sm">Sunucuna bir isim ve ikon vererek ona bir kişilik kazandır. Bunu daha sonra değiştirebilirsin.</p>
            </div>

            <div className="px-6 flex flex-col items-center">
              <div className="w-20 h-20 border-2 border-dashed border-slate-500 rounded-full flex flex-col items-center justify-center text-slate-400 hover:text-white hover:border-violet-400 cursor-pointer transition-colors mb-6 group">
                 <Upload className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                 <div className="text-[10px] font-bold">YÜKLE</div>
              </div>

              <div className="w-full text-left">
                <label className="text-[11px] font-bold text-slate-400 uppercase mb-2 block">Sunucu Adı</label>
                <input 
                  type="text" 
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  className="w-full bg-[#11151E] border border-white/5 focus:border-violet-500 rounded-md py-2.5 px-3 text-white text-sm focus:outline-none transition-colors" 
                  placeholder="Yeni Sunucum" 
                />
                {error && <p role="alert" className="mt-2 text-xs text-rose-400">{error}</p>}
              </div>
            </div>

            <div className="bg-[#181F2A] p-4 mt-6 flex justify-between items-center">
              <button onClick={() => setMode('initial')} className="text-slate-300 hover:underline text-sm font-medium">Geri</button>
              <button onClick={handleCreate} disabled={!serverName.trim() || isCreating} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-2 rounded-md font-bold text-sm transition-colors flex items-center gap-2">
                {isCreating ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <>
            <div className="p-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Bir Sunucuya Katıl</h2>
              <p className="text-slate-400 text-sm">Aşağıya bir davet kodu girerek mevcut bir sunucuya katıl.</p>
            </div>

            <div className="px-6 flex flex-col">
              <div className="w-full text-left">
                <label className="text-[11px] font-bold text-slate-400 uppercase mb-2 block">Davet Kodu veya Bağlantısı</label>
                <input 
                  type="text" 
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full bg-[#11151E] border border-white/5 focus:border-emerald-500 rounded-md py-2.5 px-3 text-white text-sm focus:outline-none transition-colors" 
                  placeholder={`${window.location.host}/invite/ab12cd34ef`}
                />
              </div>
              <div className="mt-4 p-3 bg-white/[0.02] rounded-lg border border-white/5">
                 <h4 className="text-xs font-bold text-slate-300 mb-1">Kısa davet kodu veya bağlantısı</h4>
                 <code className="text-xs text-slate-500 font-mono">{window.location.host}/invite/ab12cd34ef</code>
              </div>
              {error && <p role="alert" className="mt-2 text-xs text-rose-400">{error}</p>}
            </div>

            <div className="bg-[#181F2A] p-4 mt-6 flex justify-between items-center">
              <button onClick={() => setMode('initial')} className="text-slate-300 hover:underline text-sm font-medium">Geri</button>
              <button onClick={handleJoin} disabled={!inviteCode.trim() || isCreating} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-6 py-2 rounded-md font-bold text-sm transition-colors flex items-center gap-2">
                {isCreating ? 'Katılınıyor...' : 'Sunucuya Katıl'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
