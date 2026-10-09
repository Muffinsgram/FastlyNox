import { useEffect, useState } from 'react';
import { Download, Expand, X, ZoomIn } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

function isGiphyUrl(path) {
  try {
    const url = new URL(path);
    return url.protocol === 'https:' && (url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com'));
  } catch {
    return false;
  }
}

function normalizeAttachmentPath(value) {
  try {
    const url = new URL(value);
    const configuredOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
    if (url.origin !== configuredOrigin) return null;
    const prefixes = [
      '/storage/v1/object/public/attachments/',
      '/storage/v1/object/sign/attachments/',
    ];
    const prefix = prefixes.find((candidate) => url.pathname.startsWith(candidate));
    if (!prefix) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return value;
  }
}

export function AttachmentImage({ imagePath }) {
  const [signedImage, setSignedImage] = useState({ path: '', url: '', error: false });
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const isRemoteGif = isGiphyUrl(imagePath);
  const privatePath = normalizeAttachmentPath(imagePath);
  const isRemoteImage = !privatePath && /^https:\/\//i.test(imagePath);
  const imageUrl = isRemoteImage ? imagePath : signedImage.url;

  useEffect(() => {
    if (!privatePath) return undefined;
    let active = true;
    let refreshTimer;
    const refreshUrl = async () => {
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(privatePath, SIGNED_URL_LIFETIME_SECONDS);
      if (!active) return;
      if (error || !data?.signedUrl) {
        setSignedImage({ path: privatePath, url: '', error: true });
        return;
      }
      setSignedImage({ path: privatePath, url: data.signedUrl, error: false });
      refreshTimer = setTimeout(refreshUrl, (SIGNED_URL_LIFETIME_SECONDS - 60) * 1000);
    };

    void refreshUrl();
    return () => {
      active = false;
      clearTimeout(refreshTimer);
    };
  }, [imagePath, privatePath]);

  useEffect(() => {
    if (!isViewerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsViewerOpen(false);
      if (event.key === 'z' || event.key === 'Z') setIsZoomed((zoomed) => !zoomed);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isViewerOpen]);

  const downloadImage = async () => {
    if (isRemoteImage) {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      setDownloadError('');
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('download failed');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = imagePath.split('/').pop() || 'fastcord-image';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError('İndirme başlatılamadı. Görseli yeni sekmede açmayı dene.');
    }
  };

  if (privatePath && signedImage.path !== privatePath) return <div role="status" className="mt-2 h-48 w-full max-w-sm animate-pulse rounded-xl bg-white/5" aria-label="Ek yükleniyor" />;
  if (privatePath && signedImage.error) return <div role="status" className="mt-2 h-12 w-full max-w-sm rounded-xl bg-white/5 px-3 py-4 text-xs text-slate-500">Ek açılamadı veya süresi doldu.</div>;

  return (
    <>
      <button type="button" onClick={() => { setIsZoomed(false); setIsViewerOpen(true); }} aria-label="Görseli büyüt" title="Görseli büyüt" className="group relative mt-2 flex max-h-80 w-fit max-w-full items-center justify-center overflow-hidden rounded-xl bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
        <img src={imageUrl} className="max-h-80 max-w-full rounded-xl object-contain" alt={isRemoteGif ? 'GIF mesaj eki' : 'Mesaj görsel eki'} loading="lazy" decoding="async" />
        <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/25 group-hover:opacity-100"><Expand className="h-5 w-5 drop-shadow" /></span>
      </button>
      {isViewerOpen && (
        <div role="dialog" aria-modal="true" aria-label="Görsel görüntüleyici" onClick={() => setIsViewerOpen(false)} className="fixed inset-0 z-[250] flex items-center justify-center overflow-auto bg-black/85 p-4 backdrop-blur-xl animate-in fade-in duration-150">
          <div className="fixed right-4 top-4 z-10 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111722]/80 p-1.5 shadow-2xl backdrop-blur-2xl sm:right-6 sm:top-6">
            <button type="button" onClick={(event) => { event.stopPropagation(); setIsZoomed((zoomed) => !zoomed); }} aria-label={isZoomed ? 'Yakınlaştırmayı kapat' : 'Görseli yakınlaştır'} title="Yakınlaştır (Z)" className="grid h-9 w-9 place-items-center rounded-xl text-slate-200 transition hover:bg-white/10"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); void downloadImage(); }} aria-label={isRemoteGif ? 'GIF kaynağını yeni sekmede aç' : 'Görseli indir'} title={isRemoteGif ? 'GIPHY kaynağını aç' : 'İndir'} className="grid h-9 w-9 place-items-center rounded-xl text-slate-200 transition hover:bg-white/10"><Download className="h-4 w-4" /></button>
            <button type="button" onClick={() => setIsViewerOpen(false)} aria-label="Görüntüleyiciyi kapat" title="Kapat (Esc)" className="grid h-9 w-9 place-items-center rounded-xl text-slate-200 transition hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
          {downloadError && <p role="alert" className="fixed bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-rose-300/20 bg-[#21151a]/90 px-4 py-2 text-xs text-rose-200">{downloadError}</p>}
          <img
            src={imageUrl}
            alt={isRemoteGif ? 'GIF büyütülmüş görünüm' : 'Görsel büyütülmüş görünüm'}
            onClick={(event) => { event.stopPropagation(); setIsZoomed((zoomed) => !zoomed); }}
            className={`my-auto cursor-zoom-in rounded-xl shadow-2xl transition-all duration-200 ${isZoomed ? 'max-h-none max-w-none cursor-zoom-out' : 'max-h-[84vh] max-w-[92vw] object-contain'}`}
          />
        </div>
      )}
    </>
  );
}
