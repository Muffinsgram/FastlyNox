import { useCallback, useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Radio, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { AnimatedSelect } from '../../../components/ui/AnimatedSelect';

const CHANNEL_PERMISSIONS = [
  { id: 'view_channel', label: 'Kanalı görüntüle', hint: 'Kanalı ve mesaj geçmişini görebilir.' },
  { id: 'send_messages', label: 'Mesaj gönder', hint: 'Mesaj ve yanıt gönderebilir.' },
  { id: 'attach_files', label: 'Dosya ekle', hint: 'Resim, video ve dosya paylaşabilir.' },
  { id: 'add_reactions', label: 'Tepki ekle', hint: 'Mesajlara tepki bırakabilir.' },
  { id: 'connect', label: 'Ses odasına bağlan', hint: 'Ses kanalına katılabilir.' },
  { id: 'speak', label: 'Konuş', hint: 'Ses kanalında mikrofonunu kullanabilir.' },
  { id: 'manage_messages', label: 'Mesajları yönet', hint: 'Bu kanaldaki üyelerin mesajlarını silebilir.' },
];

export function ChannelPermissionsPanel({ serverId, onNotice }) {
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPermission, setSavingPermission] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: channelRows, error: channelError } = await supabase.from('channels').select('id,name,type,category_id').eq('server_id', serverId).order('name');
    const channelIds = (channelRows || []).map(channel => channel.id);
    const [{ data: roleRows, error: roleError }, { data: overrideRows, error: overrideError }] = await Promise.all([
      supabase.from('server_roles').select('id,name,color').eq('server_id', serverId).order('position', { ascending: false }),
      channelIds.length ? supabase.from('channel_permission_overrides').select('*').in('channel_id', channelIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (channelError || roleError || overrideError) onNotice?.('Kanal izinleri okunamadı. migration_server_roles_permissions.sql ve migration_server_operations.sql dosyalarını çalıştır.');
    const nextChannels = channelRows || [];
    const nextRoles = roleRows || [];
    setChannels(nextChannels);
    setRoles(nextRoles);
    setOverrides(overrideRows || []);
    setSelectedChannelId(current => nextChannels.some(channel => channel.id === current) ? current : nextChannels[0]?.id || '');
    setSelectedRoleId(current => nextRoles.some(role => role.id === current) ? current : nextRoles[0]?.id || '');
    setLoading(false);
  }, [serverId, onNotice]);

  useEffect(() => { void refresh(); }, [refresh]);

  const currentOverride = useMemo(() => overrides.find(row => row.channel_id === selectedChannelId && row.role_id === selectedRoleId), [overrides, selectedChannelId, selectedRoleId]);
  const channelOptions = channels.map(channel => ({ value: channel.id, label: `${channel.type === 'voice' ? '◖' : '#'} ${channel.name}` }));
  const roleOptions = roles.map(role => ({ value: role.id, label: role.name }));

  const getValue = permission => currentOverride?.allow_permissions?.includes(permission.id)
    ? 'allow'
    : currentOverride?.deny_permissions?.includes(permission.id) ? 'deny' : 'inherit';

  const savePermission = async (permissionId, value) => {
    if (!selectedChannelId || !selectedRoleId) return;
    setSavingPermission(permissionId);
    const currentAllow = currentOverride?.allow_permissions || [];
    const currentDeny = currentOverride?.deny_permissions || [];
    const allow = new Set(currentAllow.filter(id => id !== permissionId));
    const deny = new Set(currentDeny.filter(id => id !== permissionId));
    if (value === 'allow') allow.add(permissionId);
    if (value === 'deny') deny.add(permissionId);
    let error;
    if (!allow.size && !deny.size) {
      if (currentOverride?.id) ({ error } = await supabase.from('channel_permission_overrides').delete().eq('id', currentOverride.id));
    } else if (currentOverride?.id) {
      ({ error } = await supabase.from('channel_permission_overrides').update({ allow_permissions: [...allow], deny_permissions: [...deny] }).eq('id', currentOverride.id));
    } else {
      ({ error } = await supabase.from('channel_permission_overrides').insert({ channel_id: selectedChannelId, role_id: selectedRoleId, allow_permissions: [...allow], deny_permissions: [...deny] }));
    }
    setSavingPermission('');
    if (error) onNotice?.(error.message.includes('row-level security') ? 'Kanal izinlerini düzenlemek için kanalları yönet yetkisi gerekli.' : error.message);
    else {
      onNotice?.('Kanal izni kaydedildi.');
      void refresh();
    }
  };

  return <section className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.025]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><LockKeyhole className="h-5 w-5" /></span><div><h3 className="text-sm font-bold text-white">Kanal izin matrisi</h3><p className="mt-0.5 text-[10px] text-slate-500">Rol bazında izin ver, engelle veya sunucu varsayılanını kullan.</p></div></div><button type="button" onClick={() => void refresh()} aria-label="Kanal izinlerini yenile" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-400 hover:bg-white/[0.06] hover:text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></header>
    {!roles.length || !channels.length ? <div className="p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-7 w-7 text-slate-500" /><p className="text-sm font-semibold text-slate-200">{!roles.length ? 'Önce bir rol oluştur' : 'Düzenlenecek kanal bulunamadı'}</p><p className="mt-1 text-xs text-slate-500">Roller ve kanallar hazır olduğunda izin matrisi burada açılır.</p></div> : <>
      <div className="grid gap-3 border-b border-white/[0.07] p-4 sm:grid-cols-2"><label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kanal<AnimatedSelect ariaLabel="Kanal seç" value={selectedChannelId} onValueChange={setSelectedChannelId} options={channelOptions} className="mt-1.5 w-full normal-case" /></label><label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Rol<AnimatedSelect ariaLabel="Rol seç" value={selectedRoleId} onValueChange={setSelectedRoleId} options={roleOptions} className="mt-1.5 w-full normal-case" /></label></div>
      <div className="divide-y divide-white/[0.05]">{CHANNEL_PERMISSIONS.map(permission => <div key={permission.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${permission.id === 'connect' || permission.id === 'speak' ? 'bg-cyan-300/[0.08] text-cyan-200' : 'bg-white/[0.04] text-slate-300'}`}>{permission.id === 'connect' || permission.id === 'speak' ? <Radio className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-200">{permission.label}</span><span className="mt-0.5 block text-[10px] text-slate-500">{permission.hint}</span></span><AnimatedSelect ariaLabel={`${permission.label} izni`} value={getValue(permission)} disabled={savingPermission !== ''} onValueChange={value => void savePermission(permission.id, value)} options={[{ value: 'inherit', label: 'Varsayılan' }, { value: 'allow', label: 'İzin ver' }, { value: 'deny', label: 'Engelle' }]} className="w-32" /></div>)}</div>
      <p className="border-t border-white/[0.06] px-4 py-3 text-[10px] leading-4 text-slate-500">Kanal kuralı rolün genel iznini geçersiz kılar. Üyede birden çok rol varsa kanal erişimi mevcut rol çözümleme kurallarına göre değerlendirilir.</p>
    </>}
  </section>;
}
