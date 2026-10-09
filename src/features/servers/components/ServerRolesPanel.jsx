import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Check, Copy, GripVertical, ImagePlus, Loader2, Plus, Shield, Trash2, X, UsersRound } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';
import { RoleEmoji } from '../../../components/ui/RoleEmoji';
import { useAuthStore } from '../../../store/useAuthStore';
import { usePresenceStore } from '../../../store/usePresenceStore';
import { removeProfileImage, uploadRoleEmoji } from '../../../lib/profileMedia';

const ROLE_TEMPLATES = [
  { key: 'moderator', name: 'Moderatör', color: '#f08c67', permissions: { manage_messages: true, kick_members: true, mute_members: true, deafen_members: true, view_audit_log: true } },
  { key: 'voice', name: 'Ses moderatörü', color: '#55d6be', permissions: { mute_members: true, deafen_members: true, move_members: true } },
  { key: 'channel', name: 'Kanal yöneticisi', color: '#9b83ff', permissions: { manage_channels: true, view_channel: true, send_messages: true } },
  { key: 'verified', name: 'Onaylı üye', color: '#7ba9ff', permissions: { view_channel: true, send_messages: true, attach_files: true, connect: true, speak: true, add_reactions: true } },
];
const PERMISSION_GROUPS = [
  { name: 'Sunucu ve üyeler', permissions: [
    { id: 'manage_server', label: 'Davetleri ve sunucu bağlantısını yönet' },
    { id: 'manage_roles', label: 'Rolleri ve üye rollerini yönet' },
    { id: 'kick_members', label: 'Üyeleri sunucudan at' },
    { id: 'ban_members', label: 'Üyeleri yasakla' },
    { id: 'view_audit_log', label: 'İşlem kaydını görüntüle' },
  ] },
  { name: 'Kanallar ve mesajlar', permissions: [
    { id: 'manage_channels', label: 'Kanalları ve kategorileri yönet' },
    { id: 'manage_messages', label: 'Başkalarının mesajlarını sil' },
    { id: 'view_channel', label: 'Gizli kanalları görüntüle' },
    { id: 'send_messages', label: 'Mesaj gönder' },
    { id: 'attach_files', label: 'Dosya ve medya ekle' },
    { id: 'add_reactions', label: 'Tepki ekle' },
  ] },
  { name: 'Ses odaları', permissions: [
    { id: 'connect', label: 'Ses odalarına bağlan' },
    { id: 'speak', label: 'Ses odasında konuş' },
    { id: 'mute_members', label: 'Sunucuda üyeleri sustur' },
    { id: 'deafen_members', label: 'Sunucuda üyeleri sağırlaştır' },
    { id: 'move_members', label: 'Üyeleri ses odaları arasında taşı' },
  ] },
];
const EMPTY_PERMISSIONS = {};

