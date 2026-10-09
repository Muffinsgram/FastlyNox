import { useEffect, useState } from 'react';
import { AlertCircle, Check, Download, LoaderCircle, RotateCw } from 'lucide-react';

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

  return (
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
  );
}
