import { Fragment, useEffect, useState } from 'react';
import { ArrowUpRight, Check, Hash, LoaderCircle, Sparkles, Users, Volume2 } from 'lucide-react';
import { fetchPublicProfile, getAvatarUrl, getBannerUrl } from '../../../lib/profileMedia';
import { supabase } from '../../../lib/supabase';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ENTITY_ID = `(?:${UUID}|[0-9]+)`;
const PROFILE_LINK = String.raw`(?:https?://)?(?:www\.)?fastlynox(?:\.[a-z0-9-]+)*/user/[0-9]+`;
const INVITE_LINK = String.raw`(?:https?://)?(?:www\.)?fastlynox(?:\.[a-z0-9-]+)*/invite/[a-z0-9_-]{3,32}`;
const INLINE = new RegExp(`(${PROFILE_LINK}|${INVITE_LINK}|<@&${ENTITY_ID}>|<@!?${ENTITY_ID}>|<#${ENTITY_ID}>|@everyone|@[\\p{L}\\p{N}_.-]+|\\*\\*[^\\n*]+\\*\\*|__[^\\n_]+__|~~[^\\n~]+~~|\\*[^\\n*]+\\*|_[^\\n_]+_|\\x60[^\\n\\x60]+\\x60)`, 'giu');

function PublicProfileLinkCard({ publicId, onOpen }) {
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchPublicProfile(publicId).then((result) => {
      if (!active) return;
      setProfile(result);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [publicId]);

  return <button type="button" onClick={() => profile && onOpen?.(profile)} disabled={!profile} title={profile ? `${profile.username} · profili görüntüle` : `Fastlynox profil bağlantısı · #${publicId}`} className="group my-2 block w-full max-w-[390px] overflow-hidden rounded-[18px] border border-violet-200/15 bg-[#111521] text-left align-middle shadow-[0_12px_34px_rgba(0,0,0,.24)] transition duration-200 hover:-translate-y-0.5 hover:border-violet-200/35 hover:shadow-[0_18px_42px_rgba(67,56,202,.18)] disabled:cursor-default">
    <span className="relative block h-[66px] overflow-hidden bg-[radial-gradient(ellipse_at_20%_10%,rgba(167,139,250,.55),transparent_45%),linear-gradient(110deg,#282344,#131b2a_60%,#0f1923)]">{getBannerUrl(profile?.banner_url) && <img src={getBannerUrl(profile.banner_url)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60"/>}<span className="absolute inset-0 bg-gradient-to-r from-[#171624]/25 via-transparent to-cyan-300/10"/><span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl border border-white/15 bg-black/20 text-violet-100 backdrop-blur"><Sparkles className="h-4 w-4"/></span></span>
    <span className="relative flex items-center gap-3 px-3.5 pb-3 pt-0"><span className="-mt-6 grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[15px] border-[3px] border-[#111521] bg-[#20243a] text-violet-100 shadow-lg">{profile ? <img src={getAvatarUrl(profile.avatar_url, profile.username)} alt="" className="h-full w-full object-cover"/> : loaded ? <span className="text-xs font-bold">FN</span> : <LoaderCircle className="h-4 w-4 animate-spin"/>}</span><span className="min-w-0 flex-1 pb-0.5"><span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-sm font-extrabold text-white">{profile?.username || (loaded ? 'Profil bulunamadı' : 'Fastlynox profili')}</span></span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{profile?.status_text || profile?.bio || (profile ? 'Kullanıcı profili' : `fastlynox/user/${publicId}`)}</span></span><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 transition group-hover:border-violet-200/20 group-hover:bg-violet-300/10 group-hover:text-white"><ArrowUpRight className="h-4 w-4"/></span></span>
    <span className="flex items-center gap-1.5 border-t border-white/[0.06] px-3.5 py-2 text-[9px] font-semibold tracking-wide text-violet-200/75"><span className="h-1.5 w-1.5 rounded-full bg-violet-300"/>{profile ? `FASTLYNOX · #${profile.public_id || publicId}` : `fastlynox/user/${publicId}`}</span>
  </button>;
}

function ServerInviteLinkCard({ inviteCode, onOpen }) {
  const [server, setServer] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc('get_server_invite_preview', { invite_code: inviteCode }).then(({ data, error }) => {
      if (!active) return;
      const result = Array.isArray(data) ? data[0] : data;
      if (!error) setServer(result || null);
      setLoaded(true);
    }).catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [inviteCode]);

  const open = () => {
    if (onOpen) onOpen(inviteCode);
    else window.location.assign(`/invite/${encodeURIComponent(inviteCode)}`);
  };
  const icon = typeof server?.server_icon_url === 'string' && /^https?:\/\//iu.test(server.server_icon_url) ? server.server_icon_url : '';
  return <button type="button" onClick={open} className="group my-2 block w-full max-w-[430px] overflow-hidden rounded-[20px] border border-emerald-200/15 bg-[#101721] text-left align-middle shadow-[0_14px_40px_rgba(0,0,0,.28)] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200/30 hover:shadow-[0_20px_50px_rgba(16,185,129,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50">
    <span className="relative flex h-[88px] items-center gap-3 overflow-hidden bg-[radial-gradient(ellipse_at_86%_0%,rgba(16,185,129,.2),transparent_50%),linear-gradient(112deg,#20223a,#12201f_72%,#0f171d)] px-4">
      {icon && <img src={icon} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-[.13] blur-xl"/>}
      <span className="absolute inset-0 bg-gradient-to-r from-[#151927]/30 via-transparent to-emerald-300/[0.04]"/>
      <span className="relative grid h-[54px] w-[54px] shrink-0 place-items-center overflow-hidden rounded-[17px] border border-white/15 bg-[#20283a] text-xl font-black text-emerald-100 shadow-lg">{icon ? <img src={icon} alt="" className="h-full w-full object-cover"/> : server?.server_name?.slice(0, 1) || <Users className="h-6 w-6"/>}</span>
      <span className="relative min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.18em] text-emerald-200/80">Fastlynox daveti{server?.is_vanity && <Check className="h-3 w-3"/>}</span><span className="mt-1 block truncate text-[15px] font-extrabold text-white">{server?.server_name || (loaded ? 'Sunucu daveti' : 'Sunucu bilgileri yükleniyor…')}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{server ? 'Topluluğa katılmak için daveti görüntüle' : 'Davet bağlantısını aç ve sunucuya katıl'}</span></span>
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.05] text-slate-200 transition group-hover:border-emerald-200/25 group-hover:bg-emerald-300/10 group-hover:text-white"><ArrowUpRight className="h-4 w-4"/></span>
    </span>
    <span className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-black/[0.12] px-4 py-2.5"><span className="flex min-w-0 items-center gap-2 text-[10px] font-medium text-slate-400"><Users className="h-3.5 w-3.5 shrink-0 text-emerald-200/80"/><span className="truncate">{server ? `${Number(server.member_count || 0).toLocaleString('tr-TR')} üye` : 'Sunucu önizlemesi'}</span><span className="text-slate-700">·</span><span className="truncate font-mono text-slate-500">${inviteCode}</span></span><span className="shrink-0 rounded-lg bg-emerald-300/[0.11] px-2.5 py-1 text-[9px] font-bold text-emerald-100 transition group-hover:bg-emerald-300/20">{loaded && !server ? 'DAVETİ AÇ' : 'KATIL'} <span aria-hidden="true">→</span></span></span>
  </button>;
}

function renderInline(text, keyPrefix, maps, onChannelClick, onUserClick, onPublicProfileClick, onInviteClick, showSyntax) {
  const pieces = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index;
    if (start > cursor) pieces.push(text.slice(cursor, start));
    const key = `${keyPrefix}-${start}`;
    const userMatch = token.match(new RegExp(`^<@!?(${ENTITY_ID})>$`, 'i'));
    const roleMatch = token.match(new RegExp(`^<@&(${ENTITY_ID})>$`, 'i'));
    const channelMatch = token.match(new RegExp(`^<#(${ENTITY_ID})>$`, 'i'));
    const profileLinkMatch = token.match(/^\s*(?:https?:\/\/)?(?:www\.)?fastlynox(?:\.[a-z0-9-]+)*\/user\/(\d+)\s*$/iu);
    if (profileLinkMatch) {
      pieces.push(<PublicProfileLinkCard key={key} publicId={profileLinkMatch[1]} onOpen={onPublicProfileClick} />);
    } else if (new RegExp(`^\\s*(?:https?:\\/\\/)?(?:www\\.)?fastlynox(?:\\.[a-z0-9-]+)*\\/invite\\/([a-z0-9_-]{3,32})\\s*$`, 'iu').test(token)) {
      const inviteMatch = token.match(/\/invite\/([a-z0-9_-]{3,32})\s*$/iu);
      pieces.push(<ServerInviteLinkCard key={key} inviteCode={inviteMatch?.[1]} onOpen={onInviteClick}/>);
    } else if (userMatch) {
      const profile = maps.users?.[userMatch[1]];
      pieces.push(profile
        ? <button key={key} type="button" title={`@${profile.username} · profili aç`} onClick={() => onUserClick?.(profile)} className="rounded bg-violet-300/15 px-1 font-medium text-violet-100 hover:bg-violet-300/25">@{profile.username}</button>
        : <span key={key} className="rounded bg-violet-300/15 px-1 font-medium text-violet-100">@kullanıcı</span>);
    } else if (roleMatch) {
      const role = maps.roles?.[roleMatch[1]];
      pieces.push(<span key={key} title={role ? `Rol kimliği: ${role.public_id ?? role.id}` : 'Rol'} className="rounded bg-violet-300/15 px-1 font-medium" style={{ color: role?.color || '#c4b5fd' }}>@{role?.name || 'rol'}</span>);
    } else if (channelMatch) {
      const channel = maps.channels?.[channelMatch[1]];
      pieces.push(channel
        ? <span key={key} className="group/channel-mention relative inline-flex"><button type="button" title={`${channel.serverName ? `${channel.serverName} · ` : ''}${channel.name}${channel.type === 'voice' ? ' · tıklayıp ses odasına katıl' : ' · kanala git'}`} onClick={() => onChannelClick?.(channel)} className="inline-flex items-center gap-1 rounded bg-cyan-300/10 px-1 font-medium text-cyan-100 hover:bg-cyan-300/20">{channel.type === 'voice' ? <Volume2 className="h-3 w-3" /> : <Hash className="h-3 w-3" />}{channel.name}</button><span className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden min-w-44 rounded-xl border border-white/10 bg-[#111722]/95 p-2.5 text-left shadow-2xl backdrop-blur-xl group-hover/channel-mention:block group-focus-within/channel-mention:block"><span className="block truncate text-[9px] font-bold uppercase tracking-wider text-slate-500">{channel.serverName || 'Sunucu'}</span><span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-100">{channel.type === 'voice' ? <Volume2 className="h-3.5 w-3.5 text-cyan-200" /> : <Hash className="h-3.5 w-3.5 text-cyan-200" />}{channel.name}</span><span className="mt-1 block text-[9px] text-slate-500">{channel.type === 'voice' ? 'Ses odasına katılmak için tıkla' : 'Kanala gitmek için tıkla'}</span></span></span>
        : <span key={key} className="text-cyan-100">#kanal</span>);
    } else if (/^@/u.test(token)) {
      pieces.push(<span key={key} className={`rounded px-1 font-medium ${token.toLowerCase() === '@everyone' ? 'bg-amber-300/25 text-amber-100' : 'bg-violet-300/15 text-violet-100'}`}>{token}</span>);
    } else if (token.startsWith('**')) pieces.push(showSyntax ? <Fragment key={key}><span className="text-slate-400/40">**</span><strong className="font-bold text-slate-100">{token.slice(2, -2)}</strong><span className="text-slate-400/40">**</span></Fragment> : <strong key={key} className="font-bold text-slate-100">{token.slice(2, -2)}</strong>);
    else if (token.startsWith('__')) pieces.push(showSyntax ? <Fragment key={key}><span className="text-slate-400/40">__</span><u className="decoration-slate-300/70 underline-offset-2">{token.slice(2, -2)}</u><span className="text-slate-400/40">__</span></Fragment> : <u key={key} className="decoration-slate-300/70 underline-offset-2">{token.slice(2, -2)}</u>);
    else if (token.startsWith('~~')) pieces.push(showSyntax ? <Fragment key={key}><span className="text-slate-400/40">~~</span><del className="text-slate-400">{token.slice(2, -2)}</del><span className="text-slate-400/40">~~</span></Fragment> : <del key={key} className="text-slate-400">{token.slice(2, -2)}</del>);
    else if (token.startsWith('`')) pieces.push(showSyntax ? <Fragment key={key}><span className="text-slate-400/40">`</span><code className="rounded-md border border-white/[0.06] bg-black/25 px-1.5 py-0.5 font-mono text-[.9em] text-cyan-100">{token.slice(1, -1)}</code><span className="text-slate-400/40">`</span></Fragment> : <code key={key} className="rounded-md border border-white/[0.06] bg-black/25 px-1.5 py-0.5 font-mono text-[.9em] text-cyan-100">{token.slice(1, -1)}</code>);
    else if (token.startsWith('*')) pieces.push(showSyntax ? <Fragment key={key}><span className="text-slate-400/40">*</span><em className="italic text-slate-200">{token.slice(1, -1)}</em><span className="text-slate-400/40">*</span></Fragment> : <em key={key} className="italic text-slate-200">{token.slice(1, -1)}</em>);
    else if (token.startsWith('_')) pieces.push(showSyntax ? <Fragment key={key}><span className="text-slate-400/40">_</span><em className="italic text-slate-200">{token.slice(1, -1)}</em><span className="text-slate-400/40">_</span></Fragment> : <em key={key} className="italic text-slate-200">{token.slice(1, -1)}</em>);
    cursor = start + token.length;
  }
  if (cursor < text.length) pieces.push(text.slice(cursor));
  return pieces;
}

export function FormattedMessage({ content, userMap = {}, roleMap = {}, channelMap = {}, onChannelClick, onUserClick, onPublicProfileClick, onInviteClick, showSyntax = false }) {
  const maps = { users: userMap, roles: roleMap, channels: channelMap };
  const lines = (content || '').split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    if (lines[index].startsWith('>')) {
      const quoteLines = [];
      while (index < lines.length && lines[index].startsWith('>')) quoteLines.push(lines[index++].replace(/^> ?/, ''));
      blocks.push(<blockquote key={`quote-${index}`} className={`my-1 border-l-[3px] border-violet-300/70 pl-3 ${showSyntax ? 'text-slate-100' : 'text-slate-300'}`}>{quoteLines.map((line, quoteIndex) => <div key={quoteIndex}>{showSyntax && <span className="text-violet-200/35">&gt; </span>}{renderInline(line, `quote-${index}-${quoteIndex}`, maps, onChannelClick, onUserClick, onPublicProfileClick, onInviteClick, showSyntax)}</div>)}</blockquote>);
    } else {
      blocks.push(<span key={`line-${index}`}>{renderInline(lines[index], `line-${index}`, maps, onChannelClick, onUserClick, onPublicProfileClick, onInviteClick, showSyntax)}{index < lines.length - 1 ? '\n' : ''}</span>);
      index += 1;
    }
  }
  return <div className="select-text min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{blocks}</div>;
}
