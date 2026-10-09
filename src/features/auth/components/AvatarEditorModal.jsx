import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, RotateCcw, Save, X } from 'lucide-react';
import { uploadCroppedAvatarImage, uploadProfileImage } from '../../../lib/profileMedia';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function AvatarEditorModal({ userId, value, onClose, onApply }) {
  const [previewUrl, setPreviewUrl] = useState(value || '');
  const [file, setFile] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const objectUrlRef = useRef('');
  const cropDisabled = file?.type === 'image/gif';
  useEscapeClose(onClose, progress === null);

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const chooseFile = (nextFile) => {
    setError('');
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(nextFile);
    setPreviewUrl(objectUrlRef.current);
    setFile(nextFile);
    setZoom(1); setX(50); setY(50);
  };

  const save = async () => {
    if (!file || progress !== null) return;
    setProgress(0); setError('');
    try {
      const uploaded = cropDisabled
        ? await uploadProfileImage(file, userId, 'avatar', setProgress)
        : await uploadCroppedAvatarImage(file, userId, { x, y, zoom }, setProgress);
      onApply(uploaded.url);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Profil fotoğrafı yüklenemedi.');
      setProgress(null);
    }
  };

  return createPortal(<div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-6" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="avatar-editor-title" className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-[#111722]/95 shadow-[0_28px_100px_rgba(0,0,0,.65)]" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300/10 text-cyan-100"><ImagePlus className="h-4 w-4" /></div><div className="min-w-0 flex-1"><h2 id="avatar-editor-title" className="font-semibold text-white">Profil fotoğrafını düzenle</h2><p className="mt-0.5 text-xs text-slate-500">Kare kadrajı ayarla ve önizle</p></div><button type="button" onClick={onClose} aria-label="Düzenleyiciyi kapat" className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></header>
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex justify-center"><div className="relative h-52 w-52 overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,.35),transparent_60%),linear-gradient(120deg,#151b28,#10141e)] shadow-inner"><img src={previewUrl} alt="Profil fotoğrafı önizlemesi" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }} /><div className="pointer-events-none absolute inset-0 rounded-[34px] ring-1 ring-inset ring-white/15" /></div></div>
        <div className="flex flex-wrap items-center justify-center gap-2"><button type="button" onClick={() => inputRef.current?.click()} disabled={progress !== null} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"><ImagePlus className="h-4 w-4" /> Fotoğraf seç</button><button type="button" onClick={() => { setZoom(1); setX(50); setY(50); }} disabled={cropDisabled} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Sıfırla</button><input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const nextFile = event.target.files?.[0]; if (nextFile) chooseFile(nextFile); event.target.value = ''; }} /></div>
        {cropDisabled ? <p className="rounded-xl border border-cyan-200/10 bg-cyan-200/[0.04] p-3 text-xs leading-5 text-cyan-100/80">GIF animasyonu korunacak. Animasyonu korumak için bu dosya kırpma ve yakınlaştırma ayarları olmadan yüklenir.</p> : <><label className="block text-xs text-slate-400">Yakınlaştır <span className="float-right text-violet-200">{zoom.toFixed(2)}×</span><input type="range" min="1" max="2" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="mt-2 w-full accent-violet-400" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-slate-400">Yatay kadraj<input type="range" min="0" max="100" value={x} onChange={(event) => setX(Number(event.target.value))} className="mt-2 w-full accent-violet-400" /></label><label className="text-xs text-slate-400">Dikey kadraj<input type="range" min="0" max="100" value={y} onChange={(event) => setY(Number(event.target.value))} className="mt-2 w-full accent-violet-400" /></label></div></>}
        {progress !== null && <div><div className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Fotoğraf yükleniyor</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width]" style={{ width: `${progress}%` }} /></div></div>}
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <footer className="flex justify-end gap-2 border-t border-white/[0.07] pt-4"><button type="button" disabled={progress !== null} onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]">Vazgeç</button><button type="button" disabled={!file || progress !== null} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Fotoğrafı uygula</button></footer>
      </div>
    </section>
  </div>, document.body);
}