export function ServerRolesPanel({ serverId, members, onNotice }) {
  const [roles, setRoles] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#8b9cff');
  const [roleEmoji, setRoleEmoji] = useState('');
  const [emojiFile, setEmojiFile] = useState(null);
  const [emojiLocalPreview, setEmojiLocalPreview] = useState('');
  const [emojiUploadProgress, setEmojiUploadProgress] = useState(null);
  const [emojiError, setEmojiError] = useState('');
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [gradientColor, setGradientColor] = useState('#a78bfa');
  const [animatedRole, setAnimatedRole] = useState(false);
  const [mentionable, setMentionable] = useState(false);
  const [permissions, setPermissions] = useState(EMPTY_PERMISSIONS);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedRoleId, setDraggedRoleId] = useState(null);
  const [dragOverRoleId, setDragOverRoleId] = useState(null);
  const [isReordering, setIsReordering] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [bulkRoleId, setBulkRoleId] = useState('');
  const [bulkMode, setBulkMode] = useState('assign');
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [memberStatusFilter, setMemberStatusFilter] = useState('all');
  const [clock, setClock] = useState(Date.now());
  const statuses = usePresenceStore((state) => state.statuses);
  const presenceVisibility = usePresenceStore((state) => state.visibility);
  const [templateNotice, setTemplateNotice] = useState('');
  const emojiInputRef = useRef(null);
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => () => { if (emojiLocalPreview) URL.revokeObjectURL(emojiLocalPreview); }, [emojiLocalPreview]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [{ data: roleRows, error: roleError }, { data: memberRows, error: memberError }] = await Promise.all([
      supabase.from('server_roles').select('*').eq('server_id', serverId).order('position', { ascending: false }).order('id', { ascending: true }),
      supabase.from('server_member_roles').select('user_id,role_id').eq('server_id', serverId),
    ]);
    if (roleError || memberError) onNotice?.('Roller için migration_server_roles_permissions.sql dosyasını Supabase SQL Editor’da çalıştır.');
    setRoles(roleRows || []);
    setAssignments((memberRows || []).reduce((map, row) => ({ ...map, [row.user_id]: [...(map[row.user_id] || []), row.role_id] }), {}));
    setIsLoading(false);
  }, [serverId, onNotice]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const clearForm = () => { setEditingRoleId(null); setRoleName(''); setRoleColor('#8b9cff'); setRoleEmoji(''); setEmojiFile(null); setEmojiLocalPreview(''); setEmojiError(''); setGradientEnabled(false); setGradientColor('#a78bfa'); setAnimatedRole(false); setMentionable(false); setPermissions(EMPTY_PERMISSIONS); };

  const applyTemplate = template => {
    setEditingRoleId(null);
    setRoleName(template.name);
    setRoleColor(template.color);
    setRoleEmoji('');
    setEmojiFile(null);
    setEmojiLocalPreview('');
    setEmojiError('');
    setGradientEnabled(false);
    setAnimatedRole(false);
    setMentionable(false);
    setPermissions({ ...EMPTY_PERMISSIONS, ...template.permissions });
    setTemplateNotice(`${template.name} şablonu forma yüklendi; kaydetmeden önce düzenleyebilirsin.`);
  };

  const setPermission = (permissionId, value) => setPermissions(current => {
    const next = { ...current };
    if (value === 'inherit') delete next[permissionId];
    else next[permissionId] = value === 'allow';
    return next;
  });

  const saveRole = async (event) => {
    event.preventDefault();
    const name = roleName.trim();
    if (!name || isSaving) return;
    setIsSaving(true);
    let uploadedEmoji = null;
    const previousEmoji = roles.find((role) => role.id === editingRoleId)?.emoji;
    let savedEmoji = roleEmoji.trim() || null;
    try {
      if (emojiFile) {
        setEmojiUploadProgress(0);
        uploadedEmoji = await uploadRoleEmoji(emojiFile, userId, setEmojiUploadProgress);
        savedEmoji = uploadedEmoji.url;
      }
    } catch (reason) {
      setIsSaving(false);
      setEmojiUploadProgress(null);
      setEmojiError(reason instanceof Error ? reason.message : 'Rol emojisi yüklenemedi.');
      return;
    }
    const payload = { server_id: serverId, name, color: roleColor, emoji: savedEmoji, gradient_color: gradientEnabled ? gradientColor : null, animated: animatedRole, mentionable, permissions };
    if (editingRoleId) payload.position = roles.find((role) => role.id === editingRoleId)?.position ?? 0;
    else payload.position = 0;
    const query = editingRoleId
      ? supabase.from('server_roles').update(payload).eq('id', editingRoleId).eq('server_id', serverId)
      : supabase.from('server_roles').insert(payload);
    const { error } = await query;
    setIsSaving(false);
    setEmojiUploadProgress(null);
    if (error) {
      if (uploadedEmoji?.path) await removeProfileImage(uploadedEmoji.path);
      onNotice?.(error.message);
      return;
    }
    if (previousEmoji && previousEmoji !== savedEmoji && previousEmoji.includes('/storage/v1/object/public/profile-media/')) await removeProfileImage(previousEmoji);
    onNotice?.(editingRoleId ? 'Rol güncellendi.' : 'Rol oluşturuldu.');
    setTemplateNotice('');
    clearForm();
    void refresh();
  };

  const editRole = (role) => {
    setEditingRoleId(role.id);
    setRoleName(role.name);
    setRoleColor(role.color || '#8b9cff');
    setRoleEmoji(role.emoji || '');
    setEmojiFile(null);
    setEmojiLocalPreview('');
    setEmojiError('');
    setGradientEnabled(Boolean(role.gradient_color));
    setGradientColor(role.gradient_color || '#a78bfa');
    setAnimatedRole(Boolean(role.animated));
    setMentionable(Boolean(role.mentionable));
    setPermissions({ ...EMPTY_PERMISSIONS, ...(role.permissions || {}) });
  };

  const removeRole = async (roleId) => {
    const roleToRemove = roles.find((role) => role.id === roleId);
    const { error } = await supabase.from('server_roles').delete().eq('id', roleId).eq('server_id', serverId);
    if (error) { onNotice?.(error.message); return; }
    if (roleToRemove?.emoji?.includes('/storage/v1/object/public/profile-media/')) await removeProfileImage(roleToRemove.emoji);
    onNotice?.('Rol silindi; bu role ait erişim izinleri de kaldırıldı.');
    if (editingRoleId === roleId) clearForm();
    void refresh();
  };

  const persistRoleOrder = async (orderedRoles) => {
    const previousRoles = roles;
    setRoles(orderedRoles.map((role, index) => ({ ...role, position: orderedRoles.length - index - 1 })));
    setIsReordering(true);
    const { error } = await supabase.rpc('reorder_server_roles', {
      server_uuid: serverId,
      ordered_role_ids: orderedRoles.map((role) => role.id),
    });
    setIsReordering(false);
    if (error) {
      setRoles(previousRoles);
      onNotice?.(error.message);
      return;
    }
    onNotice?.('Rol sıralaması kaydedildi.');
  };

  const dropRoleOn = (targetRoleId) => {
    if (!draggedRoleId || draggedRoleId === targetRoleId || isReordering) return;
    const fromIndex = roles.findIndex((role) => role.id === draggedRoleId);
    const toIndex = roles.findIndex((role) => role.id === targetRoleId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...roles];
    const [dragged] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragged);
    setDraggedRoleId(null);
    setDragOverRoleId(null);
    void persistRoleOrder(next);
  };

  const copyRoleId = async (role) => {
    if (!role.public_id) { onNotice?.('Sayısal rol kimliği için migration_public_numeric_ids.sql dosyasını Supabase’te çalıştır.'); return; }
    try { await navigator.clipboard.writeText(String(role.public_id)); onNotice?.(`${role.name} rol kimliği kopyalandı.`); }
    catch { onNotice?.('Rol kimliği panoya kopyalanamadı.'); }
  };

  const copyRoleMention = async (role) => {
    if (!role.public_id) { onNotice?.('Sayısal rol etiketi için migration_public_numeric_ids.sql dosyasını Supabase’te çalıştır.'); return; }
    try { await navigator.clipboard.writeText(`<@&${role.public_id}>`); onNotice?.(`${role.name} rol etiketi kopyalandı.`); }
    catch { onNotice?.('Rol etiketi panoya kopyalanamadı.'); }
  };

  const selectRoleEmoji = (file) => {
    setEmojiError('');
    if (!file) return;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) { setEmojiError('PNG, JPG, WebP veya GIF dosyası seç.'); return; }
    const maxBytes = file.type === 'image/gif' ? 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > maxBytes) { setEmojiError(file.type === 'image/gif' ? 'GIF rol emojisi 1 MB sınırını aşmamalı.' : 'Rol emojisi 4 MB sınırını aşmamalı.'); return; }
    setEmojiFile(file);
    setRoleEmoji('');
    setEmojiLocalPreview(URL.createObjectURL(file));
  };

  const clearRoleEmoji = () => {
    setEmojiFile(null);
    setEmojiLocalPreview('');
    setRoleEmoji('');
    setEmojiError('');
  };

  const toggleAssignment = async (userId, roleId) => {
    const currentlyAssigned = (assignments[userId] || []).includes(roleId);
    const { error } = currentlyAssigned
      ? await supabase.from('server_member_roles').delete().eq('server_id', serverId).eq('user_id', userId).eq('role_id', roleId)
      : await supabase.from('server_member_roles').insert({ server_id: serverId, user_id: userId, role_id: roleId });
    if (error) { onNotice?.(error.message); return; }
    setAssignments((current) => ({ ...current, [userId]: currentlyAssigned ? (current[userId] || []).filter((id) => id !== roleId) : [...(current[userId] || []), roleId] }));
  };

  const getPresenceStatus = (userId) => {
    if (presenceVisibility[userId] === false) return 'offline';
    const presence = statuses[userId];
    if (!presence || clock - new Date(presence.updatedAt).getTime() > 100_000) return 'offline';
    return ['online', 'idle', 'dnd'].includes(presence.status) ? presence.status : 'offline';
  };
  const filteredMembers = useMemo(() => members.filter((member) => {
    const online = getPresenceStatus(member.user_id) !== 'offline';
    return memberStatusFilter === 'all' || (memberStatusFilter === 'online' ? online : !online);
  // Presence refreshes are driven by the store and the local staleness clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [members, memberStatusFilter, statuses, presenceVisibility, clock]);

  const toggleMemberSelection = (userId) => {
    if (selectedMemberIds.includes(userId)) {
      setSelectedMemberIds((current) => current.filter((id) => id !== userId));
      return;
    }
    if (selectedMemberIds.length >= 100) { onNotice?.('Toplu işlemde en fazla 100 üye seçebilirsin.'); return; }
    setSelectedMemberIds((current) => [...current, userId]);
  };

  const selectFilteredMembers = () => {
    const allSelected = filteredMembers.length > 0 && filteredMembers.every((member) => selectedMemberIds.includes(member.user_id));
    setSelectedMemberIds((current) => {
      if (allSelected) return current.filter((id) => !filteredMembers.some((member) => member.user_id === id));
      const next = [...new Set([...current, ...filteredMembers.map((member) => member.user_id)])];
      if (next.length > 100) onNotice?.('Toplu işlemde en fazla 100 üye seçebilirsin.');
      return next.slice(0, 100);
    });
  };

  const applyBulkRole = async () => {
    if (!bulkRoleId || !selectedMemberIds.length || isApplyingBulk) return;
    setIsApplyingBulk(true);
    const { error } = await supabase.rpc('set_server_role_for_members', {
      server_uuid: serverId,
      target_users: selectedMemberIds,
      role_uuid: bulkRoleId,
      should_assign: bulkMode === 'assign',
    });
    setIsApplyingBulk(false);
    if (error) { onNotice?.(error.message); return; }
    const roleId = bulkRoleId;
    setAssignments((current) => {
      const next = { ...current };
      selectedMemberIds.forEach((userId) => {
        const currentRoles = next[userId] || [];
        next[userId] = bulkMode === 'assign'
          ? (currentRoles.includes(roleId) ? currentRoles : [...currentRoles, roleId])
          : currentRoles.filter((id) => id !== roleId);
      });
      return next;
    });
    onNotice?.(`${selectedMemberIds.length} üyede rol ${bulkMode === 'assign' ? 'atandı' : 'kaldırıldı'}.`);
    setSelectedMemberIds([]);
  };

  return <div className="grid gap-5 xl:grid-cols-[minmax(280px,.8fr)_minmax(360px,1.2fr)]">
    <section className="rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><Shield className="h-5 w-5" /></span><div><h3 className="text-sm font-bold text-white">Sunucu rolleri</h3><p className="mt-0.5 text-[10px] text-slate-500">İzinleri tanımla, üyelerine ata.</p></div></div>
      <div className="mb-3 flex flex-wrap gap-1.5">{ROLE_TEMPLATES.map(template => <button key={template.key} type="button" onClick={() => applyTemplate(template)} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:border-violet-200/20 hover:bg-violet-200/[0.08] hover:text-white">+ {template.name}</button>)}</div>
      <form onSubmit={saveRole} className="mb-4 rounded-2xl border border-white/[0.07] bg-black/15 p-3">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Rol adı<input value={roleName} onChange={(event) => setRoleName(event.target.value)} maxLength={64} placeholder="Örn. Moderatör" className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0b0f16] px-3 py-2.5 text-sm font-medium normal-case text-white outline-none placeholder:text-slate-600 focus:border-violet-300/35" /></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rol rengi<div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#0b0f16] px-2.5 py-2"><input type="color" value={roleColor} onChange={(event) => setRoleColor(event.target.value)} aria-label="Rol rengi" className="h-7 w-8 cursor-pointer rounded-md border-0 bg-transparent p-0" /><span className="font-mono text-[10px] text-slate-400">{roleColor.toUpperCase()}</span></div></label>
          <div className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rol emojisi<div className="mt-1.5 flex min-h-12 items-center gap-2 rounded-xl border border-white/[0.07] bg-[#0b0f16] px-2.5 py-2"><input ref={emojiInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" aria-label="Özel rol emojisi dosyası" onChange={(event) => { selectRoleEmoji(event.target.files?.[0]); event.target.value = ''; }} /><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.04]">{emojiLocalPreview ? <img src={emojiLocalPreview} alt="Rol emojisi önizlemesi" className="h-full w-full object-contain" /> : roleEmoji ? <RoleEmoji value={roleEmoji} className="h-5 w-5 text-xl" alt="Mevcut rol emojisi" /> : <ImagePlus className="h-4 w-4 text-slate-500" />}</span><button type="button" onClick={() => emojiInputRef.current?.click()} disabled={isSaving} className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-xs font-semibold normal-case text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50"><span className="block truncate">{emojiFile?.name || (roleEmoji ? 'Rol emojisini değiştir' : 'Görsel seç')}</span><span className="mt-0.5 block text-[9px] font-normal text-slate-500">PNG · JPG · WebP · GIF</span></button>{(emojiFile || roleEmoji) && <button type="button" onClick={clearRoleEmoji} disabled={isSaving} aria-label="Rol emojisini kaldır" title="Rol emojisini kaldır" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-300/10 hover:text-rose-200 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>}</div>{emojiUploadProgress !== null && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width]" style={{ width: `${emojiUploadProgress}%` }} /></div>}{emojiError && <p role="alert" className="mt-1.5 text-[9px] font-normal normal-case text-rose-300">{emojiError}</p>}<p className="mt-1 text-[9px] font-normal normal-case text-slate-600">Sabit görseller 128 px WebP’ye küçültülür; GIF animasyonu korunur (en fazla 1 MB).</p></div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-300">İkinci renk</p><p className="mt-0.5 text-[9px] text-slate-500">Rol adına yumuşak renk geçişi uygula.</p></div><button type="button" role="switch" aria-checked={gradientEnabled} aria-label="Rol gradyanını aç" onClick={() => setGradientEnabled((current) => !current)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${gradientEnabled ? 'bg-violet-500' : 'bg-slate-700'}`}><span className={`absolute left-1 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${gradientEnabled ? 'translate-x-4' : 'translate-x-0'}`} /></button>{gradientEnabled && <input type="color" value={gradientColor} onChange={(event) => setGradientColor(event.target.value)} aria-label="Rol gradyan ikinci rengi" className="h-8 w-9 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1" />}</div>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-300">Hafif animasyon</p><p className="mt-0.5 text-[9px] text-slate-500">Rol adı üzerinde yavaş ve düşük dikkat dağıtan bir parlama.</p></div><button type="button" role="switch" aria-checked={animatedRole} aria-label="Animasyonlu rol" onClick={() => setAnimatedRole((current) => !current)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${animatedRole ? 'bg-violet-500' : 'bg-slate-700'}`}><span className={`absolute left-1 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${animatedRole ? 'translate-x-4' : 'translate-x-0'}`} /></button></div>
        {roleName && <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/15 px-3 py-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.035]">{emojiLocalPreview ? <img src={emojiLocalPreview} alt="" className="h-5 w-5 object-contain" /> : <RoleEmoji value={roleEmoji} className="h-5 w-5 text-xl" />}</span><span className={`text-sm font-bold ${animatedRole ? 'role-name-animated' : ''}`} style={gradientEnabled ? { backgroundImage: `linear-gradient(100deg, ${roleColor}, ${gradientColor}, ${roleColor})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: roleColor }}>{roleName}</span><span className="ml-auto text-[9px] uppercase tracking-wider text-slate-600">Rol ön izlemesi</span></div>}
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"><span className="text-xs font-medium text-slate-300">Üyeler bu rolü etiketleyebilsin</span><button type="button" role="switch" aria-checked={mentionable} aria-label="Üyeler bu rolü etiketleyebilsin" onClick={() => setMentionable((current) => !current)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${mentionable ? 'bg-violet-500' : 'bg-slate-700'}`}><span className={`absolute left-1 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${mentionable ? 'translate-x-4' : 'translate-x-0'}`} /></button></div>
        {templateNotice && <p className="mt-3 text-[10px] text-cyan-200">{templateNotice}</p>}
        <div className="mt-3 space-y-3">{PERMISSION_GROUPS.map(group => <fieldset key={group.name} className="rounded-xl border border-white/[0.06] p-2"><legend className="px-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">{group.name}</legend><div className="space-y-0.5">{group.permissions.map((permission) => { const permissionValue = permissions[permission.id] === true ? 'allow' : permissions[permission.id] === false ? 'deny' : 'inherit'; return <div key={permission.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.035]"><span className="min-w-0 flex-1 text-xs font-semibold text-slate-200">{permission.label}</span><AnimatedSelect ariaLabel={`${permission.label} rol izni`} value={permissionValue} onValueChange={value => setPermission(permission.id, value)} options={[{ value: 'inherit', label: 'Varsayılan' }, { value: 'allow', label: 'İzin ver' }, { value: 'deny', label: 'Engelle' }]} className="w-32" /></div>; })}</div></fieldset>)}</div>
        <div className="mt-3 flex gap-2"><button disabled={!roleName.trim() || isSaving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-40">{isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingRoleId ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{editingRoleId ? 'Rolü kaydet' : 'Rol oluştur'}</button>{editingRoleId && <button type="button" onClick={clearForm} aria-label="Rol düzenlemesini iptal et" className="rounded-xl border border-white/10 px-3 text-slate-400 hover:bg-white/5"><X className="h-4 w-4" /></button>}</div>
      </form>
    </section>
    <section className="rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-white">Roller</h3><p className="mt-1 text-[10px] text-slate-500">Tut, sürükle ve istediğin sıraya bırak.</p></div><span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[9px] font-semibold text-slate-400">{roles.length} rol</span></div>
      <div className="mb-4 max-h-64 space-y-1.5 overflow-y-auto pr-1">{isLoading ? <div className="h-10 animate-pulse rounded-xl bg-white/[0.05]" /> : roles.length ? roles.map((role) => <article key={role.id} onDragOver={(event) => { event.preventDefault(); setDragOverRoleId(role.id); }} onDrop={(event) => { event.preventDefault(); dropRoleOn(role.id); }} className={`flex items-center gap-1.5 rounded-xl border p-2 transition ${dragOverRoleId === role.id ? 'border-violet-300/45 bg-violet-300/[0.09]' : editingRoleId === role.id ? 'border-violet-300/25 bg-violet-300/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'} ${draggedRoleId === role.id ? 'scale-[.98] opacity-40' : ''}`}>
        <span draggable={!isReordering} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', role.id); setDraggedRoleId(role.id); }} onDragEnd={() => { setDraggedRoleId(null); setDragOverRoleId(null); }} title="Sıralamak için sürükle" aria-label={`${role.name} rolünü sürükleyerek sırala`} className="cursor-grab touch-none rounded-lg p-1 text-slate-500 transition hover:bg-white/[0.07] hover:text-violet-100 active:cursor-grabbing"><GripVertical className="h-4 w-4" /></span>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-white/[0.06] bg-black/15 text-xs">{role.emoji ? <RoleEmoji value={role.emoji} className="h-4 w-4 text-base" /> : <span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} />}</span><span className={`min-w-0 flex-1 truncate text-xs font-semibold ${role.animated ? 'role-name-animated' : ''}`} style={role.gradient_color ? { backgroundImage: `linear-gradient(100deg, ${role.color}, ${role.gradient_color}, ${role.color})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: role.color }}>{role.name}<span className="ml-2 font-mono text-[9px] font-normal text-slate-600">ID {role.public_id ?? '—'}</span></span>
        <button type="button" onClick={() => void copyRoleId(role)} title="Rol kimliğini kopyala" aria-label={`${role.name} rol kimliğini kopyala`} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white"><Copy className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void copyRoleMention(role)} title="Rol etiketini kopyala" aria-label={`${role.name} rol etiketini kopyala`} className="rounded-lg p-1.5 text-slate-500 hover:bg-violet-300/10 hover:text-violet-100"><AtSign className="h-3.5 w-3.5" /></button><button type="button" onClick={() => editRole(role)} className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white">Düzenle</button><button type="button" onClick={() => void removeRole(role.id)} aria-label={`${role.name} rolünü sil`} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-400/10 hover:text-rose-200"><Trash2 className="h-3.5 w-3.5" /></button>
      </article>) : <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs text-slate-500">Henüz özel rol yok.</p>}</div>
      <div className="border-t border-white/[0.07] pt-4">
        <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/[0.08] text-cyan-100"><UsersRound className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-white">Üyelere rol ata</h3><p className="mt-1 text-[10px] text-slate-500">Tekli veya toplu seçim yap; üst rol sınırları korunur.</p></div></div>
        <div className="my-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.06] bg-black/10 p-1.5"><span className="px-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">Durum</span>{[{ id: 'all', label: 'Tümü' }, { id: 'online', label: 'Çevrim içi' }, { id: 'offline', label: 'Çevrim dışı' }].map((filter) => <button key={filter.id} type="button" aria-pressed={memberStatusFilter === filter.id} onClick={() => setMemberStatusFilter(filter.id)} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-semibold transition ${memberStatusFilter === filter.id ? 'bg-violet-300/[0.14] text-violet-100' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200'}`}>{filter.label}</button>)}</div>
        <div className="mb-2 flex flex-wrap items-center gap-2"><button type="button" onClick={selectFilteredMembers} className="text-[10px] font-semibold text-violet-200 hover:text-white">{filteredMembers.length && filteredMembers.every((member) => selectedMemberIds.includes(member.user_id)) ? 'Seçimi kaldır' : 'Görünenleri seç'}</button><span className="text-[9px] text-slate-600">{selectedMemberIds.length} seçili</span><div className="ml-auto flex items-center gap-1.5"><AnimatedSelect value={bulkMode} onValueChange={setBulkMode} ariaLabel="Toplu rol işlemi" options={[{ value: 'assign', label: 'Rol ver' }, { value: 'remove', label: 'Rolü al' }]} className="w-24 min-h-8 px-2 py-1 text-[10px]" /><AnimatedSelect value={bulkRoleId} onValueChange={setBulkRoleId} ariaLabel="Toplu atanacak rol" placeholder="Rol seç" options={roles.map((role) => ({ value: role.id, label: role.name }))} className="w-32 min-h-8 px-2 py-1 text-[10px]" /><button type="button" disabled={!selectedMemberIds.length || !bulkRoleId || isApplyingBulk} onClick={() => void applyBulkRole()} className="rounded-lg bg-violet-400/15 px-2.5 py-2 text-[9px] font-bold text-violet-100 transition hover:bg-violet-400/25 disabled:cursor-not-allowed disabled:opacity-40">{isApplyingBulk ? 'Uygula…' : 'Uygula'}</button></div></div>
        <div className="max-h-[38vh] space-y-1 overflow-y-auto pr-1">{filteredMembers.map((member) => { const selectedForBulk = selectedMemberIds.includes(member.user_id); const presence = getPresenceStatus(member.user_id); return <article key={member.user_id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${selectedForBulk ? 'border-violet-200/20 bg-violet-300/[0.045]' : 'border-white/[0.05] bg-black/10'}`}>
          <button type="button" role="checkbox" aria-checked={selectedForBulk} aria-label={`${member.profiles?.username || 'Üye'} seç`} onClick={() => toggleMemberSelection(member.user_id)} className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${selectedForBulk ? 'border-violet-200/40 bg-violet-400 text-white' : 'border-slate-600 bg-black/20 text-transparent hover:border-slate-400'}`}>{selectedForBulk && <Check className="h-3 w-3" />}</button>
          <span className={`h-2 w-2 shrink-0 rounded-full ${presence === 'offline' ? 'bg-slate-600' : presence === 'dnd' ? 'bg-rose-400' : presence === 'idle' ? 'bg-amber-300' : 'bg-emerald-400'}`} title={presence === 'offline' ? 'Çevrim dışı' : presence === 'dnd' ? 'Rahatsız etmeyin' : presence === 'idle' ? 'Boşta' : 'Çevrim içi'} />
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">{member.profiles?.username || 'Fastlynox kullanıcısı'}</p><p className="mt-0.5 text-[9px] text-slate-500">{member.role === 'owner' ? 'Sunucu sahibi' : member.role === 'admin' ? 'Yönetici' : 'Üye'}</p></div>
          <div className="flex max-w-[62%] flex-wrap justify-end gap-1">{roles.map((role) => { const selected = Boolean(assignments[member.user_id]?.includes(role.id)); return <button key={role.id} type="button" aria-pressed={selected} title={`${role.name} rolünü ${selected ? 'kaldır' : 'ata'}`} onClick={() => void toggleAssignment(member.user_id, role.id)} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold transition ${selected ? 'shadow-[inset_0_0_0_1px_rgba(255,255,255,.025)]' : 'opacity-55 hover:opacity-100'}`} style={{ color: role.gradient_color || role.color, borderColor: selected ? `${role.color}66` : 'rgba(255,255,255,.08)', backgroundColor: selected ? `${role.color}18` : 'transparent' }}><span className="grid h-3 w-3 place-items-center">{selected && <Check className="h-2.5 w-2.5" />}</span>{role.emoji && <RoleEmoji value={role.emoji} className="h-3 w-3" />}{role.name}</button>; })}</div>
        </article>; })}{!filteredMembers.length && <p className="py-8 text-center text-xs text-slate-500">Bu filtrede gösterilecek üye yok.</p>}</div>
      </div>
    </section>
  </div>;
}
