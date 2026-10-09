import { Bold, Code2, Italic, Quote, Strikethrough, Underline } from 'lucide-react';

const TOOLS = [
  { id: 'bold', label: 'Kalın', token: '**', icon: Bold },
  { id: 'italic', label: 'İtalik', token: '*', icon: Italic },
  { id: 'underline', label: 'Altı çizili', token: '__', icon: Underline },
  { id: 'strike', label: 'Üstü çizili', token: '~~', icon: Strikethrough },
  { id: 'code', label: 'Kod', token: '`', icon: Code2 },
  { id: 'quote', label: 'Alıntı', token: 'quote', icon: Quote },
];

export function MessageFormatToolbar({ inputRef, value, onChange }) {
  const apply = (tool) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const selection = value.slice(start, end) || 'metin';
    let before;
    let after;
    let nextSelectionStart;
    let nextSelectionEnd;
    if (tool.token === 'quote') {
      const quoted = selection.split('\n').map((line) => `> ${line}`).join('\n');
      before = value.slice(0, start);
      after = value.slice(end);
      onChange(`${before}${quoted}${after}`);
      nextSelectionStart = start;
      nextSelectionEnd = start + quoted.length;
    } else {
      before = value.slice(0, start);
      after = value.slice(end);
      const formatted = `${tool.token}${selection}${tool.token}`;
      onChange(`${before}${formatted}${after}`);
      nextSelectionStart = start + tool.token.length;
      nextSelectionEnd = nextSelectionStart + selection.length;
    }
    window.requestAnimationFrame(() => { input.focus(); input.setSelectionRange(nextSelectionStart, nextSelectionEnd); });
  };

  return <div role="toolbar" aria-label="Mesaj biçimlendirme" className="mb-1 flex items-center gap-1 px-1">
    {TOOLS.map(({ id, label, icon: Icon, ...tool }) => <button key={id} type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(tool)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-100"><Icon className="h-3.5 w-3.5" /></button>)}
  </div>;
}
