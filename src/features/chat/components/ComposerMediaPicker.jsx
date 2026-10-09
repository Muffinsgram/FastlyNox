import { useEffect, useState } from 'react';
import { Film, Loader2, Search, Smile, X } from 'lucide-react';
import { readRecentEmojis, rememberEmoji } from '../../../lib/emojiRecents';

const EMOJIS = ['😀', '😂', '🥹', '😍', '🤔', '😎', '😭', '😮', '😡', '🥳', '👍', '👎', '👏', '🙏', '❤️', '🔥', '✨', '🎉', '💯', '✅', '👀', '🤝', '💀', '🫡', '🙌', '🤌', '😴', '🚀', '💜', '☕'];
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

export function ComposerMediaPicker({ onEmoji, onGif, userId, disabled = false }) {
  const [openPanel, setOpenPanel] = useState(null);
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentEmojis, setRecentEmojis] = useState(() => readRecentEmojis(userId, EMOJIS));

  useEffect(() => {
    if (openPanel !== 'gif') return undefined;
    if (!GIPHY_API_KEY) return undefined;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError('');
      const endpoint = query.trim()
        ? 'https://api.giphy.com/v1/gifs/search'
        : 'https://api.giphy.com/v1/gifs/trending';
      const params = new URLSearchParams({ api_key: GIPHY_API_KEY, limit: '24', rating: 'g', lang: 'tr' });
      if (query.trim()) params.set('q', query.trim().slice(0, 50));
      try {
        const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('GIF sonuçları alınamadı. Biraz sonra yeniden dene.');
        const payload = await response.json();
        setGifs((payload.data || []).map((gif) => ({
          id: gif.id,
          title: gif.title || 'GIF',
          preview: gif.images?.fixed_width_small?.webp || gif.images?.fixed_width_small?.url,
          url: gif.images?.fixed_width?.url || gif.images?.original?.url,
        })).filter((gif) => gif.preview && gif.url));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'GIF sonuçları alınamadı.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [openPanel, query]);

  const togglePanel = (panel) => setOpenPanel((current) => current === panel ? null : panel);
  const chooseEmoji = (emoji) => {
    setRecentEmojis(rememberEmoji(userId, emoji, EMOJIS));
    onEmoji(emoji);
    setOpenPanel(null);
  };

  return (
    <div className="relative flex shrink-0 items-center gap-1" onKeyDown={(event) => { if (event.key === 'Escape') setOpenPanel(null); }}>
      {openPanel && (
        <section aria-label={openPanel === 'emoji' ? 'Emoji seçici' : 'GIF seçici'} className="dropdown-surface absolute bottom-[calc(100%+0.75rem)] right-0 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#111722]/90 p-3 shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-2xl supports-[backdrop-filter]:bg-[#111722]/70" style={{ transformOrigin: 'bottom right' }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
              <button type="button" onClick={() => setOpenPanel('emoji')} aria-label="Emoji paneli" className={`rounded-lg p-1.5 ${openPanel === 'emoji' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}><Smile className="h-4 w-4" /></button>
              <button type="button" onClick={() => setOpenPanel('gif')} aria-label="GIF paneli" className={`rounded-lg px-2 py-1.5 text-[10px] font-black tracking-wide ${openPanel === 'gif' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>GIF</button>
            </div>
            <button type="button" onClick={() => setOpenPanel(null)} aria-label="Medya panelini kapat" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>

          {openPanel === 'emoji' ? (
            <div>
              {recentEmojis.length > 0 && <div className="mb-2 border-b border-white/[0.07] pb-2"><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Son kullanılanlar</p><div className="grid grid-cols-6 gap-1" role="group" aria-label="Son kullanılan emojiler">{recentEmojis.map((emoji) => <button key={emoji} type="button" onClick={() => chooseEmoji(emoji)} aria-label={`${emoji} ekle`} className="grid aspect-square place-items-center rounded-lg text-xl transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">{emoji}</button>)}</div></div>}
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Sık kullanılanlar</p>
              <div className="grid grid-cols-6 gap-1" role="group" aria-label="Emoji seç">
                {EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => chooseEmoji(emoji)} aria-label={`${emoji} ekle`} className="grid aspect-square place-items-center rounded-lg text-xl transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">{emoji}</button>)}
              </div>
            </div>
          ) : (
            <>
              <label className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 focus-within:border-violet-400/50">
                <Search className="h-4 w-4 shrink-0 text-slate-500" />
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="GIPHY'de GIF ara" aria-label="GIF ara" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
              </label>
              {!GIPHY_API_KEY ? <p role="status" className="py-5 text-center text-xs leading-relaxed text-slate-400">{error}<br />GIPHY geliştirici anahtarı eklendiğinde gerçek sonuçlar burada görünür.</p> : (
                <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
                  {gifs.map((gif) => <button key={gif.id} type="button" onClick={() => { onGif(gif.url); setOpenPanel(null); }} aria-label={`${gif.title} GIF gönder`} className="overflow-hidden rounded-lg bg-white/5 ring-violet-400/70 transition hover:ring-2 focus-visible:outline focus-visible:ring-2">
                    <img src={gif.preview} alt={gif.title} loading="lazy" className="h-24 w-full object-cover" />
                  </button>)}
                  {isLoading && <div role="status" className="col-span-3 flex items-center justify-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> GIF aranıyor…</div>}
                  {!isLoading && !error && gifs.length === 0 && <p className="col-span-3 py-6 text-center text-xs text-slate-400">Sonuç bulunamadı.</p>}
                  {error && <p role="alert" className="col-span-3 py-4 text-center text-xs text-rose-300">{error}</p>}
                </div>
              )}
              <a href="https://giphy.com" target="_blank" rel="noreferrer" className="mt-2 block text-right text-[10px] font-semibold text-slate-500 hover:text-slate-300">Powered by GIPHY ↗</a>
            </>
          )}
        </section>
      )}

      <button type="button" disabled={disabled} aria-label="Emoji ekle" aria-expanded={openPanel === 'emoji'} onClick={() => togglePanel('emoji')} className={`grid h-9 w-9 place-items-center rounded-xl transition-colors disabled:opacity-40 ${openPanel === 'emoji' ? 'bg-violet-400/15 text-violet-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}><Smile className="h-[18px] w-[18px]" /></button>
      <button type="button" disabled={disabled} aria-label="GIF ekle" aria-expanded={openPanel === 'gif'} onClick={() => togglePanel('gif')} className={`flex h-9 items-center gap-1 rounded-xl px-2 text-[10px] font-black tracking-wide transition-colors disabled:opacity-40 ${openPanel === 'gif' ? 'bg-violet-400/15 text-violet-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}><Film className="h-4 w-4" />GIF</button>
    </div>
  );
}
