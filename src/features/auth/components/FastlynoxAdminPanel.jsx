import { useEffect, useState } from 'react';
import { Award, Crown, Search, ShieldAlert, Users } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';

const LIMIT_FIELDS = [
  ['attachment_mb', 'Sohbet dosyası', 10],
  ['social_mb', 'Akış medyası', 10],
  ['profile_media_mb', 'Profil görseli', 8],
];

export function FastlynoxAdminPanel() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [badges, setBadges] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [limits, setLimits] = useState({ free: [10, 10, 8], plus: [100, 100, 25] });
  const [duration, setDuration] = useState('forever');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('profile_badge_definitions').select('badge_key,name,description').order('sort_order'),
      supabase.from('fastcord_plans').select('plan_key,attachment_limit_bytes,social_limit_bytes,profile_media_limit_bytes'),
    ]).then(([badgeResult, planResult]) => {
      if (!active) return;
      setCatalog(badgeResult.data || []);
      if (planResult.data?.length) setLimits(Object.fromEntries(planResult.data.map((row) => [row.plan_key, [row.attachment_limit_bytes, row.social_limit_bytes, row.profile_media_limit_bytes].map((value) => Math.round(Number(value) / 1048576))])));
      if (badgeResult.error || planResult.error) setNotice('Yönetim verileri yüklenemedi. İlgili migration dosyalarının çalıştığını kontrol et.');
    });
    return () => { active = false; };
  }, []);

  const searchUsers = async (event) => {
    event?.preventDefault();
    const value = query.trim();
    if (value.length < 2) { setUsers([]); return; }
    setNotice('');
    const { data, error } = await supabase.from('profiles').select('id,public_id,username,avatar_url').ilike('username', `%${value}%`).limit(20);
    if (error) setNotice(error.message);
    else setUsers(data || []);
  };

  const selectUser = async (profile) => {
    setSelectedUser(profile);
    setNotice('');
    const [planResult, badgeResult] = await Promise.all([
      supabase.rpc('get_fastcord_account_plan', { target_user: profile.id }),
      supabase.from('profile_badges').select('badge_key').eq('user_id', profile.id),
    ]);
    if (planResult.error) setNotice(`Plan bilgisi alınamadı: ${planResult.error.message}`);
    else setPlan(Array.isArray(planResult.data) ? planResult.data[0] : planResult.data);
    if (badgeResult.error) setNotice(`Rozetler yüklenemedi: ${badgeResult.error.message}`);
    else setBadges((badgeResult.data || []).map((badge) => badge.badge_key));
  };

  const updateSubscription = async (targetPlan) => {
    if (!selectedUser) return;
    setBusy(true); setNotice('');
    const expiry = duration === 'forever' ? null : new Date(Date.now() + Number(duration) * 86400000).toISOString();
    const { error } = await supabase.rpc('set_fastcord_subscription', { target_user: selectedUser.id, target_plan: targetPlan, subscription_expiry: expiry });
    setBusy(false);
    if (error) setNotice(error.message);
    else { window.dispatchEvent(new Event('fastcord:upload-limits-changed')); setNotice(targetPlan === 'plus' ? 'Fastlynox Plus hesabına tanımlandı.' : 'Plus kaldırıldı; ücretsiz plan etkin.'); await selectUser(selectedUser); }
  };

  const toggleBadge = async (badgeKey) => {
    if (!selectedUser) return;
    setBusy(true); setNotice('');
    const shouldAward = !badges.includes(badgeKey);
    const { error } = await supabase.rpc('set_profile_badge', { target_user: selectedUser.id, target_badge: badgeKey, should_award: shouldAward });
    setBusy(false);
    if (error) setNotice(error.message);
    else { setBadges((current) => shouldAward ? [...current, badgeKey] : current.filter((key) => key !== badgeKey)); setNotice(shouldAward ? 'Rozet verildi.' : 'Rozet kaldırıldı.'); }
  };

  const saveLimits = async (planKey) => {
    const [attachmentMb, socialMb, profileMediaMb] = limits[planKey];
    setBusy(true); setNotice('');
    const { error } = await supabase.rpc('set_fastcord_plan_limits', { target_plan: planKey, attachment_mb: attachmentMb, social_mb: socialMb, profile_media_mb: profileMediaMb });
    setBusy(false);
    setNotice(error ? error.message : `${planKey === 'plus' ? 'Plus' : 'Ücretsiz'} plan limitleri kaydedildi.`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-rose-300/15 bg-[linear-gradient(120deg,rgba(244,63,94,.09),rgba(139,92,246,.06))] p-5">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-300/10 text-rose-200"><ShieldAlert className="h-5 w-5" /></span><div><h2 className="font-bold text-white">Platform yönetimi</h2><p className="text-xs text-slate-400">Bu alan personel JWT yetkisiyle açılır; bütün değişiklikler veritabanında tekrar doğrulanır.</p></div></div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Search className="h-4 w-4 text-violet-300" /> Kullanıcı bul</h3>
        <form onSubmit={searchUsers} className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kullanıcı adı" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-300/40" /><button className="rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}><Users className="mr-1 inline h-4 w-4" /> Bul</button></form>
        {users.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{users.map((profile) => <button key={profile.id} type="button" onClick={() => void selectUser(profile)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${selectedUser?.id === profile.id ? 'border-violet-300/40 bg-violet-300/10' : 'border-white/[0.07] bg-black/10 hover:bg-white/[0.04]'}`}><img src={profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(profile.username)}`} alt="" className="h-9 w-9 rounded-full object-cover" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{profile.username}</span><span className="block truncate text-[10px] text-slate-500">ID {profile.public_id || profile.id}</span></span></button>)}</div>}
        {selectedUser && <div className="mt-5 border-t border-white/[0.07] pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-slate-500">Seçilen kullanıcı</p><h4 className="mt-1 font-bold text-white">{selectedUser.username} <span className="text-xs font-normal text-violet-200">{plan?.plan_key === 'plus' ? 'Fastlynox Plus' : plan?.plan_key === 'free' ? 'Fastlynox' : (plan?.display_name?.replaceAll('FastCord', 'Fastlynox') || 'Plan yükleniyor…')}</span></h4></div><div className="flex items-center gap-2"><AnimatedSelect ariaLabel="Plus üyelik süresi" value={duration} onValueChange={setDuration} options={[{ value: 'forever', label: 'Süresiz' }, { value: '30', label: '30 gün' }, { value: '365', label: '1 yıl' }]} className="min-h-9 min-w-28 rounded-lg px-2 py-1 text-xs" /><button type="button" disabled={busy} onClick={() => void updateSubscription('plus')} className="rounded-lg bg-amber-300/15 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-300/25"><Crown className="mr-1 inline h-3.5 w-3.5" />Plus ver</button><button type="button" disabled={busy} onClick={() => void updateSubscription('free')} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Kaldır</button></div></div>
          <div className="grid gap-2 sm:grid-cols-2">{catalog.map((badge) => <button type="button" key={badge.badge_key} disabled={busy} onClick={() => void toggleBadge(badge.badge_key)} title={badge.description} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${badges.includes(badge.badge_key) ? 'border-amber-200/25 bg-amber-200/[0.08] text-amber-100' : 'border-white/[0.07] text-slate-400 hover:bg-white/[0.04]'}`}><Award className="h-4 w-4" />{badge.name}<span className="ml-auto">{badges.includes(badge.badge_key) ? 'Verildi · kaldır' : 'Rozet ver'}</span></button>)}</div>
        </div>}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">{['free', 'plus'].map((planKey) => <div key={planKey} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold text-white">{planKey === 'plus' ? 'Fastlynox Plus' : 'Ücretsiz plan'}</h3><p className="mt-1 text-xs text-slate-500">Kullanıcı başına dosya üst sınırları</p></div>{planKey === 'plus' && <Crown className="h-5 w-5 text-amber-200" />}</div><div className="space-y-3">{LIMIT_FIELDS.map(([field, label], index) => <label key={field} className="flex items-center justify-between gap-3 text-xs text-slate-300">{label}<span className="flex items-center gap-2"><input type="number" min="1" max={index === 2 ? 25 : 100} value={limits[planKey][index]} onChange={(event) => setLimits((current) => ({ ...current, [planKey]: current[planKey].map((value, i) => i === index ? Number(event.target.value) : value) }))} className="w-20 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-right text-white" />MB</span></label>)}</div><button type="button" disabled={busy} onClick={() => void saveLimits(planKey)} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">Limitleri kaydet</button></div>)}</section>
      <p className="text-xs leading-5 text-slate-500">Plus şu anda ödeme almadan personel tarafından tanımlanır. Ödeme ve otomatik yenileme için henüz bir sağlayıcı bağlanmadı. {notice && <span role="status" className="text-violet-200">{notice}</span>}</p>
    </div>
  );
}
