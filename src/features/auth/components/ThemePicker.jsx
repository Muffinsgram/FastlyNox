import { Check, Palette } from 'lucide-react';
import { COLOR_THEMES, getColorTheme } from '../../../lib/colorThemes';

export function ThemePicker({ value, onChange }) {
  const selected = getColorTheme(value).id;
  return <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/[0.08] text-violet-200"><Palette className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-white">Renk temaları</h2><p className="mt-1 text-xs text-slate-400">Sadece renkler değişir; kutular ve yerleşim aynı kalır. Seçince hemen uygulanır.</p></div></div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {COLOR_THEMES.map((theme) => <button key={theme.id} type="button" aria-pressed={selected === theme.id} onClick={() => onChange(theme.id)} className={`overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-offset-4 ${selected === theme.id ? 'border-violet-300/70' : 'border-white/10 hover:border-white/30'}`}>
        <div aria-hidden="true" className="flex h-20 gap-2 p-2" style={{ backgroundColor: theme.bg }}>
          <div className="flex w-8 shrink-0 flex-col gap-1.5 rounded-md p-1.5" style={{ backgroundColor: theme.sidebar }}><span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.accent }} /><span className="h-1 rounded-full" style={{ backgroundColor: theme.surface }} /><span className="h-1 rounded-full" style={{ backgroundColor: theme.surface }} /></div>
          <div className="min-w-0 flex-1 rounded-md p-2" style={{ backgroundColor: theme.panel }}><div className="mb-2 h-1.5 w-2/3 rounded-full" style={{ backgroundColor: theme.accent }} /><div className="mb-1 h-1 w-full rounded-full" style={{ backgroundColor: theme.surface }} /><div className="mb-2 h-1 w-4/5 rounded-full" style={{ backgroundColor: theme.surface }} /><div className="flex gap-1">{[theme.accent, theme.secondary, theme.surface].map((color) => <span key={color} className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />)}</div></div>
        </div>
        <div className="px-3 py-2.5"><span className="flex items-center justify-between gap-1 text-xs font-semibold text-white">{theme.name}{selected === theme.id && <Check className="h-3.5 w-3.5 text-violet-200" />}</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">{theme.description}</span></div>
      </button>)}
    </div>
  </section>;
}
