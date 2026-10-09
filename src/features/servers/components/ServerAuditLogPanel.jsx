import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, ShieldAlert } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { fetchProfiles, getAvatarUrl } from '../../../lib/profileMedia';

const ACTION_LABELS = {
  'channels.insert': 'kanal oluşturdu', 'channels.update': 'kanalı düzenledi', 'channels.delete': 'kanalı sildi',
  'categories.insert': 'kategori oluşturdu', 'categories.update': 'kategoriyi düzenledi', 'categories.delete': 'kategoriyi sildi',
  'server_roles.insert': 'rol oluşturdu', 'server_roles.update': 'rol izinlerini düzenledi', 'server_roles.delete': 'rolü sildi',
  'server_member_roles.insert': 'üyeye rol verdi', 'server_member_roles.delete': 'üyeden rol aldı',
  'server_members.insert': 'üyeyi sunucuya ekledi', 'server_members.update': 'üyenin sunucu rolünü değiştirdi', 'server_members.delete': 'üyeyi sunucudan çıkardı',
  'server_voice_moderation.insert': 'ses moderasyonu uyguladı', 'server_voice_moderation.update': 'ses moderasyonunu değiştirdi',
  'server_invites.insert': 'yeni bir davet oluşturdu', 'server_invites.update': 'davet bağlantısını değiştirdi', 'server_invites.delete': 'davet bağlantısını sildi',
  'servers.update': 'sunucu profilini güncelledi',
};

function getEntityLabel(row) {
  const data = row.details?.after && Object.keys(row.details.after).length ? row.details.after : row.details?.before || {};
  return data.name || data.username || data.code || (data.server_muted ? 'Sunucu susturması' : data.server_deafened ? 'Sunucu sağırlaştırması' : row.entity_type.replaceAll('_', ' '));
}

export function ServerAuditLogPanel({ serverId, onNotice }) {
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('server_audit_log').select('*').eq('server_id', serverId).order('created_at', { ascending: false }).limit(100);
    if (error) onNotice?.('İşlem kaydı okunamadı. migration_server_operations.sql dosyasını çalıştır ve view_audit_log iznini kontrol et.');
    const nextRows = data || [];
    setRows(nextRows);
    const userIds = [...new Set(nextRows.map(row => row.actor_id).filter(Boolean))];
    if (userIds.length) {
      const foundProfiles = await fetchProfiles(userIds);
      setProfiles(Object.fromEntries((foundProfiles || []).map(profile => [profile.id, profile])));
    } else setProfiles({});
    setLoading(false);
  }, [serverId, onNotice]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.025]">
    <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Activity className="h-5 w-5" /></span><div><h3 className="text-sm font-bold text-white">Sunucu işlem kaydı</h3><p className="mt-0.5 text-[10px] text-slate-500">Son 100 rol, üye, kategori ve kanal hareketi.</p></div></div><button type="button" onClick={() => void refresh()} aria-label="İşlem kaydını yenile" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-400 hover:bg-white/[0.06] hover:text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></header>
    <div className="max-h-[min(68vh,720px)] divide-y divide-white/[0.05] overflow-y-auto">{loading && !rows.length ? <div className="space-y-2 p-4">{[0, 1, 2].map(index => <div key={index} className="h-14 animate-pulse rounded-xl bg-white/[0.04]" />)}</div> : rows.length ? rows.map(row => {
      const profile = profiles[row.actor_id];
      return <article key={row.id} className="flex items-center gap-3 px-4 py-3"><img src={getAvatarUrl(profile?.avatar_url, profile?.username || 'Fastlynox')} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white/10 object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-xs text-slate-200"><strong className="font-semibold text-white">{profile?.username || 'Bir kullanıcı'}</strong> {ACTION_LABELS[row.action] || 'sunucu ayarını güncelledi'} <strong className="font-semibold text-violet-200">{getEntityLabel(row)}</strong></span><time className="mt-1 block text-[10px] text-slate-500" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</time></span><span title={row.action} className="hidden rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1 font-mono text-[9px] text-slate-500 sm:inline">{row.action}</span></article>;
    }) : <div className="p-10 text-center"><ShieldAlert className="mx-auto mb-3 h-7 w-7 text-slate-500" /><p className="text-sm font-semibold text-slate-200">Henüz işlem kaydı yok</p><p className="mt-1 text-xs text-slate-500">Sunucudaki yönetim hareketleri burada listelenecek.</p></div>}</div>
    <p className="border-t border-white/[0.06] px-4 py-3 text-[10px] leading-4 text-slate-500">Kayıtlar veritabanında oluşturulur ve istemciden değiştirilemez.</p>
  </section>;
}
