import { useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, Music2, Unplug } from 'lucide-react';
import { beginSpotifyAuthorization, disconnectSpotify, hasSpotifyConnection } from '../../../lib/spotifyActivity';

export function SpotifyActivityPanel({ userId }) {
  const spotifyApiEnabled = import.meta.env.VITE_SPOTIFY_API_ENABLED === 'true';
  const [connected, setConnected] = useState(() => hasSpotifyConnection(userId));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const refresh = () => {
      const isConnected = hasSpotifyConnection(userId);
      setConnected(isConnected);
      if (isConnected) setNotice('Spotify bağlandı. Dinleme durumun profilinde paylaşılacak.');
      setBusy(false);
    };
    const onError = (event) => { setNotice(event.detail?.message || 'Spotify bağlantısı tamamlanamadı.'); setBusy(false); };
    window.addEventListener('fastlynox:spotify-updated', refresh);
    window.addEventListener('fastlynox:spotify-error', onError);
    return () => {
      window.removeEventListener('fastlynox:spotify-updated', refresh);
      window.removeEventListener('fastlynox:spotify-error', onError);
    };
  }, [userId]);

  const connect = async () => {
    setBusy(true);
    setNotice('Spotify yetkilendirme sayfası açılıyor…');
    try { await beginSpotifyAuthorization(userId); setNotice('Spotify’da giriş yapıp erişim izni ver.'); setBusy(false); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Spotify bağlantısı başlatılamadı.'); setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    await disconnectSpotify(userId);
    setConnected(false);
    setNotice('Spotify bağlantısı kaldırıldı.');
    setBusy(false);
  };

  return <section className="max-w-2xl space-y-4">
    <div className="rounded-2xl border border-emerald-200/10 bg-[radial-gradient(ellipse_at_top_right,rgba(52,211,153,.09),transparent_55%),rgba(255,255,255,.025)] p-5">
      <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-200/10 bg-emerald-300/[0.08] text-emerald-200"><Music2 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white">Spotify etkinliği</h2><p className="mt-1 text-xs leading-5 text-slate-400">Dinlediğin parçayı ve sanatçıyı Fastlynox profilinde arkadaşlarınla ve ortak sunucu üyelerinle paylaş. Spotify erişimi hesabında kalır ve istediğinde kaldırabilirsin.</p></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-2">{connected ? <><span className="mr-auto inline-flex items-center gap-2 text-xs font-semibold text-emerald-200"><span className="h-2 w-2 rounded-full bg-emerald-300" />Spotify bağlı</span><button type="button" disabled={busy} onClick={() => void disconnect()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.06] disabled:opacity-50"><Unplug className="h-3.5 w-3.5" />Bağlantıyı kes</button></> : <button type="button" disabled={busy || !userId || !spotifyApiEnabled} onClick={() => void connect()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-2.5 text-xs font-bold text-[#06120d] transition hover:bg-emerald-400 disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}{spotifyApiEnabled ? 'Spotify’ı bağla' : 'Canlı Spotify etkinliği kapalı'}</button>}</div>
      {!spotifyApiEnabled && !connected && <p role="status" className="mt-3 text-[11px] leading-5 text-amber-200/90">Spotify API erişimi geliştirici hesabının Premium ve uygulama erişim koşullarına bağlı. Erişim açılmadan canlı parça bilgisi alınamaz; Spotify profil linkini yukarıdan yine ekleyebilirsin.</p>}
      {notice && <p role="status" className="mt-3 text-[11px] text-slate-300">{notice}</p>}
    </div>
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4"><h3 className="text-xs font-semibold text-slate-200">Birlikte dinleme nasıl çalışır?</h3><p className="mt-1.5 text-[11px] leading-5 text-slate-500">Profildeki dinleme daveti parçanın Spotify bağlantısını DM’den gönderir. Herkes parçayı kendi Spotify uygulamasında açar; Fastlynox sesini yayınlamaz veya hesaplar arasında oynatmayı eşzamanlamaz.</p><p className="mt-2 text-[10px] text-slate-600">Spotify hesabı bağlantısı PKCE ile korunur. Client Secret uygulamada tutulmaz.</p></div>
  </section>;
}
