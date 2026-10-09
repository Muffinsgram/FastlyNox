import { useEffect, useState } from 'react';
import { Check, Crown, Upload } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export function FastlynoxPlusPanel({ userId }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void supabase.rpc('get_fastcord_account_plan', { target_user: userId }).then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError) setError('Plan bilgisi yüklenemedi. migration_fastcord_plus_admin.sql dosyasını çalıştır.');
      else setPlan(Array.isArray(data) ? data[0] : data);
    });
    return () => { active = false; };
  }, [userId]);
  const perks = [
    ['Sohbet dosyaları', plan?.attachment_limit_bytes],
    ['Akış görselleri', plan?.social_limit_bytes],
    ['Profil fotoğrafı ve banner', plan?.profile_media_limit_bytes],
  ];
  const planDisplayName = plan?.plan_key === 'plus' ? 'Fastlynox Plus' : plan?.plan_key === 'free' ? 'Fastlynox' : plan?.display_name?.replaceAll('FastCord', 'Fastlynox');
  return <section className="max-w-3xl overflow-hidden rounded-3xl border border-amber-200/15 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,.13),transparent_42%),linear-gradient(140deg,rgba(139,92,246,.08),rgba(10,14,22,.75))] p-6 sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/15 bg-amber-200/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-amber-100"><Crown className="h-3.5 w-3.5" /> Fastlynox Plus</span><h2 className="mt-4 text-2xl font-bold text-white">Daha geniş alan, daha fazla ifade.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Plus planın dosya sınırlarını ve hesabındaki durumunu burada görebilirsin.</p></div><div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right"><p className="text-[10px] uppercase tracking-wider text-slate-500">Hesap planın</p><p className="mt-1 font-bold text-amber-100">{planDisplayName || 'Yükleniyor…'}</p>{plan?.expires_at && <p className="mt-1 text-[10px] text-slate-500">Bitiş {new Date(plan.expires_at).toLocaleDateString('tr-TR')}</p>}</div></div>
    <div className="mt-7 grid gap-3 sm:grid-cols-3">{perks.map(([label, bytes]) => <div key={label} className="rounded-2xl border border-white/[0.08] bg-black/15 p-4"><Upload className="h-4 w-4 text-violet-200" /><p className="mt-3 text-xs text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-white">{bytes ? `${Math.round(Number(bytes) / 1024 / 1024)} MB` : '—'}</p></div>)}</div>
    <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="flex items-center gap-2 text-sm font-semibold text-white"><Check className="h-4 w-4 text-emerald-300" /> Sunucu tarafında doğrulanan dosya sınırları</p><p className="mt-1 text-xs leading-5 text-slate-500">Plus şu anda davet veya Fastlynox personel tanımlamasıyla etkinleştirilir. Uygulamada henüz ödeme veya otomatik yenileme yok.</p></div>
    {error && <p role="alert" className="mt-4 text-xs text-rose-300">{error}</p>}
  </section>;
}
