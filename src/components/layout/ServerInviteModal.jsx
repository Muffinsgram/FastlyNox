import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, LoaderCircle, ShieldAlert, Users, X, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function ServerInviteModal({ inviteCode, authenticated, onClose, onJoin }) {
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!inviteCode) return undefined;
    let active = true;
    void supabase.rpc('get_server_invite_preview', { invite_code: inviteCode }).then(({ data, error }) => {
      if (!active) return;
      const server = Array.isArray(data) ? data[0] : data;
      if (error || !server) { setStatus('missing'); return; }
      setPreview(server);
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [inviteCode]);

  useEffect(() => {
    if (!inviteCode) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inviteCode, busy, onClose]);

  if (!inviteCode) return null;
  const handleJoin = async () => {
    if (!authenticated) { window.location.assign(`/app?invite=${encodeURIComponent(inviteCode)}`); return; }
    setBusy(true);
    setMessage('');
    try {
      const result = await onJoin?.(inviteCode);
      if (result?.success) onClose?.();
      else setMessage(result?.error || 'Davet şu anda kullanılamadı.');
    } catch {
      setMessage('Sunucuya katılma işlemi tamamlanamadı. Yeniden dene.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(<div className="fixed inset-0 z-[1300] grid place-items-center bg-[#03050a]/80 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose?.(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="invite-title" className="w-full max-w-[440px] overflow-hidden rounded-[26px] border border-white/[0.12] bg-[linear-gradient(155deg,#1a2030,#10141d_60%,#111421)] shadow-[0_32px_110px_rgba(0,0,0,.72)] animate-in fade-in zoom-in-95 duration-200">
      <div className="relative h-32 overflow-hidden bg-[radial-gradient(ellipse_at_50%_20%,rgba(139,110,255,.34),transparent_65%),linear-gradient(135deg,#16162c,#111823)]">
        {preview?.server_icon_url && <img src={preview.server_icon_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-xl" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#151a25] via-[#121724]/30 to-transparent" />
        <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-black/20 text-slate-300 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        <div className="absolute bottom-3 left-5 flex items-end gap-3"><div className="grid h-[58px] w-[58px] place-items-center overflow-hidden rounded-[18px] border border-white/15 bg-[#25283e] text-xl font-black text-violet-100 shadow-xl">{preview?.server_icon_url ? <img src={preview.server_icon_url} alt="" className="h-full w-full object-cover" /> : preview?.server_name?.slice(0, 1) || <Zap className="h-6 w-6" />}</div><div className="pb-1"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-violet-200/80">Sunucu daveti</p><h2 id="invite-title" className="mt-1 max-w-[290px] truncate text-lg font-extrabold text-white">{status === 'ready' ? preview.server_name : 'Fastlynox topluluğu'}</h2></div></div>
      </div>
      <div className="p-5 pt-4">
        {status === 'loading' && <div className="flex min-h-20 items-center justify-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin text-violet-200" /> Davet bilgileri yükleniyor…</div>}
        {status === 'ready' && <><p className="text-xs leading-5 text-slate-400">Bu sunucuya katılarak sohbete, topluluk etkinliklerine ve ses odalarına erişebilirsin.</p><div className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-black/15 px-3.5 py-3"><span className="flex items-center gap-2 text-[11px] font-medium text-slate-300"><Users className="h-4 w-4 text-violet-200" /> Sunucu üyeleri</span><strong className="text-sm text-white">{Number(preview.member_count || 0).toLocaleString('tr-TR')}</strong></div>{preview.is_vanity && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-200"><Check className="h-3.5 w-3.5" /> Resmî özel davet bağlantısı</p>}</>}
        {(status === 'missing' || status === 'error') && <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200/10 bg-amber-200/[0.04] p-3 text-xs leading-5 text-amber-100/90"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{status === 'missing' ? 'Bu davet geçersiz, süresi dolmuş veya kullanım sınırına ulaşmış.' : 'Davet bilgileri şu anda yüklenemedi. Biraz sonra yeniden dene.'}</div>}
        {message && <p role="alert" className="mt-3 rounded-xl border border-rose-300/15 bg-rose-400/[0.05] px-3 py-2 text-xs text-rose-200">{message}</p>}
        <div className="mt-5 flex gap-2"><button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-white/[0.09] px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05]">Şimdi değil</button><button type="button" onClick={() => void handleJoin()} disabled={status !== 'ready' || busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : authenticated ? 'Sunucuya katıl' : 'Giriş yap ve katıl'} {!busy && <ArrowRight className="h-3.5 w-3.5" />}</button></div>
      </div>
    </section>
  </div>, document.body);
}
