import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

const sameValue = (left, right) => String(left ?? '') === String(right ?? '');

export function AnimatedSelect({ value, options, onValueChange, className = '', menuClassName = '', disabled = false, ariaLabel = 'Seçenek seç', placeholder = 'Seçim yap', align = 'left', popupOwner }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => sameValue(option.value, value)));
  const selected = options.find((option) => sameValue(option.value, value));

  const openMenu = () => {
    if (disabled) return;
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const menuHeight = Math.min(options.length * 40 + 12, 280);
    const placeAbove = window.innerHeight - bounds.bottom < menuHeight + 12 && bounds.top > menuHeight + 12;
    const width = Math.max(bounds.width, 164);
    const left = align === 'right' ? bounds.right - width : bounds.left;
    setPosition({ left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), width, top: placeAbove ? Math.max(8, bounds.top - menuHeight - 8) : bounds.bottom + 8, origin: placeAbove ? 'bottom' : 'top' });
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const choose = (option) => {
    onValueChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { openMenu(); return; }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + direction + options.length) % options.length);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) { openMenu(); return; }
      if (options[activeIndex]) choose(options[activeIndex]);
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActiveIndex(Math.max(0, options.length - 1));
    }
  };

  return <div ref={rootRef} className="relative min-w-0">
    <button ref={triggerRef} type="button" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open ? `${listId}-option-${activeIndex}` : undefined} disabled={disabled} onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={handleKeyDown} className={`group flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111722]/90 px-3 py-2 text-left text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] outline-none transition duration-200 hover:border-violet-200/25 hover:bg-[#171f2c] focus-visible:border-violet-200/45 focus-visible:ring-4 focus-visible:ring-violet-400/10 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
      <span className={`min-w-0 truncate ${selected ? 'text-slate-100' : 'text-slate-500'}`}>{selected?.label ?? placeholder}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition duration-200 group-hover:text-violet-200 ${open ? 'rotate-180 text-violet-200' : ''}`} />
    </button>
    {open && position && createPortal(<div ref={menuRef} data-popup-owner={popupOwner} id={listId} role="listbox" aria-label={ariaLabel} className={`dropdown-surface fixed z-[900] max-h-[min(18rem,calc(100vh-1rem))] overflow-y-auto rounded-2xl border border-white/[0.12] bg-[#111722]/95 p-1.5 shadow-[0_24px_80px_rgba(0,0,0,.7)] backdrop-blur-2xl ${menuClassName}`} style={{ left: position.left, top: position.top, width: position.width, transformOrigin: `${position.origin} ${align}` }}>
      <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-violet-200/25 to-transparent" />
      {options.map((option, index) => {
        const isSelected = sameValue(option.value, value);
        const isActive = index === activeIndex;
        return <button key={String(option.value)} id={`${listId}-option-${index}`} type="button" role="option" aria-selected={isSelected} onPointerEnter={() => setActiveIndex(index)} onClick={() => choose(option)} className={`flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs transition duration-150 ${isSelected ? 'bg-violet-300/[0.12] font-semibold text-violet-100 shadow-[inset_0_0_0_1px_rgba(190,202,255,.09)]' : isActive ? 'bg-white/[0.07] text-white' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'}`}>
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-violet-200" />}
        </button>;
      })}
    </div>, document.body)}
  </div>;
}
