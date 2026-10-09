import React, { useCallback, useState, useEffect, useRef } from 'react';
import { X, Shield, Copy, Check, ImagePlus, Trash2, Link2, ScrollText, LockKeyhole, UsersRound, Settings2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useServerStore } from '../../../store/useServerStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { fetchProfiles, getAvatarUrl, uploadProfileImage } from '../../../lib/profileMedia';
import { ServerRolesPanel } from './ServerRolesPanel';
import { ChannelPermissionsPanel } from './ChannelPermissionsPanel';
import { ServerAuditLogPanel } from './ServerAuditLogPanel';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';
import { useEscapeClose } from '../../../hooks/useEscapeClose';
import { getInviteUrl } from '../../../lib/inviteLinks';

export function ServerSettingsModal({ onClose }) {
  const { activeServerId, servers, fetchServers, deleteServer } = useServerStore();
  const { user } = useAuthStore();
  const serverData = servers.find(s => s.id === activeServerId);
  const [activeTab, setActiveTab] = useState('overview');
  useEscapeClose(onClose);
  const [members, setMembers] = useState([]);
  const [bans, setBans] = useState([]);
  const [copied, setCopied] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [invites, setInvites] = useState([]);
  const [vanityUrl, setVanityUrl] = useState(serverData?.vanity_url || '');
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState('');
  const [serverPermissions, setServerPermissions] = useState({ manage_roles: false, manage_channels: false, manage_server: false, view_audit_log: false, kick_members: false, ban_members: false });
  const [actionMessage, setActionMessage] = useState('');
  const [serverName, setServerName] = useState(serverData?.name || '');
  const [serverIcon, setServerIcon] = useState(serverData?.icon_url || '');
  const [serverIconProgress, setServerIconProgress] = useState(null);
  const [groupMembersByRole, setGroupMembersByRole] = useState(Boolean(serverData?.group_members_by_role));
  const [isSavingMemberGrouping, setIsSavingMemberGrouping] = useState(false);
  const [isSavingServer, setIsSavingServer] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeletingServer, setIsDeletingServer] = useState(false);
  const iconInput = useRef(null);

  const isOwner = serverData?.owner_id === user?.id;
  const canManageRoles = serverPermissions.manage_roles || isOwner || serverData?.member_role === 'admin';
  const canManageChannels = serverPermissions.manage_channels || isOwner || serverData?.member_role === 'admin';
  const canManageServer = serverPermissions.manage_server || isOwner || serverData?.member_role === 'admin';
  const canViewAuditLog = serverPermissions.view_audit_log || isOwner || serverData?.member_role === 'admin';
  const canKickMembers = serverPermissions.kick_members || isOwner || serverData?.member_role === 'admin';
  const canBanMembers = serverPermissions.ban_members || isOwner || serverData?.member_role === 'admin';

  useEffect(() => {
    if (!activeServerId) return;
    let active = true;
    Promise.all(['manage_roles', 'manage_channels', 'manage_server', 'view_audit_log', 'kick_members', 'ban_members'].map(async permission => {
      const { data } = await supabase.rpc('has_server_permission', { server_uuid: activeServerId, permission_key: permission });
      return [permission, Boolean(data)];
    })).then(results => { if (active) setServerPermissions(Object.fromEntries(results)); });
    return () => { active = false; };
  }, [activeServerId]);

  useEffect(() => { setVanityUrl(serverData?.vanity_url || ''); }, [serverData?.vanity_url]);
  useEffect(() => { setGroupMembersByRole(Boolean(serverData?.group_members_by_role)); }, [serverData?.id, serverData?.group_members_by_role]);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase.from('server_members').select('*').eq('server_id', activeServerId);
    if (data && data.length > 0) {
      const profs = await fetchProfiles(data.map(d => d.user_id));
      setMembers(data.map(d => ({ ...d, profiles: profs?.find(p => p.id === d.user_id) })));
    } else {
      setMembers([]);
    }
  }, [activeServerId]);

  const fetchBans = useCallback(async () => {
    const { data } = await supabase.from('server_bans').select('*').eq('server_id', activeServerId);
    if (data && data.length > 0) {
      const profs = await fetchProfiles(data.map(d => d.user_id));
      setBans(data.map(d => ({ ...d, profiles: profs?.find(p => p.id === d.user_id) })));
    } else {
      setBans([]);
    }
  }, [activeServerId]);

  const fetchInvites = useCallback(async () => {
    const { data, error } = await supabase.from('server_invites').select('id,code,created_at,expires_at,max_uses,uses,revoked_at').eq('server_id', activeServerId).order('created_at', { ascending: false }).limit(8);
    if (!error) setInvites(data || []);
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) return;
    void fetchMembers();
    void fetchBans();
    void fetchInvites();
  }, [activeServerId, fetchMembers, fetchBans, fetchInvites]);

  const copyInvite = async () => {
    const code = serverData?.vanity_url || inviteCode;
    if (!code) { setActionMessage('Önce kısa bir davet bağlantısı oluştur.'); return; }
    const inviteUrl = getInviteUrl(code);
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setActionMessage('Kısa davet bağlantısı kopyalandı.');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteCode = async code => {
    try { await navigator.clipboard.writeText(getInviteUrl(code)); setActionMessage('Davet bağlantısı kopyalandı.'); }
    catch { setActionMessage('Davet panoya kopyalanamadı.'); }
  };

  const createInvite = async () => {
    setActionMessage('');
    const { data, error } = await supabase.rpc('create_server_invite', {
      server_uuid: activeServerId,
      invite_expiry_hours: inviteExpiry ? Number(inviteExpiry) : null,
      invite_max_uses: inviteMaxUses ? Number(inviteMaxUses) : null,
    });
    if (error) setActionMessage(error.message);
    else { setInviteCode(data); setActionMessage('Kısa davet bağlantısı oluşturuldu.'); void fetchInvites(); }
  };

  const revokeInvite = async invite => {
    const { error } = await supabase.rpc('revoke_server_invite', { invite_uuid: invite.id });
    if (error) setActionMessage(error.message);
    else { setActionMessage('Davet bağlantısı iptal edildi.'); void fetchInvites(); }
  };

  const saveVanityUrl = async event => {
    event.preventDefault();
    const { data, error } = await supabase.rpc('set_server_vanity_url', { server_uuid: activeServerId, vanity: vanityUrl });
    if (error) setActionMessage(error.message);
    else { setVanityUrl(data || ''); await fetchServers(); setActionMessage(data ? 'Özel sunucu bağlantısı kaydedildi.' : 'Özel bağlantı kaldırıldı.'); }
  };

  const handleKick = async (memberUserId) => {
    if (!canKickMembers) return;
    setActionMessage('');
    const { error } = await supabase.rpc('moderate_server_member', {
      server_uuid: activeServerId,
      target_user: memberUserId,
      should_ban: false,
      ban_reason: null,
    });
    if (error) setActionMessage(error.message);
    else void fetchMembers();
  };

  const handleBan = async (memberUserId) => {
    if (!canBanMembers) return;
    setActionMessage('');
    const { error } = await supabase.rpc('moderate_server_member', {
      server_uuid: activeServerId,
      target_user: memberUserId,
      should_ban: true,
      ban_reason: 'Banned by the server owner',
    });
    if (error) setActionMessage(error.message);
    else {
      void fetchMembers();
      void fetchBans();
    }
  };

  const handleUnban = async (banId) => {
    if (!canBanMembers) return;
    setActionMessage('');
    const { error } = await supabase.rpc('unban_server_member', { ban_uuid: banId });
    if (error) setActionMessage(error.message);
    else void fetchBans();
  };

  const updateMemberRole = async (memberUserId, role) => {
    if (!canManageRoles || !['member', 'admin'].includes(role)) return;
    setActionMessage('');
    const { error } = await supabase.rpc('set_server_member_role', {
      server_uuid: activeServerId,
      target_user: memberUserId,
      new_role: role,
    });
    if (error) setActionMessage(error.message);
    else { setActionMessage('Üye rolü güncellendi.'); void fetchMembers(); }
  };

  const handleSaveServer = async (event) => {
    event.preventDefault();
    if (!isOwner) return;
    const name = serverName.trim();
    if (!name || name.length > 100) { setActionMessage('Sunucu adı 1–100 karakter arasında olmalı.'); return; }
    setIsSavingServer(true);
    setActionMessage('');
    const { error } = await supabase.from('servers').update({ name, icon_url: serverIcon || null }).eq('id', activeServerId).eq('owner_id', user.id);
    if (error) setActionMessage(error.message);
    else { await fetchServers(); setActionMessage('Sunucu ayarları kaydedildi.'); }
    setIsSavingServer(false);
  };

  const saveMemberGrouping = async (enabled) => {
    if (!canManageServer || isSavingMemberGrouping) return;
    const previousValue = groupMembersByRole;
    setGroupMembersByRole(enabled);
    setIsSavingMemberGrouping(true);
    const { error } = await supabase.rpc('set_server_member_role_grouping', {
      server_uuid: activeServerId,
      enabled,
    });
    if (error) {
      setGroupMembersByRole(previousValue);
      setActionMessage(error.message);
    } else {
      await fetchServers();
      setActionMessage(enabled ? 'Üye listesi rol gruplarına göre gösterilecek.' : 'Üye listesi çevrim içi/çevrim dışı olarak gösterilecek.');
    }
    setIsSavingMemberGrouping(false);
  };

  const handleServerIcon = async (file) => {
    if (!file || !user) return;
    setActionMessage('Sunucu görseli yükleniyor…');
    setServerIconProgress(0);
    try {
      const uploaded = await uploadProfileImage(file, user.id, 'server-icon', setServerIconProgress);
      setServerIcon(uploaded.url);
      setActionMessage('Sunucu görseli yüklendi. Kaydetmeyi unutma.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sunucu görseli yüklenemedi.';
      setActionMessage(/row-level security|new row violates/i.test(message)
        ? 'Depolama izni reddedildi. migration_fix_server_icon_storage_rls.sql dosyasını Supabase SQL Editor’da çalıştırıp yeniden dene.'
        : message);
    } finally { setServerIconProgress(null); }
  };

  const handleDeleteServer = async () => {
    if (!isOwner || deleteConfirmation.trim() !== serverData.name) return;
    setIsDeletingServer(true);
    setActionMessage('');
    const result = await deleteServer(activeServerId);
    if (!result.success) {
      setActionMessage(result.error);
      setIsDeletingServer(false);
      return;
    }
    onClose();
  };

  if (!serverData) return null;

  return (
    <div className="fixed inset-0 z-[100] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Sidebar */}
      <div className="w-1/3 bg-[#0A0D12] flex justify-end py-12 px-6">
        <div className="w-48 flex flex-col gap-1">
          <div className="px-3 pb-2 text-xs font-black text-slate-500 uppercase">{serverData.name}</div>
          <button onClick={() => setActiveTab('overview')} className={`flex items-center gap-2 text-left px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${activeTab === 'overview' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Settings2 className="h-4 w-4" /> Genel Görünüm</button>
          
          <div className="px-3 pt-4 pb-2 text-xs font-black text-slate-500 uppercase">Kullanıcı Yönetimi</div>
          <button onClick={() => setActiveTab('members')} className={`flex items-center gap-2 text-left px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${activeTab === 'members' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><UsersRound className="h-4 w-4" /> Üyeler</button>
          <button onClick={() => setActiveTab('bans')} className={`text-left px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${activeTab === 'bans' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>Yasaklar</button>
          {(canManageRoles || canManageChannels || canViewAuditLog) && <><div className="px-3 pt-4 pb-2 text-xs font-black text-slate-500 uppercase">Yönetim modülleri</div>{canManageRoles && <button onClick={() => setActiveTab('roles')} className={`flex items-center gap-2 text-left px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${activeTab === 'roles' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Shield className="h-4 w-4" /> Roller ve şablonlar</button>}{canManageChannels && <button onClick={() => setActiveTab('channel-permissions')} className={`flex items-center gap-2 text-left px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${activeTab === 'channel-permissions' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><LockKeyhole className="h-4 w-4" /> Kanal izinleri</button>}{canViewAuditLog && <button onClick={() => setActiveTab('audit')} className={`flex items-center gap-2 text-left px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${activeTab === 'audit' ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><ScrollText className="h-4 w-4" /> İşlem kaydı</button>}</>}
        </div>
      </div>

      {/* Content */}
      <div className="relative min-w-0 flex-1 overflow-y-auto bg-fastcord-panel px-5 py-12 sm:px-10">
        <div className="max-w-6xl pr-10">
          {actionMessage && <p role={/kaydedildi|yüklendi|güncellendi/i.test(actionMessage) ? 'status' : 'alert'} className={`mb-4 text-sm ${/kaydedildi|yüklendi|güncellendi/i.test(actionMessage) ? 'text-emerald-300' : 'text-rose-400'}`}>{actionMessage}</p>}
          {activeTab === 'overview' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-xl font-bold text-white mb-6">Sunucu Genel Görünümü</h2>
              <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-sm font-bold text-slate-200">Sunucu profili</h3>
                <form onSubmit={handleSaveServer} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={() => iconInput.current?.click()} disabled={!isOwner} aria-label="Sunucu görselini değiştir" className="group relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-slate-400 hover:border-violet-300/40">
                      {serverIcon ? <img src={serverIcon} alt="Sunucu görseli" className="h-full w-full object-cover" /> : <span className="text-2xl font-bold text-white">{serverName.charAt(0) || '?'}</span>}
                      <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition group-hover:opacity-100"><ImagePlus className="h-4 w-4 text-white" /></span>
                    </button>
                    <input ref={iconInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleServerIcon(file); event.target.value = ''; }} />
                    <label className="min-w-0 flex-1 text-xs text-slate-400">Sunucu adı<input value={serverName} onChange={(event) => setServerName(event.target.value)} maxLength={100} disabled={!isOwner} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-300/40 disabled:opacity-60" /></label>
                  </div>
                  {serverIconProgress !== null && <div className="rounded-xl border border-violet-200/10 bg-violet-300/[0.04] px-3 py-2"><div className="mb-1.5 flex items-center justify-between text-[10px] text-violet-100"><span>Görsel yükleniyor</span><span>{serverIconProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width]" style={{ width: `${serverIconProgress}%` }} /></div></div>}
                  {isOwner && <button type="submit" disabled={isSavingServer} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50">{isSavingServer ? 'Kaydediliyor…' : 'Ayarları kaydet'}</button>}
                </form>
              </div>
              <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-200">Üye listesini rollere göre grupla</h3>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Açıldığında üyeler, atandıkları en yüksek özel rolün renkli başlığı altında görünür. Çevrim içi ve çevrim dışı bölümleri korunur.</p>
                </div>
                <button type="button" role="switch" aria-checked={groupMembersByRole} aria-label="Üye listesini rollere göre grupla" disabled={!canManageServer || isSavingMemberGrouping} onClick={() => void saveMemberGrouping(!groupMembersByRole)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${groupMembersByRole ? 'bg-violet-500' : 'bg-slate-700'}`}>
                  <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${groupMembersByRole ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200"><Link2 className="h-4 w-4" /></span><div><h3 className="text-sm font-bold text-slate-200">Sunucu bağlantıları</h3><p className="mt-1 text-xs text-slate-500">Kısa davet kodu üret veya sunucuya özel URL ayarla.</p></div></div>
                {canManageServer && <form onSubmit={saveVanityUrl} className="mb-4 rounded-xl border border-white/[0.07] bg-black/15 p-3"><label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Özel URL · 3–24 karakter<input value={vanityUrl} onChange={event => setVanityUrl(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} maxLength={24} placeholder="topluluk-adin" className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b0f16] px-3 py-2.5 text-sm font-normal normal-case text-white outline-none placeholder:text-slate-600 focus:border-cyan-200/30" /></label><p className="mt-1.5 text-[10px] text-slate-500">{getInviteUrl(vanityUrl || 'sunucu-adin')}</p><button type="submit" className="mt-2 rounded-lg bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/15">URL’yi kaydet</button></form>}
                {canManageServer && <div className="mb-3 flex flex-wrap items-center gap-2"><AnimatedSelect value={inviteExpiry} onValueChange={setInviteExpiry} ariaLabel="Davet bağlantısı süresi" className="w-36 text-xs" options={[{ value: '', label: 'Süresiz' }, { value: '1', label: '1 saat' }, { value: '6', label: '6 saat' }, { value: '24', label: '24 saat' }, { value: '168', label: '7 gün' }]} /><AnimatedSelect value={inviteMaxUses} onValueChange={setInviteMaxUses} ariaLabel="Davet kullanım sınırı" className="w-44 text-xs" options={[{ value: '', label: 'Sınırsız kullanım' }, ...[1, 5, 10, 25, 50, 100].map(count => ({ value: String(count), label: `${count} kullanım` }))]} /><button type="button" onClick={() => void createInvite()} className="min-h-10 rounded-xl border border-violet-200/10 bg-gradient-to-br from-violet-300/[0.16] to-indigo-300/[0.08] px-3.5 text-xs font-semibold text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] transition hover:border-violet-200/25 hover:from-violet-300/20 hover:to-indigo-300/15">Kısa davet oluştur</button></div>}
                {(serverData.vanity_url || inviteCode) && <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 font-mono text-xs text-emerald-300">{getInviteUrl(serverData.vanity_url || inviteCode)}</code><button type="button" onClick={() => void copyInvite()} className="flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/15">{copied ? <><Check className="h-4 w-4" /> Kopyalandı</> : <><Copy className="h-4 w-4" /> Kopyala</>}</button></div>}
                {canManageServer && invites.length > 0 && <div className="mt-3 space-y-1.5">{invites.map(invite => <div key={invite.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${invite.revoked_at ? 'border-white/[0.05] opacity-45' : 'border-white/[0.07] bg-black/10'}`}><code className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-300">{getInviteUrl(invite.code)}</code><span className="text-[9px] text-slate-500">{invite.uses}{invite.max_uses ? `/${invite.max_uses}` : ''} kullanım</span>{!invite.revoked_at && <><button type="button" title="Bu daveti kopyala" aria-label={`${invite.code} davetini kopyala`} onClick={() => void copyInviteCode(invite.code)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.07] hover:text-white"><Copy className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void revokeInvite(invite)} className="rounded-lg px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-300/10">İptal</button></>}</div>)}</div>}
              </div>
              {isOwner && <div className="mt-5 rounded-2xl border border-rose-300/15 bg-rose-400/[0.035] p-5">
                <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-400/10 text-rose-300"><Trash2 className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold text-rose-100">Sunucuyu sil</h3><p className="mt-1 text-xs leading-5 text-slate-400">Sunucu, kanallar ve mesajlar kalıcı olarak silinir. Onaylamak için sunucu adını yaz.</p></div></div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input aria-label="Silinecek sunucunun adı" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder={serverData.name} disabled={isDeletingServer} className="min-w-0 flex-1 rounded-xl border border-rose-200/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-rose-300/40" /><button type="button" onClick={() => void handleDeleteServer()} disabled={isDeletingServer || deleteConfirmation.trim() !== serverData.name} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" />{isDeletingServer ? 'Siliniyor…' : 'Kalıcı olarak sil'}</button></div>
              </div>}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-xl font-bold text-white mb-6">Sunucu Üyeleri - {members.length}</h2>
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-3 rounded-lg hover:bg-white/[0.04] transition-colors group">
                    <div className="flex items-center gap-3">
                      <img src={getAvatarUrl(m.profiles?.avatar_url, m.profiles?.username)} alt="" className="w-10 h-10 rounded-full bg-slate-800 object-cover" />
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          {m.profiles?.username}
                          {m.user_id === serverData.owner_id && <Shield className="w-3.5 h-3.5 text-amber-500" />}
                        </div>
                        {isOwner && m.user_id !== user.id ? (
                            <AnimatedSelect ariaLabel={`${m.profiles?.username || 'Üye'} rolü`} value={m.role} onValueChange={(role) => updateMemberRole(m.user_id, role)} options={[{ value: 'member', label: 'Üye' }, { value: 'admin', label: 'Yönetici' }]} className="mt-1 min-h-8 min-w-28 px-2 py-1 text-xs font-bold" />
                          ) : (
                            <div className="text-xs font-bold text-slate-400 mt-1">{m.role === 'owner' ? 'Sunucu Sahibi' : m.role === 'admin' ? 'Yönetici' : 'Üye'}</div>
                          )}
                      </div>
                    </div>
                    {(canKickMembers || canBanMembers) && m.user_id !== user.id && m.user_id !== serverData.owner_id && m.role !== 'admin' && (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canKickMembers && <button onClick={() => handleKick(m.user_id)} className="text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white px-3 py-1.5 rounded font-bold transition-colors">At</button>}
                        {canBanMembers && <button onClick={() => handleBan(m.user_id)} className="text-xs bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded font-bold transition-colors">Yasakla</button>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'bans' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-xl font-bold text-white mb-6">Yasaklı Kullanıcılar - {bans.length}</h2>
              {bans.length === 0 ? (
                <div className="text-slate-500 text-sm">Bu sunucuda yasaklanmış kimse yok.</div>
              ) : (
                <div className="space-y-2">
                  {bans.map(b => (
                    <div key={b.id} className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-3 rounded-lg hover:bg-white/[0.04] transition-colors group">
                      <div className="flex items-center gap-3">
                        <img src={getAvatarUrl(b.profiles?.avatar_url, b.profiles?.username)} alt="" className="w-10 h-10 rounded-full bg-slate-800 object-cover" />
                        <div>
                          <div className="font-bold text-white text-sm">{b.profiles?.username}</div>
                          <div className="text-xs text-slate-400">Sebep: {b.reason}</div>
                        </div>
                      </div>
                      {canBanMembers && (
                        <button onClick={() => handleUnban(b.id)} className="text-xs bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white px-3 py-1.5 rounded font-bold transition-colors opacity-0 group-hover:opacity-100">Yasağı Kaldır</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'roles' && canManageRoles && <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><h2 className="mb-2 text-xl font-bold text-white">Roller ve izin şablonları</h2><p className="mb-5 text-xs leading-5 text-slate-400">Hazır rol şablonuyla başla, yetkileri özelleştir ve rolleri üyelere ata.</p><ServerRolesPanel serverId={activeServerId} members={members} onNotice={setActionMessage} /></div>}
          {activeTab === 'channel-permissions' && canManageChannels && <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><h2 className="mb-2 text-xl font-bold text-white">Kanal izinleri</h2><p className="mb-5 text-xs leading-5 text-slate-400">Her kanalda role özel görüntüleme, yazma ve ses izinleri belirle.</p><ChannelPermissionsPanel serverId={activeServerId} onNotice={setActionMessage} /></div>}
          {activeTab === 'audit' && canViewAuditLog && <div className="animate-in fade-in slide-in-from-bottom-4 duration-300"><h2 className="mb-5 text-xl font-bold text-white">Yönetim hareketleri</h2><ServerAuditLogPanel serverId={activeServerId} onNotice={setActionMessage} /></div>}
        </div>

        <button onClick={onClose} className="absolute top-12 right-12 w-10 h-10 rounded-full border-2 border-slate-500 flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-all flex-col gap-1">
          <X className="w-5 h-5" />
          <span className="text-[10px] font-bold absolute -bottom-5">ESC</span>
        </button>
      </div>
    </div>
  );
}



