import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Download, LoaderCircle, RotateCw } from 'lucide-react';

function formatBytes(bytes = 0) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DesktopUpdateControl() {
  const [update, setUpdate] = useState({ state: 'idle' });
  const desktop = window.fastlynoxDesktop;

  useEffect(() => {
    if (!desktop?.onUpdateStatus) return undefined;
    const unsubscribe = desktop.onUpdateStatus(setUpdate);
    void desktop.getVersion?.().then((version) => {
      setUpdate((current) => ({ ...current, appVersion: version }));
    }).catch(() => {});
    return unsubscribe;
  }, [desktop]);

  if (!desktop || ['idle', 'current', 'development'].includes(update.state)) return null;
  const isBusy = ['checking', 'available', 'downloading'].includes(update.state);
  const retry = update.state === 'error';
  const downloaded = update.state === 'downloaded';
  const showDownloadScreen = ['available', 'downloading'].includes(update.state);
  const label = downloaded
    ? `v${update.version || ''} güncellemesi hazır · yeniden başlat`
    : retry
      ? 'Güncelleme kontrolünü yeniden dene'
      : update.state === 'checking'
        ? 'Güncelleme kontrol ediliyor…'
        : update.state === 'downloading'
          ? `Güncelleme indiriliyor · %${update.percent || 0}`
          : 'Güncelleme indirilmeye hazırlanıyor…';
  const Icon = downloaded ? Download : retry ? AlertCircle : isBusy ? LoaderCircle : Check;

  const handleClick = async () => {
    if (downloaded) await desktop.installUpdate();
    else if (retry) await desktop.checkForUpdates();
  };

  return <>
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={!downloaded && !retry}
      title={retry ? `${label} ${update.message || ''}` : label}
      aria-label={label}
      className={`mr-2 inline-flex h-7 max-w-[min(330px,40vw)] items-center gap-2 rounded-lg border px-2.5 text-[10px] font-semibold transition disabled:cursor-default ${
        downloaded
          ? 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15'
          : retry
            ? 'border-amber-200/20 bg-amber-300/[0.08] text-amber-100 hover:bg-amber-300/[0.13]'
            : 'border-white/[0.07] bg-white/[0.035] text-slate-400'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${isBusy ? 'animate-spin' : ''}`} />
      <span className="truncate">{label}</span>
      {downloaded && <RotateCw className="h-3 w-3 shrink-0" />}
      {update.state === 'downloading' && (
        <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full bg-cyan-200 transition-[width]" style={{ width: `${update.percent || 0}%` }} />
        </span>
      )}
    </button>
    {showDownloadScreen && createPortal(
      <div className="fixed inset-0 z-[1000] grid place-items-center bg-[#080b12]/90 p-5 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="update-screen-title" aria-live="polite">
        <section className="w-full max-w-[390px] rounded-[24px] border border-white/[0.08] bg-[radial-gradient(ellipse_at_50%_0%,rgba(127,92,255,.16),transparent_62%),#0d111a] px-7 py-8 text-center shadow-[0_30px_100px_rgba(0,0,0,.65)]">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-violet-200/10 bg-violet-300/[0.09] text-violet-100 shadow-[0_0_30px_rgba(126,20,255,.12)]"><Download className="h-5 w-5" /></div>
          <h2 id="update-screen-title" className="mt-4 text-base font-bold tracking-wide text-slate-100">Fastlynox güncelleniyor</h2>
          <p className="mt-1 text-[11px] text-slate-400">{update.version ? `v${update.version} indiriliyor` : 'Yeni sürüm indiriliyor'}</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label="Güncelleme indirme ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={update.state === 'downloading' ? update.percent || 0 : undefined}>
            <div className={`h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width] duration-300 ${update.state === 'available' ? 'w-[32%] animate-pulse' : ''}`} style={update.state === 'downloading' ? { width: `${Math.max(0, Math.min(100, update.percent || 0))}%` } : undefined} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[10px] tabular-nums text-slate-400">
            <span>{update.state === 'downloading' ? `${Math.max(0, Math.min(100, update.percent || 0))}% · ${formatBytes(update.transferred)} / ${formatBytes(update.total)}` : 'İndirme hazırlanıyor…'}</span>
            <span>{update.state === 'downloading' && Number(update.bytesPerSecond) > 0 ? `${formatBytes(update.bytesPerSecond)}/sn` : ''}</span>
          </div>
          <p className="mt-5 text-[10px] text-slate-500">İndirme bitince uygulama güncellemeyi tamamlamak için yeniden başlatılacak.</p>
        </section>
      </div>, document.body,
    )}
  </>;
}
