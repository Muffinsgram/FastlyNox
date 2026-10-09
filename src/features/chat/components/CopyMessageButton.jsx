import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyMessageButton({ content }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyMessage = async () => {
    setError(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content || '');
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = content || '';
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        const copiedText = document.execCommand('copy');
        textarea.remove();
        if (!copiedText) throw new Error('Clipboard unavailable');
      }
      setCopied(true);
    } catch {
      setError(true);
      window.setTimeout(() => setError(false), 1800);
    }
  };

  return (
    <button type="button" onClick={() => void copyMessage()} aria-label={error ? 'Mesaj kopyalanamadı' : copied ? 'Mesaj kopyalandı' : 'Mesajı kopyala'} title={error ? 'Kopyalama başarısız' : copied ? 'Kopyalandı' : 'Mesajı kopyala'} className={`rounded-lg p-1.5 transition-colors hover:bg-white/10 ${error ? 'text-rose-300' : copied ? 'text-emerald-300' : 'text-slate-400 hover:text-white'}`}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
