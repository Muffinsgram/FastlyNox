import { useCallback, useEffect, useState } from 'react';
import { Eye, ImagePlus, Loader2, MessageCircle, Plus, Send, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { uploadStorageFile } from '../../../lib/storageUpload';
import { getAvatarUrl } from '../../../lib/profileMedia';
import { useUploadLimit } from '../../../hooks/useUploadLimit';

const mediaTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function SocialFeed({ user }) {
  const maxUploadBytes = useUploadLimit('social-media', user?.id);
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [followedIds, setFollowedIds] = useState([]);
  const [feedScope, setFeedScope] = useState('all');
  const [mode, setMode] = useState('post');
  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const [activeStory, setActiveStory] = useState(null);
  const [storyActivity, setStoryActivity] = useState({ views: [], reactions: [], replies: [] });
  const [storyReply, setStoryReply] = useState('');
  const [storyNotice, setStoryNotice] = useState('');

  const refresh = useCallback(async () => {
    const [postResult, storyResult, followResult] = await Promise.all([
      supabase.from('user_posts').select('id,author_id,content,media_url,created_at,profiles:author_id(username,avatar_url)').order('created_at', { ascending: false }).limit(50),
      supabase.from('user_stories').select('id,author_id,content,media_url,created_at,expires_at,profiles:author_id(username,avatar_url)').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(40),
      user?.id ? supabase.from('user_follows').select('followed_id').eq('follower_id', user.id) : Promise.resolve({ data: [], error: null }),
    ]);
    const error = postResult.error || storyResult.error || followResult.error;
    if (error) {
      setNotice(/user_posts|user_stories|schema cache|does not exist/i.test(error.message) ? 'Akış ve hikâyeler için migration_global_announcements.sql dosyasını Supabase SQL Editor’da çalıştır.' : error.message);
      return;
    }
    setPosts(postResult.data || []);
    setStories(storyResult.data || []);
    setFollowedIds((followResult.data || []).map(row => row.followed_id));
    setNotice('');
  }, [user]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => { void refresh(); }, 0);
    const channel = supabase.channel('community-feed-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_posts' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_stories' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows', filter: `follower_id=eq.${user?.id}` }, () => { void refresh(); })
      .subscribe();
    return () => { window.clearTimeout(initialFetch); void supabase.removeChannel(channel); };
  }, [refresh, user]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const refreshStoryActivity = useCallback(async (storyId) => {
    if (!storyId) return;
    const [viewResult, reactionResult, replyResult] = await Promise.all([
      supabase.from('user_story_views').select('viewer_id,viewed_at').eq('story_id', storyId).order('viewed_at', { ascending: false }),
      supabase.from('user_story_reactions').select('user_id,emoji').eq('story_id', storyId),
      supabase.from('user_story_replies').select('id,author_id,content,created_at').eq('story_id', storyId).order('created_at').limit(50),
    ]);
    const peopleIds = [...new Set([...(viewResult.data || []).map((view) => view.viewer_id), ...(replyResult.data || []).map((reply) => reply.author_id)])];
    const { data: people } = peopleIds.length ? await supabase.from('profiles').select('id,username,avatar_url').in('id', peopleIds) : { data: [] };
    const profiles = new Map((people || []).map((profile) => [profile.id, profile]));
    setStoryActivity({
      views: (viewResult.data || []).map((view) => ({ ...view, profile: profiles.get(view.viewer_id) })),
      reactions: reactionResult.data || [],
      replies: (replyResult.data || []).map((reply) => ({ ...reply, profile: profiles.get(reply.author_id) })),
    });
    if (viewResult.error || reactionResult.error || replyResult.error) setStoryNotice('Hikâye etkileşimleri yüklenemedi; community features migration’ını kontrol et.');
  }, []);

  useEffect(() => {
    if (!activeStory?.id) return undefined;
    let active = true;
    setStoryNotice('');
    if (activeStory.author_id !== user?.id) void supabase.from('user_story_views').upsert({ story_id: activeStory.id, viewer_id: user.id }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true });
    void refreshStoryActivity(activeStory.id);
    const channel = supabase.channel(`story-activity:${activeStory.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_story_views', filter: `story_id=eq.${activeStory.id}` }, () => { if (active) void refreshStoryActivity(activeStory.id); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_story_reactions', filter: `story_id=eq.${activeStory.id}` }, () => { if (active) void refreshStoryActivity(activeStory.id); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_story_replies', filter: `story_id=eq.${activeStory.id}` }, () => { if (active) void refreshStoryActivity(activeStory.id); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [activeStory?.id, activeStory?.author_id, user?.id, refreshStoryActivity]);

  const chooseMedia = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!mediaTypes[file.type] || file.size > maxUploadBytes) {
      setNotice(`JPG, PNG, WebP veya GIF görseli seç; dosya ${(maxUploadBytes / 1024 / 1024).toFixed(0)} MB sınırını aşmamalı.`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setMediaFile(file);
    setNotice('');
  };

  const clearMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setMediaFile(null);
  };

  const publish = async event => {
    event.preventDefault();
    if (!user?.id || (!content.trim() && !mediaFile) || isPublishing) return;
    setIsPublishing(true);
    setNotice('');
    let storagePath = null;
    let publishingStage = 'story';
    try {
      let mediaUrl = null;
      if (mediaFile) {
        publishingStage = 'media';
        storagePath = `${user.id}/${mode}/${globalThis.crypto?.randomUUID?.() || Date.now()}.${mediaTypes[mediaFile.type]}`;
        await uploadStorageFile('social-media', storagePath, mediaFile, setUploadProgress);
        mediaUrl = supabase.storage.from('social-media').getPublicUrl(storagePath).data.publicUrl;
      }
      publishingStage = 'story';
      const table = mode === 'story' ? 'user_stories' : 'user_posts';
      const row = { author_id: user.id, content: content.trim(), media_url: mediaUrl };
      if (mode === 'story') row.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from(table).insert(row);
      if (error) throw error;
      setContent('');
      clearMedia();
      setUploadProgress(0);
      setNotice(mode === 'story' ? 'Hikâyen 24 saat boyunca yayında.' : 'Gönderin topluluk akışında paylaşıldı.');
      void refresh();
    } catch (error) {
      if (storagePath) await supabase.storage.from('social-media').remove([storagePath]);
      const message = error instanceof Error ? error.message : '';
      setNotice(/row-level security|violates row-level/i.test(message)
        ? `${publishingStage === 'media' ? 'Görsel yükleme' : 'Hikâye paylaşma'} yetkisi Supabase’de eksik. Supabase SQL Editor’da migration_story_rls_fix.sql dosyasını çalıştırıp tekrar dene.`
        : message || 'Paylaşım gönderilemedi.');
    } finally {
      setIsPublishing(false);
      setUploadProgress(0);
    }
  };

  const removePost = async postId => {
    const { error } = await supabase.from('user_posts').delete().eq('id', postId).eq('author_id', user.id);
    if (error) setNotice(error.message);
    else setPosts(current => current.filter(post => post.id !== postId));
  };

  const toggleStoryReaction = async (emoji) => {
    if (!activeStory || activeStory.author_id === user?.id) return;
    const existing = storyActivity.reactions.find((reaction) => reaction.user_id === user?.id);
    const result = existing?.emoji === emoji
      ? await supabase.from('user_story_reactions').delete().eq('story_id', activeStory.id).eq('user_id', user.id)
      : existing
        ? await supabase.from('user_story_reactions').update({ emoji }).eq('story_id', activeStory.id).eq('user_id', user.id)
        : await supabase.from('user_story_reactions').insert({ story_id: activeStory.id, user_id: user.id, emoji });
    if (result.error) setStoryNotice('Tepki gönderilemedi. Veritabanı migration’ını kontrol et.');
    else void refreshStoryActivity(activeStory.id);
  };

  const sendStoryReply = async (event) => {
    event.preventDefault();
    if (!storyReply.trim() || !activeStory) return;
    const { error } = await supabase.from('user_story_replies').insert({ story_id: activeStory.id, author_id: user.id, content: storyReply.trim() });
    if (error) setStoryNotice('Yanıt gönderilemedi. Tekrar dene.');
    else { setStoryReply(''); void refreshStoryActivity(activeStory.id); }
  };

  const visiblePosts = feedScope === 'all' ? posts : posts.filter(post => post.author_id === user?.id || followedIds.includes(post.author_id));
  const visibleStories = feedScope === 'all' ? stories : stories.filter(story => story.author_id === user?.id || followedIds.includes(story.author_id));

  return (
    <section className="mx-auto w-full max-w-3xl pb-10">
      <header className="mb-6 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-300/15 bg-violet-300/[0.08] text-violet-100"><MessageCircle className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-violet-200/70">Fastlynox topluluğu</p><h1 className="mt-1 text-2xl font-bold text-white">Akış ve hikâyeler</h1><p className="mt-1 text-sm text-slate-400">Takip ettiklerinle paylaş, topluluktaki yenilikleri anında gör.</p></div><span className="hidden rounded-full border border-emerald-200/15 bg-emerald-200/[0.05] px-3 py-1.5 text-[11px] text-emerald-100 sm:inline-flex">Canlı akış</span></header>

      <div className="mb-6 rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
        <div className="mb-4 flex gap-2"><button type="button" onClick={() => setMode('post')} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === 'post' ? 'bg-violet-400/15 text-violet-100' : 'text-slate-400 hover:bg-white/5'}`}>Gönderi</button><button type="button" onClick={() => setMode('story')} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === 'story' ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-400 hover:bg-white/5'}`}>24 saatlik hikâye</button></div>
        <form onSubmit={publish}><textarea value={content} onChange={event => setContent(event.target.value)} maxLength={mode === 'story' ? 500 : 5000} rows={3} placeholder={mode === 'story' ? 'Bugün neler oluyor?' : 'Aklındakileri toplulukla paylaş…'} aria-label={mode === 'story' ? 'Hikâye metni' : 'Gönderi metni'} className="w-full resize-y rounded-xl border border-white/[0.07] bg-[#090d14]/60 px-3.5 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-300/25" />
          {mediaFile && <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-2"><img src={previewUrl} alt="Yükleme önizlemesi" className="h-14 w-16 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-xs text-slate-300">{mediaFile.name}{isPublishing && <span className="ml-2 text-violet-200">%{uploadProgress}</span>}</span>{!isPublishing && <button type="button" onClick={clearMedia} aria-label="Görseli kaldır" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>}</div>}
          {isPublishing && mediaFile && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>}
          <div className="mt-3 flex items-center justify-between gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100"><ImagePlus className="h-4 w-4" /> Görsel ekle<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={chooseMedia} disabled={isPublishing} /></label><button type="submit" disabled={isPublishing || (!content.trim() && !mediaFile)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-950/25 transition hover:brightness-110 disabled:opacity-40">{isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{isPublishing ? 'Paylaşılıyor…' : mode === 'story' ? 'Hikâyeyi paylaş' : 'Gönderiyi paylaş'}</button></div>
        </form>
      </div>
      {notice && <p role="status" className="mb-4 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-xs text-slate-300">{notice}</p>}

      {visibleStories.length > 0 && <section className="mb-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-500">Hikâyeler · 24 saatte kaybolur</h2><button type="button" onClick={() => setMode('story')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-200 hover:text-white"><Plus className="h-3.5 w-3.5" /> Hikâye ekle</button></div><div className="flex gap-3 overflow-x-auto pb-2">{visibleStories.map(story => <button key={story.id} type="button" onClick={() => setActiveStory(story)} className="group relative h-40 w-28 shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-violet-500/20 to-cyan-400/10 text-left shadow-lg"><span className="absolute inset-0">{story.media_url && <img src={story.media_url} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />}<span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" /></span><img src={getAvatarUrl(story.profiles?.avatar_url, story.profiles?.username)} alt="" className="absolute left-2.5 top-2.5 h-8 w-8 rounded-full border-2 border-violet-300 object-cover shadow" /><span className="absolute inset-x-2.5 bottom-2.5 line-clamp-3 text-[11px] font-medium text-white">{story.profiles?.username || 'Kullanıcı'}{story.content && <span className="mt-1 block text-[10px] font-normal text-white/75">{story.content}</span>}</span></button>)}</div></section>}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1"><button type="button" onClick={() => setFeedScope('all')} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${feedScope === 'all' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200'}`}>Herkes</button><button type="button" onClick={() => setFeedScope('following')} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${feedScope === 'following' ? 'bg-violet-400/15 text-violet-100' : 'text-slate-500 hover:text-slate-200'}`}>Takip ettiklerim · {followedIds.length}</button></div><span className="text-[11px] text-slate-600">{visiblePosts.length} gönderi</span></div>
      {visiblePosts.length === 0 ? <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.02] px-5 py-12 text-center"><MessageCircle className="mx-auto mb-3 h-6 w-6 text-slate-600" /><p className="text-sm text-slate-400">{feedScope === 'following' && followedIds.length === 0 ? 'Akışını doldurmak için profillerden kişileri takip et.' : 'Akış henüz sessiz. İlk gönderiyi sen paylaş.'}</p></div> : <div className="space-y-3">{visiblePosts.map(post => <article key={post.id} className="group overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-white/[0.12] sm:p-5"><div className="mb-3 flex items-center gap-2.5"><img src={getAvatarUrl(post.profiles?.avatar_url, post.profiles?.username)} alt="" className="h-9 w-9 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-100">{post.profiles?.username || 'Kullanıcı'}</p><time dateTime={post.created_at} className="text-[10px] text-slate-500">{new Date(post.created_at).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>{post.author_id === user?.id && <button type="button" onClick={() => void removePost(post.id)} aria-label="Gönderini sil" className="rounded-lg p-2 text-slate-500 opacity-0 transition hover:bg-rose-300/10 hover:text-rose-200 group-hover:opacity-100 focus:opacity-100"><X className="h-4 w-4" /></button>}</div>{post.content && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{post.content}</p>}{post.media_url && <img src={post.media_url} alt="Gönderi eki" className="mt-3 max-h-[480px] w-full rounded-2xl border border-white/[0.06] object-contain" />}</article>)}</div>}

      {activeStory && <div role="dialog" aria-modal="true" aria-label="Hikâye" onClick={() => setActiveStory(null)} className="fixed inset-0 z-[220] grid place-items-center bg-black/80 p-4 backdrop-blur-lg"><article onClick={event => event.stopPropagation()} className="relative flex max-h-[90vh] min-h-[min(36rem,80vh)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#10151f] shadow-2xl"><button type="button" onClick={() => setActiveStory(null)} aria-label="Hikâyeyi kapat" className="absolute right-3 top-3 z-20 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"><X className="h-4 w-4" /></button><div className="relative min-h-64 flex-1 overflow-y-auto">{activeStory.media_url && <img src={activeStory.media_url} alt="" className="absolute inset-0 h-full w-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/35" /><div className="absolute inset-x-0 bottom-0 p-5"><div className="mb-3 flex items-center gap-2"><img src={getAvatarUrl(activeStory.profiles?.avatar_url, activeStory.profiles?.username)} alt="" className="h-8 w-8 rounded-full border border-white/40 object-cover" /><div><p className="text-xs font-semibold text-white">{activeStory.profiles?.username}</p><p className="text-[10px] text-white/60">{new Date(activeStory.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p></div></div>{activeStory.content && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white">{activeStory.content}</p>}</div></div><div className="max-h-[45%] overflow-y-auto border-t border-white/10 bg-[#10151f] p-4"><div className="mb-3 flex items-center justify-between text-[11px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />{storyActivity.views.length} görüntüleme</span>{activeStory.author_id === user?.id && <span className="text-slate-500">Görüntüleyenler: {storyActivity.views.map((view) => view.profile?.username).filter(Boolean).join(', ') || 'Henüz yok'}</span>}</div>{activeStory.author_id !== user?.id && <div className="mb-3 flex gap-2">{['❤️', '😂', '🔥', '👏', '😍', '😮'].map((emoji) => <button key={emoji} type="button" aria-label={`${emoji} tepkisi ver`} onClick={() => void toggleStoryReaction(emoji)} className={`grid h-9 w-9 place-items-center rounded-xl border text-base transition ${storyActivity.reactions.some((reaction) => reaction.user_id === user?.id && reaction.emoji === emoji) ? 'border-rose-300/30 bg-rose-300/10' : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/10'}`}>{emoji}</button>)}</div>}{storyActivity.reactions.length > 0 && <p className="mb-3 text-[11px] text-slate-400">{storyActivity.reactions.map((reaction) => reaction.emoji).join(' ')} · {storyActivity.reactions.length} tepki</p>}<div className="mb-3 space-y-2">{storyActivity.replies.map((reply) => <div key={reply.id} className="rounded-xl bg-white/[0.04] px-3 py-2"><p className="text-[10px] font-semibold text-violet-200">{reply.profile?.username || 'Kullanıcı'}</p><p className="mt-1 break-words text-xs text-slate-300">{reply.content}</p></div>)}</div>{activeStory.author_id !== user?.id && <form onSubmit={sendStoryReply} className="flex gap-2"><input value={storyReply} onChange={(event) => setStoryReply(event.target.value)} maxLength={1000} placeholder="Hikâyeye yanıt yaz…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-slate-500" /><button disabled={!storyReply.trim()} aria-label="Hikâye yanıtını gönder" className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500 text-white disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button></form>}{storyNotice && <p role="status" className="mt-2 text-[10px] text-amber-200">{storyNotice}</p>}</div></article></div>}
    </section>
  );
}
