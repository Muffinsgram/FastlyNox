import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Check, Copy, Search, Shield, UserMinus, UserRound, UsersRound, X, ShieldAlert, Clock3, Headphones } from 'lucide-react';
import { UserProfileModal } from '../../../components/layout/UserProfileModal';
import { ActionContextMenu } from '../../../components/layout/ActionContextMenu';
import { RoleEmoji } from '../../../components/ui/RoleEmoji';
import { supabase } from '../../../lib/supabase';
import { fetchProfiles, getAvatarUrl } from '../../../lib/profileMedia';
import { usePresenceStore } from '../../../store/usePresenceStore';
import { resolvePresenceStatus } from '../../../lib/presenceSessions';
import { memberRefreshFailure, memberRetryDelay, roleRefreshPatch } from '../../../lib/memberRefresh';
import { useAuthStore } from '../../../store/useAuthStore';
import { useServerStore } from '../../../store/useServerStore';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';

const SYSTEM_ROLE_META = {
  owner: { label: 'Sunucu sahibi', color: '#fbbf24' },
  admin: { label: 'Yöneticiler', color: '#a78bfa' },
  member: { label: 'Üyeler', color: '#94a3b8' },
};

export function ServerMemberList({ activeServerId, voiceMemberChannels = {} }) {
  const [members, setMembers] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [roleAssignments, setRoleAssignments] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [roleManagerMember, setRoleManagerMember] = useState(null);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [moderationPermissions, setModerationPermissions] = useState({ kick: false, ban: false });
  const [moderationDialog, setModerationDialog] = useState(null);
  const [moderationReason, setModerationReason] = useState('');
  const [banDurationHours, setBanDurationHours] = useState('permanent');
  const [moderationBusy, setModerationBusy] = useState(false);
  const [roleActionId, setRoleActionId] = useState(null);
  const [roleSearch, setRoleSearch] = useState('');
  const [presenceFilter, setPresenceFilter] = useState('all');
  const [contextMenu, setContextMenu] = useState(null);
  const [actionNotice, setActionNotice] = useState('');
  const [clock, setClock] = useState(Date.now());
  const statuses = usePresenceStore((state) => state.statuses);
  const presenceVisibility = usePresenceStore((state) => state.visibility);
  const voiceStatuses = usePresenceStore((state) => state.voiceStatuses);
  const ownPresenceStatus = usePresenceStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const server = useServerStore((state) => state.servers.find((item) => item.id === activeServerId));
  const isOwner = server?.owner_id === user?.id;

  useEffect(() => {
    let alive = true;
    if (!activeServerId || !user?.id) { setCanManageRoles(false); return undefined; }
    if (isOwner || server?.member_role === 'admin') { setCanManageRoles(true); return undefined; }
    supabase.rpc('has_server_permission', { server_uuid: activeServerId, permission_key: 'manage_roles' })
      .then(({ data }) => { if (alive) setCanManageRoles(Boolean(data)); })
      .catch(() => { if (alive) setCanManageRoles(false); });
    return () => { alive = false; };
  }, [activeServerId, user?.id, isOwner, server?.member_role]);

  useEffect(() => {
    if (!activeServerId || !user?.id) { setModerationPermissions({ kick: false, ban: false }); return undefined; }
    if (isOwner || server?.member_role === 'admin') { setModerationPermissions({ kick: true, ban: true }); return undefined; }
    let alive = true;
    Promise.all([
      supabase.rpc('has_server_permission', { server_uuid: activeServerId, permission_key: 'kick_members' }),
      supabase.rpc('has_server_permission', { server_uuid: activeServerId, permission_key: 'ban_members' }),
    ]).then(([kickResult, banResult]) => { if (alive) setModerationPermissions({ kick: Boolean(kickResult.data), ban: Boolean(banResult.data) }); })
      .catch(() => { if (alive) setModerationPermissions({ kick: false, ban: false }); });
    return () => { alive = false; };
  }, [activeServerId, user?.id, isOwner, server?.member_role]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const getStatus = (userId) => resolvePresenceStatus(userId, statuses, presenceVisibility, voiceStatuses, clock, user?.id, ownPresenceStatus);
  const statusLabel = (status) => status === 'online' ? 'Çevrim içi' : status === 'idle' ? 'Boşta' : status === 'dnd' ? 'Rahatsız etmeyin' : 'Çevrim dışı';

  const moderateMember = async (member, shouldBan) => {
    if (!member?.user_id || member.user_id === user?.id || member.user_id === server?.owner_id || moderationBusy) return;
    setModerationBusy(true);
    const { error } = await supabase.rpc('moderate_server_member_with_expiry', {
      server_uuid: activeServerId,
      target_user: member.user_id,
      should_ban: shouldBan,
      ban_reason: moderationReason.trim() || null,
      ban_duration_hours: shouldBan && banDurationHours !== 'permanent' ? Number(banDurationHours) : null,
    });
    setModerationBusy(false);
    setModerationDialog(null);
    setContextMenu(null);
    setActionNotice(error ? `İşlem yapılamadı: ${error.message}` : (shouldBan ? 'Üye sunucudan yasaklandı.' : 'Üye sunucudan çıkarıldı.'));
    window.setTimeout(() => setActionNotice(''), 4500);
  };


  const contextItems = contextMenu ? [
    { id: 'profile', label: 'Sunucu profilini görüntüle', icon: UserRound, onSelect: () => setSelectedUser(contextMenu.member) },
    ...(canManageRoles && (contextMenu.member.user_id !== server?.owner_id || isOwner) && (contextMenu.member.user_id !== user?.id || isOwner) ? [
      { id: 'manage-roles', label: 'Rolleri yönet', icon: UsersRound, onSelect: () => setRoleManagerMember(contextMenu.member) },
    ] : []),
    { id: 'copy-id', label: 'Kullanıcı kimliğini kopyala', icon: Copy, onSelect: async () => {
      const publicId = contextMenu.member.profiles?.public_id;
      if (!publicId) { setActionNotice('Sayısal kimlik için migration_public_numeric_ids.sql dosyasını çalıştır.'); window.setTimeout(() => setActionNotice(''), 3000); return; }
      try {
        await navigator.clipboard.writeText(String(publicId));
        setActionNotice('Sayısal kullanıcı kimliği kopyalandı.');
      } catch { setActionNotice('Kimlik kopyalanamadı. Tarayıcı pano iznini kontrol et.'); }
      window.setTimeout(() => setActionNotice(''), 3000);
    } },
    ...((moderationPermissions.kick || moderationPermissions.ban) && contextMenu.member.user_id !== user?.id && contextMenu.member.user_id !== server?.owner_id ? [
      { separator: true },
      ...(moderationPermissions.kick ? [{ id: 'kick', label: 'Sunucudan çıkar…', icon: UserMinus, danger: true, onSelect: () => { setModerationReason(''); setModerationDialog({ member: contextMenu.member, kind: 'kick' }); } }] : []),
      ...(moderationPermissions.ban ? [{ id: 'ban', label: 'Sunucudan yasakla…', icon: Ban, danger: true, onSelect: () => { setModerationReason(''); setBanDurationHours('permanent'); setModerationDialog({ member: contextMenu.member, kind: 'ban' }); } }] : []),
    ] : []),
  ] : [];

  const toggleMemberRole = async (role) => {
    if (!roleManagerMember || roleActionId) return;
    const targetId = roleManagerMember.user_id;
    const assigned = (roleAssignments[targetId] || []).includes(role.id);
    setRoleActionId(role.id);
    const { error } = assigned
      ? await supabase.from('server_member_roles').delete().eq('server_id', activeServerId).eq('user_id', targetId).eq('role_id', role.id)
      : await supabase.from('server_member_roles').insert({ server_id: activeServerId, user_id: targetId, role_id: role.id });
    setRoleActionId(null);
    if (error) { setActionNotice(memberRefreshFailure(error, 'Rol değişikliği').message.replace('Otomatik yeniden deneniyor.', 'Yeniden dene.')); window.setTimeout(() => setActionNotice(''), 3500); return; }
    setRoleAssignments((current) => ({
      ...current,
      [targetId]: assigned ? (current[targetId] || []).filter((id) => id !== role.id) : [...(current[targetId] || []), role.id],
    }));
  };

  const filteredRoleOptions = useMemo(() => {
    const query = roleSearch.trim().toLocaleLowerCase('tr');
    return query ? customRoles.filter((role) => role.name.toLocaleLowerCase('tr').includes(query)) : customRoles;
  }, [customRoles, roleSearch]);

  useEffect(() => {
    if (!moderationDialog) return undefined;
    const close = (event) => { if (event.key === 'Escape' && !moderationBusy) setModerationDialog(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [moderationDialog, moderationBusy]);

  useEffect(() => {
    if (!roleManagerMember) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setRoleManagerMember(null);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [roleManagerMember]);

  useEffect(() => {
    if (!activeServerId) return undefined;
    let alive = true;
    let fetchVersion = 0;
    let refreshTimer;
    let fetching = false;
    let fetchQueued = false;
    let failures = 0;
    let retryAt = 0;
    setMembers([]);
    setCustomRoles([]);
    setRoleAssignments({});
    setActionNotice('');
    const queueFetch = () => {
      if (!alive) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void fetchMembers(), Math.max(120, retryAt - Date.now()));
    };
    const reportFailure = (error, subject) => {
      const failure = memberRefreshFailure(error, subject);
      setActionNotice(failure.message);
      if (failure.transient) {
        retryAt = Date.now() + memberRetryDelay(++failures);
        queueFetch();
      }
    };
    const fetchMembers = async () => {
      if (!alive) return;
      if (fetching) { fetchQueued = true; return; }
      fetching = true;
      const version = ++fetchVersion;
      try {
        const [memberResult, roleResult, assignmentResult] = await Promise.all([
          supabase.from('server_members').select('*').eq('server_id', activeServerId),
          supabase.from('server_roles').select('id,name,color,position,emoji,gradient_color,animated').eq('server_id', activeServerId).order('position', { ascending: false }).order('id', { ascending: true }),
          supabase.from('server_member_roles').select('user_id,role_id').eq('server_id', activeServerId),
        ]);
        if (!alive || version !== fetchVersion) return;
        const { data: memberRows, error } = memberResult;
        const { error: roleError } = roleResult;
        const { error: assignmentError } = assignmentResult;
        if (error) {
          console.error('fetchMembers Error:', error);
          reportFailure(error, 'Üyeler');
          return;
        }

        const rows = memberRows || [];
        const profiles = rows.length ? await fetchProfiles(rows.map((member) => member.user_id)) : [];
        if (!alive || version !== fetchVersion) return;
        setMembers((current) => rows.map((member) => ({
          ...member,
          profiles: profiles?.find((profile) => profile.id === member.user_id) || current.find((item) => item.user_id === member.user_id)?.profiles || {},
        })));
        const patch = roleRefreshPatch(roleResult, assignmentResult);
        if (patch) {
          setCustomRoles(patch.roles);
          setRoleAssignments(patch.assignments);
        }
        const secondaryError = roleError || assignmentError;
        if (secondaryError) {
          console.error('fetchMemberRoles Error:', secondaryError);
          reportFailure(secondaryError, 'Rol bilgileri');
        } else {
          failures = 0;
          retryAt = 0;
          setActionNotice('');
        }
      } catch (error) {
        if (alive && version === fetchVersion) reportFailure(error, 'Üye ve rol bilgileri');
      } finally {
        fetching = false;
        if (alive && fetchQueued) { fetchQueued = false; queueFetch(); }
      }
    };

    void fetchMembers();
    const channel = supabase.channel(`server-member-list:${activeServerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `server_id=eq.${activeServerId}` }, queueFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_member_roles', filter: `server_id=eq.${activeServerId}` }, queueFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_roles', filter: `server_id=eq.${activeServerId}` }, queueFetch)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') queueFetch();
      });

    return () => {
      alive = false;
      clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [activeServerId]);

  const statusGroups = useMemo(() => {
    const online = [];
    const offline = [];
    members.forEach((member) => (getStatus(member.user_id) === 'offline' ? offline : online).push(member));
    const byName = (a, b) => (a.profiles?.username || '').localeCompare(b.profiles?.username || '', 'tr');
    online.sort(byName);
    offline.sort(byName);
    const sections = [
      { id: 'online', label: 'ÇEVRİM İÇİ', members: online },
      { id: 'offline', label: 'ÇEVRİM DIŞI', members: offline },
    ];
    return presenceFilter === 'all' ? sections : sections.filter((group) => group.id === presenceFilter);
  // Presence store and the clock intentionally trigger recalculation as statuses change/stale out.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, statuses, presenceVisibility, voiceStatuses, clock, presenceFilter, ownPresenceStatus, user?.id]);

  const getRoleGroups = (statusMembers) => {
    const groups = new Map();
    const unassigned = [];
    statusMembers.forEach((member) => {
      const assignedIds = new Set(roleAssignments[member.user_id] || []);
      const highestRole = customRoles.find((role) => assignedIds.has(role.id));
      if (!highestRole) { unassigned.push(member); return; }
      if (!groups.has(highestRole.id)) groups.set(highestRole.id, { id: highestRole.id, label: highestRole.name, color: highestRole.color || '#a5b4fc', gradientColor: highestRole.gradient_color, emoji: highestRole.emoji, animated: highestRole.animated, members: [] });
      groups.get(highestRole.id).members.push(member);
    });
    const roleGroups = customRoles.filter((role) => groups.has(role.id)).map((role) => groups.get(role.id));
    // Preserve the familiar owner/admin/member identity for users without a custom role.
    Object.entries(SYSTEM_ROLE_META).forEach(([roleKey, meta]) => {
      const matching = unassigned.filter((member) => member.role === roleKey);
      if (matching.length) roleGroups.push({ id: `system-${roleKey}`, label: meta.label, color: meta.color, members: matching });
    });
    const assignedSystemIds = new Set(Object.keys(SYSTEM_ROLE_META));
    const remaining = unassigned.filter((member) => !assignedSystemIds.has(member.role));
    if (remaining.length) roleGroups.push({ id: 'system-member', label: 'Üyeler', color: SYSTEM_ROLE_META.member.color, members: remaining });
    return roleGroups;
  };

  const renderMember = (member, roleGroup) => {
    const status = getStatus(member.user_id);
    const highestAssignedRole = customRoles.find((role) => (roleAssignments[member.user_id] || []).includes(role.id));
    const appearanceRole = highestAssignedRole || (roleGroup?.id !== 'everyone' ? roleGroup : SYSTEM_ROLE_META[member.role]);
    const nameStyle = appearanceRole?.gradient_color
      ? { backgroundImage: `linear-gradient(100deg, ${appearanceRole.color}, ${appearanceRole.gradient_color}, ${appearanceRole.color})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
      : { color: appearanceRole?.color || '#cbd5e1' };
    return (
      <div key={member.user_id} title={canManageRoles ? 'Sağ tık: üye işlemleri ve rol yönetimi' : 'Sağ tık: üye işlemleri'} onClick={() => setSelectedUser(member)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: event.clientX, y: event.clientY, member }); }} className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5">
        <div className="relative">
          <img src={getAvatarUrl(member.profiles?.avatar_url, member.profiles?.username)} alt="" className="h-8 w-8 rounded-full bg-slate-800 object-cover" />
          <span aria-label={statusLabel(status)} title={statusLabel(status)} className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#151a24] ${status === 'online' ? 'bg-emerald-400' : status === 'idle' ? 'bg-amber-300' : status === 'dnd' ? 'bg-rose-400' : 'bg-slate-600'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 truncate text-sm font-bold transition-colors group-hover:text-white ${appearanceRole?.animated ? 'role-name-animated' : ''}`} style={nameStyle}>
            <span className="truncate">{member.profiles?.username || 'Bilinmeyen'}</span>
            {voiceMemberChannels[member.user_id] && <Headphones className="h-3 w-3 shrink-0 text-emerald-300" aria-label={`${voiceMemberChannels[member.user_id]} ses kanalında`} title={`${voiceMemberChannels[member.user_id]} ses kanalında`} />}
            {member.role === 'owner' && <Shield className="h-3 w-3 shrink-0 text-amber-500" />}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="macos-panel flex w-60 shrink-0 flex-col border-l border-white/5 bg-[#151a24]/80">
      <div className="flex h-12 shrink-0 items-center border-b border-white/5 px-4">
        <span className="text-sm font-bold text-slate-200">Üyeler ({members.length})</span>
      </div>
      <div className="flex shrink-0 gap-1 border-b border-white/[0.05] px-3 py-2">{[{ id: 'all', label: 'Tümü' }, { id: 'online', label: 'Çevrim içi' }, { id: 'offline', label: 'Çevrim dışı' }].map((filter) => <button key={filter.id} type="button" aria-pressed={presenceFilter === filter.id} onClick={() => setPresenceFilter(filter.id)} className={`rounded-lg px-2 py-1 text-[9px] font-semibold transition ${presenceFilter === filter.id ? 'bg-violet-300/[0.13] text-violet-100' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'}`}>{filter.label}</button>)}</div>
      {actionNotice && <div role="status" className="mx-3 mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] text-slate-300">{actionNotice}</div>}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        {statusGroups.map((statusGroup) => {
          if (!statusGroup.members.length) return null;
          // Offline members stay in one simple list; role sections are useful for
          // active members, but an extra "Üyeler" section under "Çevrim dışı"
          // makes the same status hierarchy look duplicated.
          const roleGroups = statusGroup.id === 'offline'
            ? [{ id: 'offline-members', label: '', members: statusGroup.members }]
            : getRoleGroups(statusGroup.members);
          return (
            <section key={statusGroup.id} className="mb-5">
              {statusGroup.id === 'offline' && <h3 className="mb-2 text-[11px] font-bold tracking-wide text-slate-500">ÇEVRİM DIŞI — {statusGroup.members.length}</h3>}
              {roleGroups.map((roleGroup) => (
                <div key={`${statusGroup.id}-${roleGroup.id}`} className="mb-3">
                  {roleGroup.label && <h4 className={`mb-1.5 flex items-center gap-1.5 truncate px-2 text-[10px] font-extrabold uppercase tracking-wide ${roleGroup.animated ? 'role-name-animated' : ''}`} style={roleGroup.gradientColor ? { backgroundImage: `linear-gradient(100deg, ${roleGroup.color}, ${roleGroup.gradientColor}, ${roleGroup.color})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: roleGroup.color }}><RoleEmoji value={roleGroup.emoji} className="h-3.5 w-3.5 text-xs" /><span className="truncate">{roleGroup.label} — {roleGroup.members.length}</span></h4>}
                  <div className="space-y-0.5">{roleGroup.members.map((member) => renderMember(member, roleGroup))}</div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      {selectedUser && <UserProfileModal profile={selectedUser.profiles} role={selectedUser.role} serverId={activeServerId} serverName={server?.name} onClose={() => setSelectedUser(null)} />}
      {moderationDialog && createPortal(<div className="fixed inset-0 z-[860] grid place-items-center bg-[#05070c]/75 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget && !moderationBusy) setModerationDialog(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="member-moderation-title" className="w-full max-w-md overflow-hidden rounded-[26px] border border-white/[0.12] bg-[linear-gradient(145deg,rgba(27,33,47,.98),rgba(13,17,26,.99))] shadow-[0_35px_120px_rgba(0,0,0,.72)] animate-in fade-in zoom-in-95 duration-200">
          <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4"><span className={`grid h-10 w-10 place-items-center rounded-xl ${moderationDialog.kind === 'ban' ? 'bg-rose-300/10 text-rose-200' : 'bg-amber-300/10 text-amber-100'}`}>{moderationDialog.kind === 'ban' ? <Ban className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">{server?.name || 'Sunucu moderasyonu'}</p><h2 id="member-moderation-title" className="mt-1 text-sm font-bold text-white">{moderationDialog.kind === 'ban' ? 'Üyeyi yasakla' : 'Üyeyi sunucudan çıkar'}</h2><p className="mt-0.5 truncate text-[10px] text-slate-400">{moderationDialog.member.profiles?.username || 'Fastlynox üyesi'}</p></div><button type="button" disabled={moderationBusy} onClick={() => setModerationDialog(null)} aria-label="Kapat" className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button></header>
          <div className="space-y-4 p-5">
            {moderationDialog.kind === 'ban' && <label className="block"><span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Yasaklama süresi</span><AnimatedSelect ariaLabel="Yasaklama süresi" value={banDurationHours} onValueChange={setBanDurationHours} options={[{ value: 'permanent', label: 'Kalıcı' }, { value: '1', label: '1 saat' }, { value: '24', label: '24 saat' }, { value: '168', label: '7 gün' }, { value: '720', label: '30 gün' }]} className="w-full" disabled={moderationBusy} /></label>}
            {moderationDialog.kind === 'ban' && <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><ShieldAlert className="h-3.5 w-3.5" />Yasaklama sebebi <span className="font-normal normal-case text-slate-600">· isteğe bağlı</span></span><textarea value={moderationReason} onChange={(event) => setModerationReason(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Sebep ekle…" className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-600 focus:border-violet-200/25" /></label>}
            <p className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-[10px] leading-4 text-slate-500"><Clock3 className="h-3.5 w-3.5 shrink-0" />{moderationDialog.kind === 'ban' ? 'Süre dolduğunda üye yeniden davetle katılabilir.' : 'Üye daha sonra yeniden davetle sunucuya katılabilir.'}</p>
          </div>
          <footer className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-4"><button type="button" disabled={moderationBusy} onClick={() => setModerationDialog(null)} className="rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-400 hover:bg-white/[0.05] hover:text-white">Vazgeç</button><button type="button" disabled={moderationBusy} onClick={() => void moderateMember(moderationDialog.member, moderationDialog.kind === 'ban')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${moderationDialog.kind === 'ban' ? 'bg-rose-500 hover:bg-rose-400' : 'bg-amber-500 hover:bg-amber-400'}`}>{moderationBusy && <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/40 border-t-white" />}{moderationDialog.kind === 'ban' ? 'Yasakla' : 'Üyeyi çıkar'}</button></footer>
        </section>
      </div>, document.body)}
      {roleManagerMember && createPortal(<div className="fixed inset-0 z-[850] grid place-items-center bg-[#05070c]/72 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.target === event.currentTarget) setRoleManagerMember(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="member-role-title" className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/[0.12] bg-[linear-gradient(145deg,rgba(26,32,46,.98),rgba(14,18,27,.98))] shadow-[0_35px_120px_rgba(0,0,0,.72)] animate-in fade-in zoom-in-95 duration-200">
          <header className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5"><span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-200/10 bg-violet-300/[0.09] text-violet-100"><UsersRound className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-violet-200/65">Sunucu üyeliği</p><h2 id="member-role-title" className="mt-1 text-base font-bold text-white">Rolleri yönet</h2><p className="mt-0.5 truncate text-xs text-slate-400">{roleManagerMember.profiles?.username || 'Fastlynox üyesi'} için rol seç</p></div><button type="button" onClick={() => setRoleManagerMember(null)} aria-label="Kapat" className="rounded-xl border border-white/[0.06] p-2 text-slate-400 transition hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button></header>
          <div className="border-b border-white/[0.06] px-5 py-4"><label className="flex h-11 items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-black/20 px-3.5 transition focus-within:border-violet-200/30 focus-within:bg-black/30"><Search className="h-4 w-4 shrink-0 text-slate-500" /><input autoFocus value={roleSearch} onChange={(event) => setRoleSearch(event.target.value)} placeholder="Rol ara…" aria-label="Rol ara" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />{roleSearch && <button type="button" onClick={() => setRoleSearch('')} aria-label="Aramayı temizle" className="rounded-md p-1 text-slate-500 hover:text-white"><X className="h-3.5 w-3.5" /></button>}</label><p className="mt-2 px-1 text-[10px] text-slate-500">Bir role dokunarak üyeye ekleyebilir veya üyeden kaldırabilirsin.</p></div>
          <div className="max-h-[55vh] min-h-28 space-y-1.5 overflow-y-auto p-4">
            {customRoles.length ? filteredRoleOptions.length ? filteredRoleOptions.map((role) => {
              const assigned = (roleAssignments[roleManagerMember.user_id] || []).includes(role.id);
              return <button key={role.id} type="button" aria-pressed={assigned} disabled={Boolean(roleActionId)} onClick={() => void toggleMemberRole(role)} className={`group flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition duration-150 ${assigned ? 'border-violet-200/20 bg-violet-300/[0.08] shadow-[inset_0_0_24px_rgba(167,139,250,.035)]' : 'border-white/[0.055] bg-black/10 hover:border-white/[0.13] hover:bg-white/[0.035]'}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/20 text-base shadow-inner">{role.emoji ? <RoleEmoji value={role.emoji} className="h-5 w-5 text-xl" /> : <span className="h-3 w-3 rounded-full shadow-[0_0_12px_currentColor]" style={{ backgroundColor: role.color, color: role.color }} />}</span>
                <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-semibold ${role.animated ? 'role-name-animated' : ''}`} style={role.gradient_color ? { backgroundImage: `linear-gradient(100deg, ${role.color}, ${role.gradient_color}, ${role.color})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: role.color }}>{role.name}</span><span className="mt-1 block text-[10px] text-slate-500">{assigned ? 'Üyede etkin · tıklayarak kaldır' : 'Üyeye eklemek için tıkla'}</span></span>
                <span className={`grid h-7 w-7 place-items-center rounded-full border transition ${assigned ? 'border-violet-200/25 bg-violet-300/15 text-violet-100' : 'border-white/[0.08] text-transparent group-hover:text-slate-500'}`}>{roleActionId === role.id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" /> : <Check className="h-4 w-4" />}</span>
              </button>;
            }) : <div className="py-10 text-center"><Search className="mx-auto mb-2 h-5 w-5 text-slate-600" /><p className="text-xs text-slate-400">“{roleSearch}” için rol bulunamadı.</p></div> : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center"><Shield className="mx-auto mb-2 h-6 w-6 text-slate-600" /><p className="text-sm font-medium text-slate-300">Henüz özel rol oluşturulmamış</p><p className="mt-1 text-xs text-slate-500">Sunucu ayarlarından bir rol oluşturduğunda burada atayabilirsin.</p></div>}
          </div>
          <footer className="flex items-center justify-between border-t border-white/[0.07] px-5 py-4"><span className="text-[10px] text-slate-500">Bir üyeye birden fazla rol verilebilir. Esc ile kapat.</span><button type="button" onClick={() => setRoleManagerMember(null)} className="rounded-xl border border-white/[0.08] bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.11]">Bitti</button></footer>
        </section>
      </div>, document.body)}
      <ActionContextMenu position={contextMenu} items={contextItems} onClose={() => setContextMenu(null)} label="Üye işlemleri" />
    </div>
  );
}
