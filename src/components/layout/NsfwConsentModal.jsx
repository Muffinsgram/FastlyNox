import { createPortal } from 'react-dom';
import { Flame, ShieldCheck, X } from 'lucide-react';
import { useEscapeClose } from '../../hooks/useEscapeClose';

export function NsfwConsentModal({ channelName, onContinue, onCancel }) {
  useEscapeClose(onCancel);

  return createPortal(
    <div className="fixed inset-0 z-[950] grid place-items-center bg-[#05070b]/75 p-4 backdrop-blur-md animate-in fade-in duration-150" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="nsfw-title" aria-describedby="nsfw-description" className="w-full max-w-md overflow-hidden rounded-[20px] border border-rose-200/15 bg-[radial-gradient(ellipse_at_top_right,rgba(251,113,133,.13),transparent_55%),linear-gradient(145deg,#171a24,#10131b)] shadow-[0_32px_110px_rgba(0,0,0,.72)] animate-in zoom-in-95 duration-200">
        <header className="flex items-start gap-3 border-b border-white/[0.07] px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border border-rose-200/15 bg-rose-300/[0.09] text-rose-200"><Flame className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1 pt-0.5"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-rose-200/65">İçerik uyarısı</p><h2 id="nsfw-title" className="mt-1 text-base font-bold text-white">18+ kanala geçilsin mi?</h2></div>
          <button type="button" onClick={onCancel} aria-label="Kapat" className="grid h-8 w-8 place-items-center rounded-[10px] text-slate-400 transition hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button>
        </header>
        <div className="px-5 py-5">
          <div className="rounded-[14px] border border-rose-200/[0.09] bg-rose-300/[0.035] px-4 py-3"><p className="text-sm font-semibold text-slate-100">#{channelName}</p><p id="nsfw-description" className="mt-1 text-xs leading-5 text-slate-400">Bu kanal yetişkinlere yönelik olarak işaretlenmiş. Devam ederek 18 yaşından büyük olduğunu ve kanala göz atmak istediğini onaylıyorsun.</p></div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Bu uyarı bu cihazda bir kez gösterilir.</div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/[0.07] bg-black/10 px-5 py-4">
          <button type="button" onClick={onCancel} className="rounded-[12px] border border-white/[0.09] bg-white/[0.035] px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white">Geri dön</button>
          <button type="button" onClick={onContinue} className="rounded-[12px] bg-gradient-to-r from-rose-400 to-orange-400 px-4 py-2.5 text-xs font-bold text-[#1b1013] shadow-lg shadow-rose-950/30 transition hover:brightness-110">Kanala geç</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
