import { useEffect, useState } from 'react';
import { UserPlus, UserRoundCheck, X, Shield, Copy, ExternalLink, Bug, BadgeCheck, UsersRound, Headphones, Palette, Sparkles, Crown, ShieldCheck, LoaderCircle, Ban, VolumeX, Volume2, Gamepad2, Music2, Server, Video, Camera, Radio } from 'lucide-react';
import { createPortal } from 'react-dom';
import { fetchProfiles, getAvatarUrl, getBannerUrl } from '../../lib/profileMedia';
import { useAuthStore } from '../../store/useAuthStore';
import { useFriendStore } from '../../store/useFriendStore';
import { useDMChatStore } from '../../store/useDMChatStore';
import { supabase } from '../../lib/supabase';
import { getAppPreferences, saveAppPreferences } from '../../lib/appPreferences';
import { RoleEmoji } from '../ui/RoleEmoji';

const BADGE_ICONS = { staff: ShieldCheck, bug_hunter: Bug, early_supporter: Sparkles, community_builder: UsersRound, voice_pioneer: Headphones, creator: Palette, verified: BadgeCheck, server_owner: Crown };

export function UserProfileModal({ profile, role, serverId = null, serverName = '', onClose }) {
  const { user, session } = useAuthStore();
  const friendships = useFriendStore((state) => state.friendships);
  const sendFriendRequestToUser = useFriendStore((state) => state.sendFriendRequestToUser);
  const getOrCreateDM = useFriendStore((state) => state.getOrCreateDM);
  const sendDMMessage = useDMChatStore((state) => state.sendMessage);
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
  const [mutualFriends, setMutualFriends] = useState([]);
  const [mutualServers, setMutualServers] = useState([]);
  const [profileActivities, setProfileActivities] = useState([]);
  const [socialLinks, setSocialLinks] = useState([]);
  const [connectionsNotice, setConnectionsNotice] = useState('');
  const [listenInviteNotice, setListenInviteNotice] = useState('');
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
    if (!profile?.id || !user?.id || profile.id === user.id) {
      setMutualFriends([]);
      setMutualServers([]);
      setProfileActivities([]);
      setSocialLinks([]);
      setConnectionsNotice('');
      return undefined;
    }
    let active = true;
    const loadActivity = async () => {
      const { data, error } = await supabase.from('user_profile_activities')
        .select('activity_type,title,details,external_url,album_art_url,spotify_uri,started_at,updated_at')
        .eq('user_id', profile.id)
        .gt('updated_at', new Date(Date.now() - 30_000).toISOString());
      if (active && !error) setProfileActivities(data || []);
    };
    const loadSocialLinks = async () => {
      const { data, error } = await supabase.from('user_social_links').select('platform,profile_url,visibility').eq('user_id', profile.id);
      if (active && !error) setSocialLinks(data || []);
    };
    const loadConnections = async () => {
      const connectionsResult = await supabase.rpc('get_profile_connections', { target_user: profile.id });
      if (!active) return;
      if (connectionsResult.error) {
        setConnectionsNotice('Ortak arkadaş ve sunucu bilgileri için migration_profile_social_activity.sql dosyasını Supabase SQL Editor’da çalıştır.');
      } else {
        setConnectionsNotice('');
        const rows = connectionsResult.data || [];
        const friendIds = rows.filter((item) => item.connection_type === 'friend').map((item) => item.connection_id);
        const [friends, servers] = await Promise.all([
          fetchProfiles(friendIds).catch(() => []),
          Promise.resolve(rows.filter((item) => item.connection_type === 'server')),
        ]);
        if (!active) return;
        setMutualFriends(friends);
        setMutualServers(servers);
      }
    };
    void loadConnections();
    void loadActivity();
    void loadSocialLinks();
    const channel = supabase.channel(`profile-activity:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profile_activities', filter: `user_id=eq.${profile.id}` }, () => { void loadActivity(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_social_links', filter: `user_id=eq.${profile.id}` }, () => { void loadSocialLinks(); })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, user?.id]);

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

  const sendListenInvite = async (activity) => {
    if (!user?.id || !profile?.id || !activity.external_url || !/^https:\/\/open\.spotify\.com\//u.test(activity.external_url)) return;
    setListenInviteNotice('Dinleme daveti gönderiliyor…');
    const dm = await getOrCreateDM(profile.id);
    if (!dm?.id) { setListenInviteNotice('Bu kullanıcıya özel mesaj gönderilemedi.'); return; }
    const result = await sendDMMessage(dm.id, `🎧 Birlikte dinleyelim mi?\n${activity.title}${activity.details ? ` — ${activity.details}` : ''}\n${activity.external_url}`);
    if (result.success) {
      setListenInviteNotice('Spotify bağlantısı özel mesajla gönderildi. İkiniz de parçayı kendi Spotify uygulamanızda açabilirsiniz.');
      window.dispatchEvent(new CustomEvent('fastlynox:open-dm', { detail: { userId: profile.id } }));
    } else setListenInviteNotice('Dinleme daveti gönderilemedi. ' + (result.error || ''));
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
      <div className="relative max-h-[90vh] w-[min(25rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto rounded-[26px] border border-white/10 bg-[#10151f]/95 shadow-[0_30px_100px_rgba(0,0,0,.65)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
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

            {socialLinks.length > 0 && <section aria-label="Bağlantılı profiller" className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5"><h3 className="mb-2.5 text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Bağlantılar</h3><div className="flex flex-wrap gap-2">{socialLinks.map((link) => {
              const social = { spotify: { name: 'Spotify', Icon: Music2 }, listenbrainz: { name: 'ListenBrainz', Icon: Radio }, steam: { name: 'Steam', Icon: Gamepad2 }, youtube: { name: 'YouTube', Icon: Video }, instagram: { name: 'Instagram', Icon: Camera } }[link.platform];
              if (!social || !/^https:\/\//u.test(link.profile_url || '')) return null;
              const SocialIcon = social.Icon;
              return <a key={link.platform} href={link.profile_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/15 px-3 py-2 text-[10px] font-semibold text-slate-300 transition hover:border-violet-200/20 hover:bg-white/[0.06] hover:text-white"><SocialIcon className="h-3.5 w-3.5 text-violet-200" />{social.name}<ExternalLink className="h-3 w-3 text-slate-600" /></a>;
            })}</div></section>}

            {profileActivities.length > 0 && <section aria-label="Kullanıcı etkinliği" className="mt-4 space-y-2">{profileActivities.map((activity) => {
              const isMusic = activity.activity_type === 'spotify' || activity.activity_type === 'music';
              const isSpotify = activity.activity_type === 'spotify';
              const Icon = isMusic ? Music2 : Gamepad2;
              return <div key={activity.activity_type} className={`rounded-2xl border p-3 ${isMusic ? 'border-emerald-300/15 bg-emerald-300/[0.045]' : 'border-violet-300/15 bg-violet-300/[0.045]'}`}>
                <div className="flex items-center gap-3">{isMusic && activity.album_art_url ? <img src={activity.album_art_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isMusic ? 'bg-emerald-300/10 text-emerald-200' : 'bg-violet-300/10 text-violet-200'}`}><Icon className="h-4 w-4" /></span>}<span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-[.15em] text-slate-500">{isSpotify ? 'Spotify dinliyor' : activity.activity_type === 'music' ? 'ListenBrainz dinliyor' : 'Şu anda oynuyor'}</span><span className="mt-1 block truncate text-xs font-bold text-slate-100">{activity.title}</span>{activity.details && <span className="mt-0.5 block truncate text-[10px] text-slate-400">{activity.details}</span>}</span>{isMusic && /^https:\/\//u.test(activity.external_url || '') && <a href={activity.external_url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-emerald-200/15 px-2.5 py-1 text-[9px] font-semibold text-emerald-100 hover:bg-emerald-300/10">Parçayı aç</a>}{isSpotify && /^https:\/\/open\.spotify\.com\//u.test(activity.external_url || '') && <div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => window.open(activity.external_url, '_blank', 'noopener,noreferrer')} className="rounded-lg border border-emerald-200/15 px-2.5 py-1 text-[9px] font-semibold text-emerald-100 hover:bg-emerald-300/10">Spotify’da aç</button>{user?.id !== profile.id && <button type="button" onClick={() => void sendListenInvite(activity)} className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-[9px] font-semibold text-slate-300 hover:bg-white/[0.06]">Dinleme daveti</button>}</div>}</div>
              </div>;
            })}</section>}
            {listenInviteNotice && <p role="status" className="mt-1 text-[10px] leading-4 text-emerald-200">{listenInviteNotice}</p>}

            {(mutualFriends.length > 0 || mutualServers.length > 0 || connectionsNotice) && <section aria-label="Ortak bağlantılar" className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
              <div className="mb-3 flex items-center gap-2"><UsersRound className="h-3.5 w-3.5 text-violet-200" /><h3 className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Ortak bağlantılar</h3></div>
              {mutualFriends.length > 0 && <div className="mb-3"><p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">Ortak arkadaşlar · {mutualFriends.length}</p><div className="flex flex-wrap gap-1.5">{mutualFriends.slice(0, 8).map((friend) => <span key={friend.id} title={friend.username} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/15 py-1 pl-1 pr-2.5"><img src={getAvatarUrl(friend.avatar_url, friend.username)} alt="" className="h-5 w-5 rounded-full object-cover" /><span className="max-w-28 truncate text-[10px] font-semibold text-slate-300">{friend.username}</span></span>)}{mutualFriends.length > 8 && <span className="self-center text-[10px] text-slate-500">+{mutualFriends.length - 8}</span>}</div></div>}
              {mutualServers.length > 0 && <div><p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">Ortak sunucular · {mutualServers.length}</p><div className="flex flex-wrap gap-1.5">{mutualServers.slice(0, 8).map((server) => <span key={server.connection_id} title={server.display_name} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/15 py-1 pl-1 pr-2.5">{server.icon_url ? <img src={server.icon_url} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="grid h-5 w-5 place-items-center rounded-full bg-white/[0.07]"><Server className="h-3 w-3 text-slate-400" /></span>}<span className="max-w-28 truncate text-[10px] font-semibold text-slate-300">{server.display_name}</span></span>)}{mutualServers.length > 8 && <span className="self-center text-[10px] text-slate-500">+{mutualServers.length - 8}</span>}</div></div>}
              {connectionsNotice && <p role="status" className="text-[10px] leading-4 text-amber-200">{connectionsNotice}</p>}
              {!mutualFriends.length && !mutualServers.length && !connectionsNotice && <p className="text-[10px] text-slate-500">Henüz ortak bağlantı yok.</p>}
            </section>}
            
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
