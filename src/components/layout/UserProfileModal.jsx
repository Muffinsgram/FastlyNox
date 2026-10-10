import { useEffect, useState } from 'react';
import { UserPlus, UserRoundCheck, X, Shield, Copy, ExternalLink, Bug, BadgeCheck, UsersRound, Headphones, Palette, Sparkles, Crown, ShieldCheck, LoaderCircle, Ban, VolumeX, Volume2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getAvatarUrl, getBannerUrl } from '../../lib/profileMedia';
import { useAuthStore } from '../../store/useAuthStore';
import { useFriendStore } from '../../store/useFriendStore';
import { supabase } from '../../lib/supabase';
import { getAppPreferences, saveAppPreferences } from '../../lib/appPreferences';
import { RoleEmoji } from '../ui/RoleEmoji';

const BADGE_ICONS = { staff: ShieldCheck, bug_hunter: Bug, early_supporter: Sparkles, community_builder: UsersRound, voice_pioneer: Headphones, creator: Palette, verified: BadgeCheck, server_owner: Crown };

export function UserProfileModal({ profile, role, serverId = null, serverName = '', onClose }) {
  const { user, session } = useAuthStore();
  const friendships = useFriendStore((state) => state.friendships);
  const sendFriendRequestToUser = useFriendStore((state) => state.sendFriendRequestToUser);
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [friendActionNotice, setFriendActionNotice] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [followError, setFollowError] = useState('');
  const [identityNotice, setIdentityNotice] = useState('');
  const [badgeCatalog, setBadgeCatalog] = useState([]);
  const [profileBadges, setProfileBadges] = useState([]);
  const [badgeNotice, setBadgeNotice] = useState('');
  const [isBadgeSaving, setIsBadgeSaving] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState('');
  const [serverMemberRole, setServerMemberRole] = useState(role || null);
  const [serverRoles, setServerRoles] = useState([]);
  const friendship = friendships.find((item) => (item.requester_id === user?.id && item.addressee_id === profile?.id) || (item.addressee_id === user?.id && item.requester_id === profile?.id));
  const isPlatformStaff = session?.user?.app_metadata?.platform_staff === true || session?.user?.app_metadata?.platform_staff === 'true';

  useEffect(() => {
    if (!profile) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [profile, onClose]);

  useEffect(() => {
    setServerMemberRole(role || null);
    setServerRoles([]);
    if (!serverId || !profile?.id) return undefined;
    let active = true;
    void Promise.all([
      supabase.from('server_members').select('role').eq('server_id', serverId).eq('user_id', profile.id).maybeSingle(),
      supabase.from('server_member_roles').select('role_id').eq('server_id', serverId).eq('user_id', profile.id),
      supabase.from('server_roles').select('id,name,color,position,emoji,gradient_color,animated').eq('server_id', serverId).order('position', { ascending: false }).order('id', { ascending: true }),
    ]).then(([memberResult, assignmentResult, roleResult]) => {
      if (!active) return;
      setServerMemberRole(memberResult.data?.role || role || null);
      const assignedIds = new Set((assignmentResult.data || []).map((assignment) => assignment.role_id));
      setServerRoles((roleResult.data || []).filter((serverRole) => assignedIds.has(serverRole.id)));
    });
    return () => { active = false; };
  }, [serverId, profile?.id, role]);

  useEffect(() => {
    if (!profile?.id) return undefined;
    let active = true;
    void Promise.all([
      supabase.from('profile_badge_definitions').select('badge_key,name,description,color,sort_order').order('sort_order'),
      supabase.from('profile_badges').select('badge_key,awarded_at').eq('user_id', profile.id),
    ]).then(([catalogResult, awardsResult]) => {
      if (!active) return;
      if (catalogResult.error || awardsResult.error) setBadgeNotice('Rozetler için migration_profile_badges.sql dosyasını Supabase’te çalıştır.');
      else setBadgeNotice('');
      setBadgeCatalog(catalogResult.data || []);
      setProfileBadges(awardsResult.data || []);
    });
    return () => { active = false; };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !user?.id || profile.id === user.id) return;
    let active = true;
    const loadFollowState = async () => {
      const [followState, followers] = await Promise.all([
        supabase.from('user_follows').select('follower_id').eq('follower_id', user.id).eq('followed_id', profile.id).maybeSingle(),
        supabase.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', profile.id),
      ]);
      if (!active) return;
      if (followState.error || followers.error) {
        setFollowError('Takip için migration_global_announcements.sql dosyasını Supabase’te çalıştır.');
        return;
      }
      setIsFollowing(Boolean(followState.data));
      setFollowerCount(followers.count || 0);
    };
    void loadFollowState();
    return () => { active = false; };
  }, [profile?.id, user?.id]);

  useEffect(() => {
    if (!user?.id || !profile?.id || user.id === profile.id) return;
    let active = true;
    void supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id).eq('blocked_id', profile.id).maybeSingle().then(({ data }) => {
      if (active) setIsBlocked(Boolean(data));
    });
    setIsMuted(getAppPreferences(user.id).mutedUserIds?.includes(profile.id) || false);
    return () => { active = false; };
  }, [profile?.id, user?.id]);

  const toggleFollow = async () => {
    if (!user?.id || !profile?.id || isFollowLoading) return;
    setIsFollowLoading(true);
    setFollowError('');
    const result = isFollowing
      ? await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('followed_id', profile.id)
      : await supabase.from('user_follows').insert({ follower_id: user.id, followed_id: profile.id });
    if (result.error) setFollowError(result.error.message);
    else {
      setIsFollowing(!isFollowing);
      setFollowerCount(count => Math.max(0, count + (isFollowing ? -1 : 1)));
    }
    setIsFollowLoading(false);
  };

  const sendFriendRequest = async () => {
    if (!profile?.id || friendActionBusy) return;
    setFriendActionBusy(true);
    const result = await sendFriendRequestToUser(profile.id, true);
    setFriendActionBusy(false);
    setFriendActionNotice(result.success ? 'Arkadaşlık isteği gönderildi.' : result.error || 'İstek gönderilemedi.');
  };

  const openDirectMessage = () => {
    if (!profile?.id) return;
    window.dispatchEvent(new CustomEvent('fastlynox:open-dm', { detail: { userId: profile.id } }));
    onClose?.();
  };

  const toggleBlock = async () => {
    if (!user?.id || !profile?.id || user.id === profile.id) return;
    setSafetyNotice('');
    const result = isBlocked
      ? await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', profile.id)
      : await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: profile.id });
    if (result.error) setSafetyNotice('Engelleme için migration_user_controls.sql dosyasını Supabase’te çalıştır.');
    else { setIsBlocked(!isBlocked); setSafetyNotice(isBlocked ? 'Engel kaldırıldı.' : 'Kullanıcı engellendi; yeni DM ve arkadaşlık isteği gönderemez.'); }
  };

  const toggleMute = () => {
    if (!user?.id || !profile?.id) return;
    const preferences = getAppPreferences(user.id);
    const current = preferences.mutedUserIds || [];
    const nextMuted = current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id];
    saveAppPreferences(user.id, { ...preferences, mutedUserIds: nextMuted });
    setIsMuted(nextMuted.includes(profile.id));
    setSafetyNotice(nextMuted.includes(profile.id) ? 'Bu kişiden gelen bildirimler sessize alındı.' : 'Bildirim sesi ve uyarıları yeniden açık.');
  };

  const copyIdentity = async (shareProfile = false) => {
    if (!profile.public_id) { setIdentityNotice('Sayısal kimlik için migration_public_numeric_ids.sql dosyasını Supabase’te çalıştır.'); return; }
    // Build secrets/env values occasionally get pasted with a trailing newline;
    // normalize the public origin before producing a shareable profile URL.
    const configuredBase = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
    const base = (configuredBase || window.location.origin).replace(/\/+$/u, '');
    const value = shareProfile ? `${base}/user/${profile.public_id}` : String(profile.public_id);
    try {
      await navigator.clipboard.writeText(value);
      setIdentityNotice(shareProfile ? 'Profil bağlantısı kopyalandı.' : 'Sayısal kullanıcı kimliği kopyalandı.');
    } catch {
      setIdentityNotice('Panoya kopyalanamadı. Tarayıcı pano iznini kontrol et.');
    }
  };

  const toggleProfileBadge = async (badgeKey) => {
    if (!isPlatformStaff || isBadgeSaving) return;
    const shouldAward = !profileBadges.some((badge) => badge.badge_key === badgeKey);
    setIsBadgeSaving(true);
    const { error } = await supabase.rpc('set_profile_badge', { target_user: profile.id, target_badge: badgeKey, should_award: shouldAward });
    setIsBadgeSaving(false);
    if (error) { setBadgeNotice(error.message); return; }
    setBadgeNotice(shouldAward ? 'Profil rozeti verildi.' : 'Profil rozeti kaldırıldı.');
    setProfileBadges((current) => shouldAward ? [...current, { badge_key: badgeKey, awarded_at: new Date().toISOString() }] : current.filter((badge) => badge.badge_key !== badgeKey));
  };

  if (!profile) return null;

  return createPortal((
    <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-[26px] border border-white/10 bg-[#10151f]/95 shadow-[0_30px_100px_rgba(0,0,0,.65)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Banner */}
        <div className="relative h-32 overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,.45),transparent_60%),linear-gradient(120deg,#151b28,#10141e)]">
          {getBannerUrl(profile.banner_url) && <img src={getBannerUrl(profile.banner_url)} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${profile.banner_position_x ?? 50}% ${profile.banner_position_y ?? 50}%`, transform: `scale(${profile.banner_zoom ?? 1})`, transformOrigin: `${profile.banner_position_x ?? 50}% ${profile.banner_position_y ?? 50}%` }} />}
          <div className="absolute inset-0 bg-gradient-to-t from-[#10151f]/70 to-transparent" />
        </div>
        
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
          <X className="w-4 h-4" />
        </button>

        {/* Avatar */}
        <div className="px-5 relative">
          <div className="absolute -top-12 left-5 h-24 w-24 rounded-[26px] border-[5px] border-[#10151f] bg-slate-800 shadow-xl">
            <img src={getAvatarUrl(profile.avatar_url, profile.username)} alt={`${profile.username} avatar`} className="h-full w-full rounded-[21px] object-cover" />
          </div>
        </div>

        {/* Info */}
        <div className="pt-14 px-5 pb-6">
          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
            <h2 className="flex items-center gap-2 text-xl font-bold" style={serverRoles[0]?.gradient_color ? { backgroundImage: `linear-gradient(100deg, ${serverRoles[0].color}, ${serverRoles[0].gradient_color}, ${serverRoles[0].color})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: serverRoles[0]?.color || '#fff' }}>
              {profile.username}
              {serverMemberRole === 'owner' && <Shield className="w-4 h-4 text-amber-500" />}
            </h2>
            <div className="mt-1 text-xs text-slate-500">Fastlynox kullanıcısı</div>
            {profile.status_text && (!profile.status_expires_at || new Date(profile.status_expires_at).getTime() > Date.now()) && <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-violet-200/10 bg-violet-300/[0.06] px-2.5 py-1 text-[10px] text-violet-100"><span className="h-1.5 w-1.5 rounded-full bg-violet-300" />{profile.status_text}</div>}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2"><span className="mr-auto text-[10px] text-slate-500">Kullanıcı ID <strong className="ml-1 font-mono text-slate-300">{profile.public_id ?? '—'}</strong></span><button type="button" onClick={() => void copyIdentity(false)} title="Sayısal kullanıcı kimliğini kopyala" aria-label="Sayısal kullanıcı kimliğini kopyala" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><Copy className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void copyIdentity(true)} title="Profil bağlantısını kopyala" aria-label="Profil bağlantısını kopyala" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-300/10"><ExternalLink className="h-3 w-3" /> Paylaş</button></div>
            {identityNotice && <p role="status" className="mt-1.5 text-[10px] text-cyan-200">{identityNotice}</p>}
            <section className="mt-4" aria-label="Profil rozetleri"><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Rozetler</h3>{isPlatformStaff && <span className="text-[9px] font-semibold text-violet-200">Staff yönetimi</span>}</div><div className="flex flex-wrap gap-1.5">{profileBadges.map((award) => { const badge = badgeCatalog.find((item) => item.badge_key === award.badge_key); if (!badge) return null; const Icon = BADGE_ICONS[badge.badge_key] || BadgeCheck; return <span key={badge.badge_key} title={`${badge.name} · ${badge.description}`} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold" style={{ color: badge.color, borderColor: `${badge.color}55`, backgroundColor: `${badge.color}18` }}><Icon className="h-3 w-3" />{badge.name}</span>; })}{profileBadges.length === 0 && !isPlatformStaff && <span className="text-[10px] text-slate-600">Henüz rozet yok</span>}</div>{isPlatformStaff && <div className="mt-2 flex flex-wrap gap-1">{badgeCatalog.map((badge) => { const awarded = profileBadges.some((item) => item.badge_key === badge.badge_key); const Icon = BADGE_ICONS[badge.badge_key] || BadgeCheck; return <button key={badge.badge_key} type="button" disabled={isBadgeSaving} onClick={() => void toggleProfileBadge(badge.badge_key)} title={badge.description} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] transition disabled:opacity-50 ${awarded ? 'border-rose-300/20 text-rose-200 hover:bg-rose-300/10' : 'border-white/[0.06] text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}><Icon className="h-3 w-3" />{awarded ? 'Kaldır' : `Ver: ${badge.name}`}</button>; })}{isBadgeSaving && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-violet-200" />}</div>}{badgeNotice && <p role="status" className="mt-1.5 text-[10px] text-amber-200">{badgeNotice}</p>}</section>
            {user?.id !== profile.id && <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" onClick={openDirectMessage} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">Mesaj gönder</button><button type="button" onClick={() => void (friendship ? setFriendActionNotice(friendship.status === 'accepted' ? 'Zaten arkadaşsınız.' : friendship.requester_id === user?.id ? 'Arkadaşlık isteği bekliyor.' : 'Bu kişiden bekleyen bir istek var.') : sendFriendRequest())} disabled={friendActionBusy || Boolean(friendship)} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-950/25 transition hover:bg-violet-400 disabled:cursor-default disabled:opacity-60">{friendship?.status === 'accepted' ? <UserRoundCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{friendActionBusy ? 'Gönderiliyor…' : friendship?.status === 'accepted' ? 'Arkadaş' : friendship ? 'İstek gönderildi' : 'Arkadaş ekle'}</button><button type="button" onClick={() => void toggleFollow()} disabled={isFollowLoading || !user?.id} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50 ${isFollowing ? 'border border-white/10 bg-white/[0.05] text-slate-200 hover:border-rose-200/20 hover:bg-rose-400/[0.08] hover:text-rose-100' : 'border border-white/10 bg-white/[0.035] text-slate-300 hover:bg-white/[0.08]'}`}>{isFollowing ? <UserRoundCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{isFollowLoading ? 'Güncelleniyor…' : isFollowing ? 'Takip ediliyor' : 'Takip et'}</button><span className="text-xs text-slate-400"><strong className="text-slate-200">{followerCount}</strong> takipçi</span></div>}
            {friendActionNotice && <p role="status" className="mt-2 text-[10px] text-violet-200">{friendActionNotice}</p>}
            {user?.id !== profile.id && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={toggleMute} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] text-slate-300 hover:bg-white/[0.05]">{isMuted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}{isMuted ? 'Sessizi kaldır' : 'Sessize al'}</button><button type="button" onClick={() => void toggleBlock()} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] ${isBlocked ? 'border-rose-300/15 text-rose-200 hover:bg-rose-300/[0.06]' : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.05] hover:text-rose-200'}`}><Ban className="h-3.5 w-3.5" />{isBlocked ? 'Engeli kaldır' : 'Engelle'}</button></div>}
            {safetyNotice && <p role="status" className="mt-2 text-[10px] text-violet-200">{safetyNotice}</p>}
            {followError && <p role="status" className="mt-2 text-[11px] text-amber-200">{followError}</p>}
            {profile.bio && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{profile.bio}</p>}
            
            {serverId && <><div className="my-4 h-px w-full bg-white/10" /><section aria-label="Sunucu profili ve rolleri" className="mb-1 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
              <div className="mb-2.5 flex items-center justify-between gap-3"><h3 className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">{serverName || 'Sunucu'} profili</h3><span className="rounded-full border border-white/[0.07] bg-black/15 px-2 py-1 text-[9px] font-semibold text-slate-400">{serverMemberRole === 'owner' ? 'Sunucu sahibi' : serverMemberRole === 'admin' ? 'Yönetici' : 'Üye'}</span></div>
              {serverRoles.length ? <div className="flex flex-wrap gap-1.5">{serverRoles.map((serverRole) => <span key={serverRole.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold" style={{ borderColor: `${serverRole.color}45`, backgroundColor: `${serverRole.color}12` }}><RoleEmoji value={serverRole.emoji} className="h-3.5 w-3.5" /><span className={serverRole.animated ? 'role-name-animated' : ''} style={serverRole.gradient_color ? { backgroundImage: `linear-gradient(100deg, ${serverRole.color}, ${serverRole.gradient_color}, ${serverRole.color})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: serverRole.color }}>{serverRole.name}</span></span>)}</div> : <p className="text-[11px] text-slate-500">Bu sunucuda atanmış özel rolü yok.</p>}
            </section></>}

          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
