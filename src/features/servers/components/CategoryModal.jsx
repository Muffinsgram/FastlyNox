import { useState } from 'react';
import { FolderPlus, Loader2, Pencil, X } from 'lucide-react';
import { useServerStore } from '../../../store/useServerStore';
import { useEscapeClose } from '../../../hooks/useEscapeClose';

export function CategoryModal({ serverId, category = null, onClose }) {
  const [name, setName] = useState(category?.name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = useServerStore((state) => category ? state.updateCategory : state.createCategory);
  useEscapeClose(onClose, !busy);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const result = category
      ? await save(serverId, category.id, name)
      : await save(serverId, name);
    setBusy(false);
    if (result?.success) onClose();
    else setError(result?.error || 'Kategori kaydedilemedi.');
  };

  return <div role="presentation" className="fixed inset-0 z-[500] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="category-modal-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-[#111722] shadow-2xl">
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-100">{category ? <Pencil className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><h2 id="category-modal-title" className="text-sm font-bold text-white">{category ? 'Kategoriyi düzenle' : 'Kategori oluştur'}</h2><p className="mt-0.5 text-[10px] text-slate-500">Kanallarını düzenli gruplar halinde tut.</p></div><button type="button" onClick={onClose} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></header>
      <form onSubmit={submit} className="space-y-4 p-5"><label className="block text-xs font-semibold text-slate-300">Kategori adı<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="Örn. TOPLULUK" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/30" /></label>{error && <p role="alert" className="rounded-xl border border-rose-300/10 bg-rose-300/[0.05] px-3 py-2 text-xs text-rose-200">{error}</p>}<footer className="flex justify-end gap-2 border-t border-white/[0.06] pt-4"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white">Vazgeç</button><button type="submit" disabled={!name.trim() || busy} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-45">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : category ? <Pencil className="h-3.5 w-3.5" /> : <FolderPlus className="h-3.5 w-3.5" />}{category ? 'Değişiklikleri kaydet' : 'Kategori oluştur'}</button></footer></form>
    </section>
  </div>;
}
