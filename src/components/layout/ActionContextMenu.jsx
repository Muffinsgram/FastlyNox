import { useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';

export function ActionContextMenu({ position, items, onClose, label = 'İşlem menüsü' }) {
  const [openSubmenuId, setOpenSubmenuId] = useState(null);
  useEffect(() => {
    if (!position) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (openSubmenuId) setOpenSubmenuId(null);
      else onClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [position, openSubmenuId, onClose]);
  if (!position || !items?.length) return null;
  const left = Math.max(8, Math.min(position.x, window.innerWidth - 232));
  const top = Math.max(8, Math.min(position.y, window.innerHeight - Math.min(items.length * 38 + 20, 380)));
  const submenuOpensLeft = left > window.innerWidth - 480;

  return createPortal(
    <div className="fixed inset-0 z-[700]" onPointerDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }}>
      <div role="menu" aria-label={label} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape' && openSubmenuId) { event.stopPropagation(); setOpenSubmenuId(null); } }} className="dropdown-surface fixed w-56 overflow-visible rounded-2xl border border-white/10 bg-[#151b27]/95 p-1.5 shadow-[0_20px_70px_rgba(0,0,0,.55)] backdrop-blur-2xl" style={{ left, top, transformOrigin: 'top left' }}>
        {items.map((item, index) => item.separator
          ? <div key={`separator-${index}`} className="my-1 border-t border-white/[0.08]" />
          : item.children?.length
            ? <div key={item.id || item.label} className="group relative" onMouseEnter={() => setOpenSubmenuId(item.id || item.label)} onMouseLeave={() => setOpenSubmenuId(null)}>
              <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={openSubmenuId === (item.id || item.label)} onFocus={() => setOpenSubmenuId(item.id || item.label)} onClick={() => setOpenSubmenuId(current => current === (item.id || item.label) ? null : (item.id || item.label))} onKeyDown={(event) => { if (event.key === 'ArrowRight') { event.preventDefault(); setOpenSubmenuId(item.id || item.label); } }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none">
                {item.icon && <item.icon className="h-4 w-4 text-slate-400 transition-colors group-hover:text-violet-200" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-violet-200" />
              </button>
              {openSubmenuId === (item.id || item.label) && <div role="menu" aria-label={item.label} className={`fast-context-submenu dropdown-surface absolute top-[-5px] z-[710] w-60 rounded-2xl border p-1.5 ${submenuOpensLeft ? 'right-[calc(100%-2px)]' : 'left-[calc(100%-2px)]'}`}>
                <div className="mb-1 flex items-center gap-2 border-b border-white/[0.07] px-3 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[.16em] text-violet-100/65">{item.icon && <item.icon className="h-3.5 w-3.5" />}{item.label}</div>
                {item.children.map(child => <button key={child.id || child.label} type="button" role="menuitemradio" aria-checked={Boolean(child.checked)} onClick={() => { onClose(); child.onSelect?.(); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${child.checked ? 'bg-violet-300/[0.12] text-violet-100' : child.danger ? 'text-rose-200 hover:bg-rose-400/10' : 'text-slate-200 hover:bg-white/[0.07]'}`}>
                  {child.icon && <child.icon className={`h-4 w-4 ${child.checked ? 'text-violet-200' : child.danger ? 'text-rose-300' : 'text-slate-400'}`} />}
                  <span className="min-w-0 flex-1 truncate">{child.label}</span>
                  {child.checked ? <Check className="h-3.5 w-3.5 shrink-0 text-violet-200" /> : child.hint && <span className="text-[9px] text-slate-500">{child.hint}</span>}
                </button>)}
              </div>}
            </div>
            : <button key={item.id || item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => { onClose(); item.onSelect?.(); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? 'text-rose-200 hover:bg-rose-400/10' : 'text-slate-200 hover:bg-white/[0.08]'}`}>
              {item.icon && <item.icon className={`h-4 w-4 ${item.danger ? 'text-rose-300' : 'text-slate-400'}`} />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && <span className="text-[9px] text-slate-500">{item.hint}</span>}
            </button>)}
      </div>
    </div>,
    document.body,
  );
}
