import { Check, Palette } from 'lucide-react';
import { useState } from 'react';
import { COLOR_THEMES, SURFACE_STYLES, getColorTheme, getSurfaceStyle } from '../../../lib/colorThemes';

export function ThemePicker({ value, onChange, surfaceStyle = 'auto', onStyleChange }) {
  const [filter, setFilter] = useState('all');
  const selected = getColorTheme(value).id;
  const visibleThemes = COLOR_THEMES.filter((theme) => filter === 'all' || getSurfaceStyle(theme.id).id === filter);
  return <section className="theme-card rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/[0.08] text-violet-200"><Palette className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-white">Temalar · {COLOR_THEMES.length} görünüm</h2><p className="mt-1 text-xs text-slate-400">Renkler ve kart stilleri birlikte değişir. Seçili: {getColorTheme(value).name}.</p></div></div>
    <div aria-label="Tema kategorileri" className="mt-4 flex flex-wrap gap-1.5">{[{ id: 'all', name: 'Tümü' }, ...SURFACE_STYLES].map((group) => <button key={group.id} type="button" aria-pressed={filter === group.id} onClick={() => setFilter(group.id)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold ${filter === group.id ? 'border-violet-300/30 bg-violet-300/10 text-violet-100' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>{group.name}</button>)}</div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {visibleThemes.map((theme) => <button key={theme.id} type="button" aria-pressed={selected === theme.id} onClick={() => onChange(theme.id)} className={`overflow-hidden border text-left transition-colors focus-visible:outline-offset-4 ${selected === theme.id ? 'border-violet-300/70' : 'border-white/10 hover:border-white/30'}`} style={{ borderRadius: Math.min(18, getSurfaceStyle(theme.id).radius) }}>
        <div aria-hidden="true" className="flex h-20 gap-2 p-2" style={{ backgroundColor: theme.bg }}>
          <div className="flex w-8 shrink-0 flex-col gap-1.5 rounded-md p-1.5" style={{ backgroundColor: theme.sidebar }}><span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.accent }} /><span className="h-1 rounded-full" style={{ backgroundColor: theme.surface }} /><span className="h-1 rounded-full" style={{ backgroundColor: theme.surface }} /></div>
          <div className="min-w-0 flex-1 p-2" style={{ backgroundColor: theme.panel, borderRadius: getSurfaceStyle(theme.id).radius / 2, boxShadow: getSurfaceStyle(theme.id).id === 'outline' ? `inset 0 0 0 1px ${theme.accent}55` : undefined }}><div className="mb-2 h-1.5 w-2/3 rounded-full" style={{ backgroundColor: theme.accent }} /><div className="mb-1 h-1 w-full rounded-full" style={{ backgroundColor: theme.surface }} /><div className="mb-2 h-1 w-4/5 rounded-full" style={{ backgroundColor: theme.surface }} /><div className="flex gap-1">{[theme.accent, theme.secondary, theme.surface].map((color) => <span key={color} className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />)}</div></div>
        </div>
        <div className="px-3 py-2.5"><span className="flex items-center justify-between gap-1 text-xs font-semibold text-white">{theme.name}{selected === theme.id && <Check className="h-3.5 w-3.5 text-violet-200" />}</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">{theme.description}</span></div>
      </button>)}
    </div>
    <div className="mt-5 border-t border-white/10 pt-4"><h3 className="text-xs font-semibold text-white">Kutu stili</h3><p className="mt-1 text-[11px] text-slate-400">Temanın stilini kullan veya renklerle farklı bir kutu görünümü birleştir.</p><div className="mt-3 flex flex-wrap gap-2">{[{ id: 'auto', name: 'Temaya uyumlu' }, ...SURFACE_STYLES].map((style) => <button key={style.id} type="button" aria-pressed={surfaceStyle === style.id} onClick={() => onStyleChange?.(style.id)} className={`border px-3 py-2 text-xs ${surfaceStyle === style.id ? 'border-violet-300/40 bg-violet-300/10 text-violet-100' : 'border-white/10 text-slate-400 hover:bg-white/5'}`} style={{ borderRadius: Math.min(style.radius || 12, 18) }}>{style.name}</button>)}</div></div>
  </section>;
}
