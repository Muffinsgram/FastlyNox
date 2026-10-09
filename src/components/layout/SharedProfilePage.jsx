import { useEffect, useState } from 'react';
import { ArrowLeft, LoaderCircle, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { UserProfileModal } from './UserProfileModal';

export function SharedProfilePage({ publicId }) {
  const session = useAuthStore((state) => state.session);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    void supabase.from('profiles').select('id,public_id,username,avatar_url,banner_url,bio,status_text,status_expires_at,banner_position_x,banner_position_y,banner_zoom').eq('public_id', publicId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setStatus('error'); return; }
        if (!data) { setStatus('missing'); return; }
        setProfile(data);
        setStatus('ready');
      });
    return () => { active = false; };
  }, [publicId]);

  useEffect(() => {
    if (!profile?.username) return undefined;
    const previousTitle = document.title;
    document.title = `${profile.username} · Fastlynox`;
    return () => { document.title = previousTitle; };
  }, [profile?.username]);

  const goHome = () => window.location.assign('/');

  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#080c12] p-5 text-white">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(123,97,255,.17),transparent_40%),radial-gradient(ellipse_at_80%_90%,rgba(34,211,238,.08),transparent_38%)]" />
    <section className="relative z-10 w-full max-w-lg text-center">
      <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold text-slate-300"><Zap className="h-4 w-4 text-violet-300" /> Fastlynox</div>
      {status === 'loading' && <div className="flex items-center justify-center gap-2 text-sm text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" /> Profil yükleniyor…</div>}
      {status === 'missing' && <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl"><p className="text-lg font-bold">Profil bulunamadı</p><p className="mt-2 text-sm text-slate-400">Bağlantı geçersiz veya profil artık kullanılamıyor.</p><button type="button" onClick={goHome} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400"><ArrowLeft className="h-4 w-4" /> Fastlynox’a dön</button></div>}
      {status === 'error' && <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl"><p className="text-lg font-bold">Profil açılamadı</p><p className="mt-2 text-sm text-slate-400">{session ? 'Sayısal kimlik migration’ının Supabase’te çalıştırıldığını kontrol et.' : 'Bu profili görüntülemek için Fastlynox’a giriş yap.'}</p><button type="button" onClick={goHome} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400"><ArrowLeft className="h-4 w-4" /> Fastlynox’a dön</button></div>}
      {profile && <UserProfileModal profile={profile} role={null} onClose={goHome} />}
    </section>
  </main>;
}
