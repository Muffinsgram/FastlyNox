import { Fragment } from 'react';
import { Hash, Volume2 } from 'lucide-react';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ENTITY_ID = `(?:${UUID}|[0-9]+)`;
const INLINE = new RegExp(`(<@&${ENTITY_ID}>|<@!?${ENTITY_ID}>|<#${ENTITY_ID}>|@everyone|@[\\p{L}\\p{N}_.-]+|\\*\\*[^\\n*]+\\*\\*|__[^\\n_]+__|~~[^\\n~]+~~|\\*[^\\n*]+\\*|_[^\\n_]+_|\\x60[^\\n\\x60]+\\x60)`, 'giu');

function renderInline(text, keyPrefix, maps, onChannelClick, onUserClick, showSyntax) {
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
    if (userMatch) {
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

export function FormattedMessage({ content, userMap = {}, roleMap = {}, channelMap = {}, onChannelClick, onUserClick, showSyntax = false }) {
  const maps = { users: userMap, roles: roleMap, channels: channelMap };
  const lines = (content || '').split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    if (lines[index].startsWith('>')) {
      const quoteLines = [];
      while (index < lines.length && lines[index].startsWith('>')) quoteLines.push(lines[index++].replace(/^> ?/, ''));
      blocks.push(<blockquote key={`quote-${index}`} className={`my-1 border-l-[3px] border-violet-300/70 pl-3 ${showSyntax ? 'text-slate-100' : 'text-slate-300'}`}>{quoteLines.map((line, quoteIndex) => <div key={quoteIndex}>{showSyntax && <span className="text-violet-200/35">&gt; </span>}{renderInline(line, `quote-${index}-${quoteIndex}`, maps, onChannelClick, onUserClick, showSyntax)}</div>)}</blockquote>);
    } else {
      blocks.push(<span key={`line-${index}`}>{renderInline(lines[index], `line-${index}`, maps, onChannelClick, onUserClick, showSyntax)}{index < lines.length - 1 ? '\n' : ''}</span>);
      index += 1;
    }
  }
  return <span className="select-text whitespace-pre-wrap break-words">{blocks}</span>;
}
