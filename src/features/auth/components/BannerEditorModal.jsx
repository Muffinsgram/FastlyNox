import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Move, RotateCcw, Save, X } from 'lucide-react';
import { removeProfileImage, uploadProfileImage } from '../../../lib/profileMedia';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

const clamp = (value) => Math.min(100, Math.max(0, value));

export function BannerEditorModal({ userId, value, positionX, positionY, zoom, onClose, onApply }) {
  const [previewUrl, setPreviewUrl] = useState(value || '');
  const [x, setX] = useState(positionX ?? 50);
  const [y, setY] = useState(positionY ?? 50);
  const [scale, setScale] = useState(zoom ?? 1);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [uploadPath, setUploadPath] = useState('');
  const inputRef = useRef(null);
  const previewRef = useRef(null);
  const dragRef = useRef(null);

  const close = async () => {
    if (uploadPath) await removeProfileImage(uploadPath);
    onClose();
  };
  useEscapeClose(close, progress === null);

  const selectFile = async (file) => {
    setError('');
    setProgress(0);
    try {
      const uploaded = await uploadProfileImage(file, userId, 'banner', setProgress);
      if (uploadPath) await removeProfileImage(uploadPath);
      setUploadPath(uploaded.path);
      setPreviewUrl(uploaded.url);
      setX(50); setY(50); setScale(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Banner yüklenemedi.');
    } finally { setProgress(null); }
  };

  const handlePointerDown = (event) => {
    if (!previewUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, positionX: x, positionY: y };
  };
  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!drag || !rect || !event.buttons) return;
    setX(clamp(drag.positionX - (event.clientX - drag.x) / rect.width * 100));
    setY(clamp(drag.positionY - (event.clientY - drag.y) / rect.height * 100));
  };

  return createPortal(<div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-6" onClick={() => void close()}>
    <section role="dialog" aria-modal="true" aria-labelledby="banner-editor-title" className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#111722]/95 shadow-[0_28px_100px_rgba(0,0,0,.65)]" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/10 text-violet-100"><Move className="h-4 w-4" /></div><div className="min-w-0 flex-1"><h2 id="banner-editor-title" className="font-semibold text-white">Bannerını düzenle</h2><p className="mt-0.5 text-xs text-slate-500">GIF animasyonu korunur · sürükleyerek kadrajı ayarla</p></div><button type="button" onClick={() => void close()} aria-label="Düzenleyiciyi kapat" className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></header>
      <div className="space-y-5 p-5 sm:p-6">
        <div ref={previewRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => { dragRef.current = null; }} className="relative aspect-[2.7/1] touch-none cursor-move overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,.45),transparent_60%),linear-gradient(120deg,#151b28,#10141e)]">
          {previewUrl && <img src={previewUrl} alt="Banner kırpma önizlemesi" draggable="false" className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${scale})`, transformOrigin: `${x}% ${y}%` }} />}
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/30 to-transparent pb-3"><span className="rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[10px] text-white/80 backdrop-blur">Sürükle ve kadrajı ayarla</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => inputRef.current?.click()} disabled={progress !== null} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"><ImagePlus className="h-4 w-4" /> GIF veya görsel seç</button><button type="button" onClick={() => { setX(50); setY(50); setScale(1); }} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-white"><RotateCcw className="h-3.5 w-3.5" /> Kadrajı sıfırla</button><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void selectFile(file); event.target.value = ''; }} /></div>
        {progress !== null && <div><div className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Banner yükleniyor</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width]" style={{ width: `${progress}%` }} /></div></div>}
        <label className="block text-xs text-slate-400">Yakınlaştır <span className="float-right text-violet-200">{scale.toFixed(2)}×</span><input type="range" min="1" max="2" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} className="mt-2 w-full accent-violet-400" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-400">Yatay kadraj<input type="range" min="0" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} className="mt-2 w-full accent-violet-400" /></label><label className="text-xs text-slate-400">Dikey kadraj<input type="range" min="0" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} className="mt-2 w-full accent-violet-400" /></label></div>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-white/[0.07] pt-4"><button type="button" onClick={() => void close()} className="rounded-xl px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]">Vazgeç</button><button type="button" disabled={progress !== null} onClick={() => { onApply({ url: previewUrl, positionX: x, positionY: y, zoom: scale }); setUploadPath(''); onClose(); }} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Uygula</button></footer>
      </div>
    </section>
  </div>, document.body);
}
