import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Hash, MessageSquare, Loader2, Calendar, Users, Volume2, Server } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useServerStore } from '../../store/useServerStore';
import { getAvatarUrl, fetchProfiles } from '../../lib/profileMedia';
import { useFriendStore } from '../../store/useFriendStore';
import { AnimatedSelect } from '../ui/AnimatedSelect';

export function GlobalSearchModal({ onClose, onOpenDM, onOpenServer }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('any');
  const [authorFilter, setAuthorFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchNow] = useState(() => Date.now());
  const { user } = useAuthStore();
  const { servers } = useServerStore();
  const dmChannels = useFriendStore((state) => state.dmChannels);
  const inputRef = useRef(null);
  const searchSequence = useRef(0);

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const performSearch = useCallback(async () => {
    const requestId = ++searchSequence.current;
    if (!user || query.trim().length < 3) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError('');
    try {
      const { data, error } = await supabase.rpc('search_all_messages', { search_query: query.trim() });
      let matches = error ? [] : (data || []);
      if (error || !matches.length) {
        const term = query.trim();
        const [serverResult, dmResult] = await Promise.all([
          supabase.from('messages').select('id,channel_id,user_id,content,created_at').ilike('content', `%${term}%`).order('created_at', { ascending: false }).limit(50),
          supabase.from('dm_messages').select('id,dm_channel_id,user_id,content,created_at').ilike('content', `%${term}%`).order('created_at', { ascending: false }).limit(50),
        ]);
        const rawMatches = [
          ...(serverResult.data || []).map((row) => ({ ...row, source_type: 'server' })),
          ...(dmResult.data || []).map((row) => ({ ...row, channel_id: row.dm_channel_id, source_type: 'dm' })),
        ];
        const profiles = await fetchProfiles([...new Set(rawMatches.map((row) => row.user_id).filter(Boolean))]);
        const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
        matches = rawMatches.map((row) => ({ ...row, author_name: profileMap.get(row.user_id)?.username || 'Kullanıcı', author_avatar: profileMap.get(row.user_id)?.avatar_url || null }));
        if (error && serverResult.error && dmResult.error) throw error;
      }
      if (requestId === searchSequence.current) setResults(matches.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100));
    } catch (e) {
      console.error(e);
      if (requestId === searchSequence.current) {
        setResults([]);
        setSearchError('Mesaj araması açılamadı. migration_edit_delete.sql dosyasının Supabase’te çalıştığını kontrol et.');
      }
    } finally {
      if (requestId === searchSequence.current) setIsSearching(false);
    }
  }, [query, user]);

  useEffect(() => {
    const timer = setTimeout(() => { void performSearch(); }, 400);
    return () => clearTimeout(timer);
  }, [performSearch]);

  const highlightText = (text) => {
    if (!query) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? 
        <span key={i} className="bg-emerald-500/20 text-emerald-400 rounded-sm px-0.5">{part}</span> : part
    );
  };

  const visibleResults = results.filter((result) => {
    if (sourceFilter !== 'all' && result.source_type !== sourceFilter) return false;
    if (authorFilter.trim() && !String(result.author_name || '').toLocaleLowerCase('tr-TR').includes(authorFilter.trim().toLocaleLowerCase('tr-TR'))) return false;
    if (dateFilter === 'any') return true;
    const days = Number(dateFilter);
    return Number.isFinite(new Date(result.created_at).getTime()) && searchNow - new Date(result.created_at).getTime() <= days * 86_400_000;
  });

  const destinations = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('tr-TR');
    if (term.length < 2) return [];
    const serverDestinations = servers.flatMap((server) => {
      const rows = [];
      if (server.name?.toLocaleLowerCase('tr-TR').includes(term)) rows.push({ kind: 'server', id: server.id, server, label: server.name, detail: 'Sunucu' });
      for (const category of server.categories || []) for (const channel of category.channels || []) {
        if (channel.name?.toLocaleLowerCase('tr-TR').includes(term)) rows.push({ kind: 'channel', id: channel.id, server, channel, label: channel.name, detail: `${server.name} · ${category.name}`, channelType: channel.type });
      }
      return rows;
    });
    const directMessages = dmChannels.flatMap((dm) => {
      const peer = dm.user1_id === user?.id ? dm.user2 : dm.user1;
      return peer?.username?.toLocaleLowerCase('tr-TR').includes(term) ? [{ kind: 'dm', id: dm.id, peer, label: peer.username, detail: 'Özel mesaj' }] : [];
    });
    return [...serverDestinations, ...directMessages].slice(0, 12);
  }, [query, servers, dmChannels, user?.id]);

  const openDestination = useCallback((destination) => {
    onClose();
    if (destination.kind === 'dm') { onOpenDM?.(destination.id); return; }
    onOpenServer?.(destination.server.id, destination.kind === 'channel' ? destination.channel.id : null);
  }, [onClose, onOpenDM, onOpenServer]);

  const handleResultClick = useCallback((res) => {
    if (res.source_type === 'dm' && res.channel_id) {
      onOpenDM?.(res.channel_id);
      return;
    }
    if (res.source_type === 'server') {
      // Find which server this channel belongs to
      let foundServerId = null;
      for (const server of servers) {
        if (server.categories?.some(c => c.channels?.some(ch => ch.id === res.channel_id))) {
          foundServerId = server.id;
          break;
        }
      }
      if (foundServerId) {
        onOpenServer?.(foundServerId, res.channel_id);
      }
    }
    onClose();
  }, [onClose, onOpenDM, onOpenServer, servers]);

  const navigationItemCount = destinations.length + visibleResults.length;
  const safeActiveIndex = navigationItemCount ? Math.min(activeIndex, navigationItemCount - 1) : 0;

  useEffect(() => {
    const handleResultNavigation = (event) => {
      if (event.target instanceof HTMLElement && (event.target.closest('[role="combobox"]') || event.target.closest('[role="listbox"]'))) return;
      if (!navigationItemCount) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((current) => (current + direction + navigationItemCount) % navigationItemCount);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (safeActiveIndex < destinations.length) openDestination(destinations[safeActiveIndex]);
        else handleResultClick(visibleResults[safeActiveIndex - destinations.length]);
      }
    };
    window.addEventListener('keydown', handleResultNavigation);
    return () => window.removeEventListener('keydown', handleResultNavigation);
  }, [navigationItemCount, safeActiveIndex, destinations, visibleResults, openDestination, handleResultClick]);

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#181F2A] w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden border border-white/10" onClick={e => e.stopPropagation()}>
        
        {/* Search Input */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <Search className={`w-5 h-5 ${isSearching ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nereye gitmek istersiniz? Veya mesaj arayın..."
            className="flex-1 bg-transparent border-none outline-none text-white text-lg font-medium placeholder:text-slate-500"
          />
          {isSearching && <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Filtrele</span>
          <AnimatedSelect value={sourceFilter} onValueChange={setSourceFilter} ariaLabel="Mesaj türü" options={[{ value: 'all', label: 'Tüm sohbetler' }, { value: 'server', label: 'Sunucular' }, { value: 'dm', label: 'Özel mesajlar' }]} className="min-h-8 min-w-36 rounded-lg px-2.5 py-1 text-[11px]" />
          <AnimatedSelect value={dateFilter} onValueChange={setDateFilter} ariaLabel="Tarih aralığı" options={[{ value: 'any', label: 'Tüm tarihler' }, { value: '1', label: 'Son 24 saat' }, { value: '7', label: 'Son 7 gün' }, { value: '30', label: 'Son 30 gün' }]} className="min-h-8 min-w-36 rounded-lg px-2.5 py-1 text-[11px]" />
          <input value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)} aria-label="Gönderen adına göre filtrele" placeholder="Gönderen" className="w-28 rounded-lg border border-white/10 bg-[#11151E] px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-violet-300/40" />
          <span className="ml-auto text-[10px] text-slate-500">{visibleResults.length} / {results.length}</span>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          {destinations.length > 0 && <div className="border-b border-white/[0.06] p-2"><div className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Hızlı git</div><div className="space-y-0.5">{destinations.map((destination, index) => <button key={`${destination.kind}:${destination.id}`} type="button" aria-selected={safeActiveIndex === index} onMouseEnter={() => setActiveIndex(index)} onClick={() => openDestination(destination)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${safeActiveIndex === index ? 'bg-violet-300/[0.1]' : 'hover:bg-white/[0.06]'}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-violet-200">{destination.kind === 'dm' ? <Users className="h-4 w-4" /> : destination.kind === 'server' ? <Server className="h-4 w-4" /> : destination.channelType === 'voice' ? <Volume2 className="h-4 w-4" /> : <Hash className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{destination.label}</span><span className="block truncate text-[10px] text-slate-500">{destination.detail}</span></span><span className="text-[9px] text-slate-600">Git →</span></button>)}</div></div>}
          {query.length > 0 && query.length < 3 && (
            <div className="p-5 text-center text-slate-500 text-xs">Mesaj aramak için 3 karakter yaz; sunucu, kanal ve DM’lerde hızlı git sonuçları 2 karakterden çıkar.</div>
          )}

          {query.length >= 3 && results.length === 0 && destinations.length === 0 && !isSearching && (
            <div className="p-12 flex flex-col items-center justify-center text-slate-500">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p>{searchError || 'Hi\u00e7bir sonu\u00e7 bulunamad\u0131.'}</p>
            </div>
          )}

          {results.length > 0 && visibleResults.length === 0 && !isSearching && <div className="p-10 text-center text-sm text-slate-400">Bu filtrelere uyan mesaj bulunamadı.</div>}

          {visibleResults.length > 0 && (
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-black text-slate-500 uppercase">Mesajlar · {visibleResults.length} sonuç</div>
              <div className="space-y-1">
                {visibleResults.map((res, index) => (
                  <button key={res.id} aria-selected={safeActiveIndex === destinations.length + index} onMouseEnter={() => setActiveIndex(destinations.length + index)} onClick={() => handleResultClick(res)} className={`w-full text-left px-3 py-3 rounded-lg transition-colors group flex items-start gap-3 ${safeActiveIndex === destinations.length + index ? 'bg-violet-300/[0.1]' : 'hover:bg-white/5'}`}>
                    <img src={getAvatarUrl(res.author_avatar, res.author)} className="w-10 h-10 rounded-full bg-slate-800 object-cover shrink-0" alt="" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200 text-sm">{res.author_name}</span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            {res.source_type === 'server' ? <Hash className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                            Kanal {res.channel_id.substring(0, 4)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Calendar className="w-3 h-3" />
                          {new Date(res.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 line-clamp-2">
                        {highlightText(res.content)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/5 bg-[#11151E] flex justify-between items-center text-[10px] text-slate-500 font-medium">
          <div className="flex items-center gap-3">
             <span className="flex items-center gap-1"><span className="bg-white/10 px-1.5 py-0.5 rounded text-slate-300">↑</span><span className="bg-white/10 px-1.5 py-0.5 rounded text-slate-300">↓</span> Seç</span>
             <span className="flex items-center gap-1"><span className="bg-white/10 px-1.5 py-0.5 rounded text-slate-300">↵</span> Git</span>
          </div>
          <div>PostgreSQL TSVECTOR <span className="text-emerald-500">FastSearch</span></div>
        </div>

      </div>
    </div>
  );
}
