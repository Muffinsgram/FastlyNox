import { useEffect, useMemo, useState } from 'react';
import { AtSign, Hash, Shield } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getAvatarUrl } from '../../../lib/profileMedia';

const parseQuery = (value) => {
  const match = value.match(/(?:^|\s)(<@&|<@!?|<#|@|#)([\p{L}\p{N}_.-]{0,64})$/u);
  if (!match) return null;
  const prefix = match[1];
  return {
    kind: prefix === '<@&' ? 'role' : prefix === '#' || prefix === '<#' ? 'channel' : 'user',
    text: match[2] || '',
    start: value.length - prefix.length - match[2].length,
  };
};

export function MentionSuggestions({ value, allowedUserIds = [], allowEveryone = false, allowAllRoles = false, roles = [], channels = [], onSelect }) {
  const [userMatches, setUserMatches] = useState({ key: '', items: [] });
  const query = useMemo(() => parseQuery(value), [value]);

  useEffect(() => {
    if (!query || query.kind !== 'user') return undefined;
    let active = true;
    const key = `${query.kind}:${query.text}`;
    const timer = window.setTimeout(async () => {
      if (!allowedUserIds.length) return;
      let request = supabase.from('profiles').select('id,public_id,username,avatar_url').in('id', allowedUserIds).order('username').limit(8);
      if (query.text) request = request.ilike('username', `${query.text}%`);
      const { data } = await request;
      if (active) setUserMatches({ key, items: (data || []).map((profile) => ({ ...profile, kind: 'user', token: `<@${profile.public_id}>`, label: profile.username })) });
    }, 100);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, allowedUserIds]);

  const key = query ? `${query.kind}:${query.text}` : '';
  const matches = query?.kind === 'user'
    ? (userMatches.key === key ? userMatches.items : [])
    : query
      ? (query.kind === 'role' ? roles.filter((role) => allowAllRoles || role.mentionable) : channels)
        .filter((item) => item.name?.toLowerCase().includes(query.text.toLowerCase())).slice(0, 8)
        .map((item) => ({ ...item, kind: query.kind, token: query.kind === 'role' ? `<@&${item.public_id ?? item.id}>` : `<#${item.public_id ?? item.id}>`, label: item.name }))
      : [];
  const showEveryone = query?.kind === 'user' && allowEveryone && 'everyone'.startsWith(query.text.toLowerCase());
  const showHere = query?.kind === 'user' && allowEveryone && 'here'.startsWith(query.text.toLowerCase());
  if (!query || (!matches.length && !showEveryone && !showHere)) return null;

  return <div className="absolute bottom-full left-2 z-40 mb-2 max-h-72 w-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#131925]/95 p-1.5 shadow-2xl backdrop-blur-2xl">
    <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{query.kind === 'role' ? 'Rolü etiketle' : query.kind === 'channel' ? 'Kanala bağlantı ekle' : 'Etiketlenecek kişi'}</div>
    {showEveryone && <button type="button" data-mention-first={matches.length === 0 ? 'true' : undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect('@everyone', query.start)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-amber-100 hover:bg-amber-300/10 focus:bg-amber-300/10 focus:outline-none"><span className="grid h-7 w-7 place-items-center rounded-full bg-amber-300/15 text-xs font-black text-amber-200">@</span><span className="min-w-0 flex-1">everyone <span className="block text-[10px] text-slate-500">Sunucudaki herkesi etiketle</span></span></button>}
    {showHere && <button type="button" data-mention-first={!showEveryone && matches.length === 0 ? 'true' : undefined} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect('@here', query.start)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-amber-100 hover:bg-amber-300/10 focus:bg-amber-300/10 focus:outline-none"><span className="grid h-7 w-7 place-items-center rounded-full bg-amber-300/15 text-xs font-black text-amber-200">@</span><span className="min-w-0 flex-1">here <span className="block text-[10px] text-slate-500">Çevrim içi üyeleri etiketle</span></span></button>}
    {matches.map((item, index) => <button key={`${item.kind}:${item.id}`} data-mention-first={index === 0 && !showEveryone ? 'true' : undefined} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(item.token, query.start)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-slate-200 transition hover:bg-violet-400/15 focus:bg-violet-400/15 focus:outline-none">
      {item.kind === 'user' ? <img src={getAvatarUrl(item.avatar_url, item.username)} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.06] text-slate-400">{item.kind === 'role' ? <Shield className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}</span>}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>{item.kind === 'user' ? <AtSign className="h-3.5 w-3.5 text-violet-300" /> : item.kind === 'channel' ? <span className="text-[9px] text-slate-500">kanal</span> : <span className="text-[9px] text-slate-500">rol</span>}
    </button>)}
  </div>;
}
