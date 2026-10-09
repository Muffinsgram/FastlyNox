import { getClipboardImage } from '../../../lib/clipboardImage';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Info, Plus, Loader2, Pencil, Trash2, Send, X, Reply, Forward, PanelRight, Phone, PhoneOff } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { uploadStorageFile } from '../../../lib/storageUpload';
import { useAuthStore } from '../../../store/useAuthStore';
import { useDMChatStore } from '../../../store/useDMChatStore';
import { fetchProfile, getAvatarUrl, getBannerUrl } from '../../../lib/profileMedia';
import { AttachmentImage } from './AttachmentImage';
import { MessageReactions } from './MessageReactions';
import { ComposerMediaPicker } from './ComposerMediaPicker';
import { CopyMessageButton } from './CopyMessageButton';
import { readDraft } from '../../../lib/draftStorage';
import { MentionSuggestions } from './MentionSuggestions';
import { ForwardMessageModal } from './ForwardMessageModal';
import { UserProfileModal } from '../../../components/layout/UserProfileModal';
import { jumpToMessage } from '../../../lib/messageNavigation';
import { SaveMessageButton } from './SaveMessageButton';
import { playUiSound } from '../../../lib/uiSounds';
import { useChatPresence } from '../../../hooks/useChatPresence';
import { COMMAND_HELP, resolveChatCommand } from '../../../lib/chatCommands';
import { FormattedMessage } from './FormattedMessage';
import { useUploadLimit } from '../../../hooks/useUploadLimit';

export function DMChatArea({ activeChannelId, channelName, avatarUrl, otherUser, onStartCall, incomingCallInvite, onAcceptCall, onDeclineCall, onInviteClick }) {
  const { user } = useAuthStore();
  const maxUploadBytes = useUploadLimit('attachments', user?.id);
  const { messages, drafts, isLoading, setDraft, clearDraft, fetchMessages, subscribeToChannel, unsubscribe, sendMessage, editMessage, deleteMessage, toggleReaction } = useDMChatStore();
  const input = drafts[activeChannelId] ?? readDraft(user?.id, `dm:${activeChannelId}`) ?? '';
  const chatScrollRef = useRef(null);
  const shouldAutoScroll = useRef(true);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const inputPreviewRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [messageError, setMessageError] = useState('');
  const [commandNotice, setCommandNotice] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [dmProfile, setDmProfile] = useState(otherUser || null);
  const [selfProfile, setSelfProfile] = useState(null);
  const [viewedProfile, setViewedProfile] = useState(null);
  const [callStatus, setCallStatus] = useState('');
  const [readReceiptSettings, setReadReceiptSettings] = useState({ self: true, peer: true });
  const [isTypingNow, setIsTypingNow] = useState(false);
  const typingTimerRef = useRef(null);
  const mentionUserIds = useMemo(() => [user?.id, otherUser?.id].filter(Boolean), [user?.id, otherUser?.id]);
  const mentionUserMap = useMemo(() => Object.fromEntries([user, selfProfile, otherUser, dmProfile].filter((profile) => profile?.id).flatMap((profile) => [[profile.id, profile], ...(profile.public_id ? [[String(profile.public_id), profile]] : [])])), [user, selfProfile, otherUser, dmProfile]);

  const startDMCall = async () => {
    const { data, error } = await supabase.from('dm_call_invites').insert({ dm_channel_id: activeChannelId, caller_id: user.id, callee_id: otherUser.id }).select('id').single();
    if (error || !data) { setCallStatus('Arama açılamadı. migration_dm_calls.sql dosyasını Supabase’te çalıştır.'); return; }
    const started = onStartCall?.({ channelId: activeChannelId, channelName: `${channelName} ile arama`, peerId: otherUser?.id, inviteId: data.id, isCaller: true });
    if (started === false) { await supabase.from('dm_call_invites').update({ status: 'declined' }).eq('id', data.id); setCallStatus('Önce devam eden ses bağlantısını kapat.'); return; }
    playUiSound('callOutgoing', user?.id);
    setCallStatus('Aranıyor…');
  };

  const acceptDMCall = async () => {
    const { data: accepted, error } = await supabase.from('dm_call_invites').update({ status: 'accepted' }).eq('id', incomingCallInvite?.id).eq('callee_id', user?.id).eq('status', 'ringing').select('id').maybeSingle();
    if (error) { setCallStatus('Arama kabul edilemedi. Tekrar dene.'); return; }
    if (!accepted) { onDeclineCall?.(incomingCallInvite?.id); return; }
    const started = onStartCall?.({ channelId: activeChannelId, channelName: `${channelName} ile arama`, peerId: otherUser?.id, inviteId: incomingCallInvite?.id, isCaller: false });
    if (started === false) { await supabase.from('dm_call_invites').update({ status: 'declined' }).eq('id', incomingCallInvite?.id); setCallStatus('Başka bir ses bağlantısı açık. Önce ondan ayrıl.'); return; }
    playUiSound('callAccepted', user?.id);
    onAcceptCall?.(incomingCallInvite?.id);
    setCallStatus('Aramaya bağlanıyor…');
  };

  const declineDMCall = async () => {
    await supabase.from('dm_call_invites').update({ status: 'declined' }).eq('id', incomingCallInvite?.id).eq('callee_id', user?.id).eq('status', 'ringing');
    playUiSound('callDeclined', user?.id);
    onDeclineCall?.(incomingCallInvite?.id);
    setCallStatus('');
  };

  useEffect(() => {
    let active = true;
    if (otherUser?.id) void fetchProfile(otherUser.id).then((profile) => { if (active && profile) setDmProfile(profile); });
    if (user?.id) void fetchProfile(user.id).then((profile) => { if (active && profile) setSelfProfile(profile); });
    return () => { active = false; };
  }, [otherUser?.id, user?.id]);

  const channelMessages = useMemo(() => messages[activeChannelId] || [], [messages, activeChannelId]);
  const currentUserId = user?.id;
  const currentUsername = user?.username?.toLowerCase() || '';
  const messageGroupSizes = useMemo(() => channelMessages.reduce((sizes, message, index) => {
    if (index === 0) return [1];
    const previous = channelMessages[index - 1];
    const withinGroup = previous.user_id === message.user_id
      && new Date(message.created_at) - new Date(previous.created_at) <= 60_000
      && sizes[index - 1] < 20;
    return [...sizes, withinGroup ? sizes[index - 1] + 1 : 1];
  }, []), [channelMessages]);
  const mentionFlags = useMemo(() => channelMessages.map((message) => {
    const tokens = (message.content || '').match(/@[\p{L}\p{N}_.-]+/gu) || [];
    const directIds = [...(message.content || '').matchAll(/<@!?([0-9a-f-]{36})>/giu)].map((match) => match[1]);
    return tokens.some((mention) => mention.slice(1).toLowerCase() === currentUsername || mention.toLowerCase() === '@everyone') || directIds.includes(currentUserId);
  }), [channelMessages, currentUsername, currentUserId]);
  const latestIncomingAt = useMemo(() => [...channelMessages].reverse().find((message) => message.user_id !== currentUserId && !message.isOptimistic)?.created_at || null, [channelMessages, currentUserId]);
  const latestOutgoing = useMemo(() => [...channelMessages].reverse().find((message) => message.user_id === currentUserId && !message.isOptimistic), [channelMessages, currentUserId]);
  const { typingUsers, readAtByUser } = useChatPresence({ scope: `dm:${activeChannelId}`, user, isTyping: isTypingNow, lastReadAt: readReceiptSettings.self ? latestIncomingAt : null });
  const peerReadAt = readAtByUser[otherUser?.id];
  const latestMessageWasRead = Boolean(readReceiptSettings.peer && latestOutgoing && peerReadAt && new Date(peerReadAt).getTime() >= new Date(latestOutgoing.created_at).getTime());

  useEffect(() => {
    const ids = [user?.id, otherUser?.id].filter(Boolean);
    if (!ids.length) return;
    let active = true;
    void supabase.from('user_privacy_settings').select('user_id,read_receipts').in('user_id', ids).then(({ data }) => {
      if (!active || !data) return;
      const settings = new Map(data.map((row) => [row.user_id, row.read_receipts !== false]));
      setReadReceiptSettings({ self: settings.get(user?.id) ?? true, peer: settings.get(otherUser?.id) ?? true });
    });
    return () => { active = false; };
  }, [user?.id, otherUser?.id]);

  useEffect(() => () => window.clearTimeout(typingTimerRef.current), []);

  useEffect(() => {
    shouldAutoScroll.current = true;
    if (activeChannelId) {
      fetchMessages(activeChannelId);
      subscribeToChannel(activeChannelId);
    }
    return () => {
      unsubscribe();
    };
  }, [activeChannelId, fetchMessages, subscribeToChannel, unsubscribe]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (container && shouldAutoScroll.current && !editingId) {
      container.scrollTop = container.scrollHeight;
    }
  }, [channelMessages, editingId]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    if (inputPreviewRef.current) inputPreviewRef.current.scrollTop = textarea.scrollTop;
  }, [input]);

  const clearSelectedFile = () => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl('');
    setSelectedFile(null);
  };

  useEffect(() => () => { if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl); }, [mediaPreviewUrl]);

  const sendCurrentMessage = async () => {
    if ((!input.trim() && !selectedFile) || isSending || isUploading) return;
    const channelId = activeChannelId;
    let content = input.trim();
    const command = resolveChatCommand(content);
    if (command.type === 'help') {
      setCommandNotice(COMMAND_HELP);
      setDraft(channelId, '');
      setIsTypingNow(false);
      return;
    }
    if (command.type === 'error') { setCommandNotice(command.message); return; }
    if (command.unknown) { setCommandNotice(`Bilinmeyen komut. ${COMMAND_HELP}`); return; }
    if (command.handled) { content = command.content; setCommandNotice(''); }
    setMessageError('');
    let imagePath = null;
    let uploadCompleted = false;
    try {
      if (selectedFile) {
        setIsUploading(true);
        setUploadProgress(0);
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[selectedFile.type];
        imagePath = `${user.id}/${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}.${extension}`;
        await uploadStorageFile('attachments', imagePath, selectedFile, setUploadProgress);
        uploadCompleted = true;
      }
      setIsSending(true);
      const result = await sendMessage(channelId, content, imagePath, replyTo);
      if (!result?.success) {
        if (imagePath) await supabase.storage.from('attachments').remove([imagePath]);
        throw new Error(result?.error || 'Mesaj gönderilemedi. Tekrar dene.');
      }
      clearDraft(channelId);
      clearSelectedFile();
      setReplyTo(null);
      setIsTypingNow(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mesaj gönderilemedi. Tekrar dene.';
      if (imagePath && !uploadCompleted) setUploadError(message);
      else setMessageError(message);
    } finally {
      setIsUploading(false);
      setIsSending(false);
      setUploadProgress(0);
    }
  };

  const sendGif = async (url) => {
    if (isSending || isUploading) return;
    setMessageError('');
    setIsSending(true);
    const result = await sendMessage(activeChannelId, '', url, replyTo);
    if (!result?.success) setMessageError(result?.error || 'GIF gönderilemedi. Tekrar dene.');
    else setReplyTo(null);
    setIsSending(false);
  };

  const handleSend = (e) => {
    if (e.key === 'ArrowDown' && document.querySelector('[data-mention-first]')) {
      e.preventDefault();
      document.querySelector('[data-mention-first]')?.focus();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && document.querySelector('[data-mention-first]')) {
      e.preventDefault();
      document.querySelector('[data-mention-first]')?.click();
      return;
    }
    if (e.key === 'ArrowUp' && !input.trim()) {
      const previousMessage = [...channelMessages].reverse().find((message) => message.user_id === user?.id && !message.isOptimistic && message.content?.trim());
      if (previousMessage) {
        e.preventDefault();
        setEditingId(previousMessage.id);
        setEditContent(previousMessage.content);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendCurrentMessage();
    }
  };

  const handleEditSave = async () => {
    if (editContent.trim() && editingId) {
      const result = await editMessage(editingId, editContent.trim());
      if (result?.success) {
        setEditingId(null);
        setEditContent('');
      } else setMessageError(result?.error || 'Message could not be edited.');
    }
  };

  const handleDelete = async (messageId) => {
    const result = await deleteMessage(messageId);
    if (!result?.success) setMessageError(result?.error || 'Message could not be deleted.');
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditContent('');
    }
  };

  const selectImageFile = (file) => {
    if (!file || isUploading || isSending) return;
    const extensionByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const fileExtension = extensionByType[file.type];
    if (!fileExtension || file.size > maxUploadBytes) {
      setUploadError(`PNG, JPEG, WebP veya GIF görseli seç; dosya ${(maxUploadBytes / 1024 / 1024).toFixed(0)} MB sınırını aşmamalı.`);
      return;
    }
    if (!user?.id) {
      setUploadError('Görsel yüklemek için yeniden giriş yap.');
      return;
    }

    setUploadError('');
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
  };

  const handleFileUpload = (event) => {
    selectImageFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleImagePaste = (event) => {
    const file = getClipboardImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    selectImageFile(file);
  };

  if (!activeChannelId) return null;

  return (
    <div className="macos-chat relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,.055),_transparent_48%),#0B0E14]">
      <div className="macos-chat-header z-10 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0b0e14]/65 px-4 shadow-sm backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setIsProfileOpen(true)} title="Profili görüntüle" className="shrink-0 rounded-full"><img src={avatarUrl} className="w-7 h-7 rounded-full object-cover" alt="Avatar" /></button>
              <button type="button" onClick={() => setIsProfileOpen(true)} className="truncate font-bold text-slate-200 hover:text-violet-200">{channelName}</button>
          </div>
          <div className="flex items-center gap-2">
            {callStatus && <span role="status" className="hidden text-[11px] text-violet-200 sm:inline">{callStatus}</span>}
            <button type="button" aria-label="Sesli ara" title="Sesli ara" onClick={() => void startDMCall()} className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.08] p-2 text-emerald-200 transition hover:bg-emerald-400/[0.16]"><Phone className="h-4 w-4" /></button>
            <button type="button" aria-label="Kullanıcı bilgilerini göster" aria-pressed={isInfoOpen} onClick={() => setIsInfoOpen((open) => !open)} className={`rounded-xl p-2 transition ${isInfoOpen ? 'bg-violet-400/15 text-violet-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}><PanelRight className="h-4 w-4" /></button>
          </div>
      </div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col relative overflow-hidden">
          <div ref={chatScrollRef} onScroll={(event) => {
            const element = event.currentTarget;
            shouldAutoScroll.current = element.scrollHeight - element.clientHeight - element.scrollTop < 96;
          }} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 flex flex-col custom-scrollbar">
             
              {channelMessages.length === 0 && isLoading && (
                <div role="status" aria-label="Mesajlar yükleniyor" className="mt-auto space-y-4 pb-4">
                  <div className="mb-3 text-xs text-slate-500">Sohbet hazırlanıyor…</div>
                  {[0, 1, 2].map((item) => <div key={item} className="flex animate-pulse items-center gap-3"><div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.07]" /><div className="flex-1 space-y-2"><div className="h-3 w-28 rounded bg-white/[0.07]" /><div className={`h-3 rounded bg-white/[0.05] ${item === 1 ? 'w-2/5' : 'w-3/5'}`} /></div></div>)}
                </div>
              )}
              {channelMessages.length === 0 && !isLoading && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4 flex items-start gap-4 mt-auto">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400"><Info className="w-5 h-5"/></div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-400 mb-1">@{channelName} ile özel mesajlaşmaya başla!</h3>
                    <p className="text-xs text-slate-400">Bu sohbetin ilk mesajını sen gönder.</p>
                  </div>
                </div>
             )}

             <div className="flex flex-col min-w-0">
               {channelMessages.map((m, index) => {
                   const isSelf = m.user_id === user?.id;
                   const msgDate = new Date(m.created_at);
                   const time = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                   const profile = m.profiles || {};
                   const isMentioned = mentionFlags[index];
                   const isGrouped = messageGroupSizes[index] > 1;
                   const hasMentionAbove = isMentioned && isGrouped && mentionFlags[index - 1];
                   const hasMentionBelow = isMentioned && messageGroupSizes[index + 1] > 1 && mentionFlags[index + 1];
                   const mentionHighlightClass = isMentioned
                     ? `border-x border-amber-300/35 bg-amber-300/[0.10] ${hasMentionAbove ? '' : 'border-t rounded-t-xl'} ${hasMentionBelow ? '' : 'border-b rounded-b-xl'}`
                     : '';

                   const renderMessageContent = () => {
                     if (editingId === m.id) {
                       return (
                         <div className="mt-1">
                           <div className="bg-[#1e2430] p-2 rounded-lg border border-violet-500/50">
                             <input 
                               autoFocus
                               value={editContent}
                               onChange={e => setEditContent(e.target.value)}
                               onKeyDown={handleEditKeyDown}
                               className="w-full bg-transparent text-slate-200 text-sm outline-none"
                             />
                           </div>
                           <div className="text-[10px] text-slate-400 mt-1">
                             İptal etmek için <kbd className="bg-white/10 px-1 rounded">ESC</kbd>, kaydetmek için <kbd className="bg-white/10 px-1 rounded">Enter</kbd> tuşuna bas.
                           </div>
                         </div>
                       );
                     }
                     return <>
                       {m.reply_to && <button type="button" onClick={() => jumpToMessage(m.reply_to.id)} className="mb-1.5 max-w-full border-l-2 border-violet-300/60 pl-2 text-left text-xs text-slate-400 hover:text-violet-200"><span className="font-semibold text-violet-200">{m.reply_to.username}</span><span className="ml-2 line-clamp-1">{m.reply_to.content || 'Ek'}</span></button>}
                       <div className={`min-w-0 text-sm text-slate-300 ${isGrouped ? 'leading-5' : 'mt-0.5 leading-relaxed'}`}><FormattedMessage content={m.content || ''} userMap={mentionUserMap} onUserClick={(profile) => setViewedProfile(profile)} onPublicProfileClick={(profile) => setViewedProfile(profile)} onInviteClick={onInviteClick} />{m.is_edited && <span className="ml-1 select-none text-[10px] text-slate-500">(düzenlendi)</span>}</div>
                     </>;
                   };

                   const actionButtons = !m.isOptimistic && (
                     <div className="pointer-events-auto absolute right-3 top-1 z-20 flex -translate-y-1/2 items-center gap-0.5 rounded-xl border border-white/10 bg-[#151b27]/90 p-1 opacity-100 shadow-xl backdrop-blur-xl transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:focus-within:pointer-events-auto sm:focus-within:opacity-100">
                       <MessageReactions pickerOnly reactions={m.reactions} currentUserId={user?.id} onToggle={(emoji) => toggleReaction(activeChannelId, m.id, emoji)} />
                       <CopyMessageButton content={m.content} />
                       <SaveMessageButton userId={user?.id} message={m} sourceType="dm" channelName={channelName} author={profile.username} />
                       <button type="button" onClick={() => setReplyTo({ id: m.id, user_id: m.user_id, username: profile.username || 'Kullanıcı', content: m.content || '' })} aria-label="Mesajı yanıtla" title="Yanıtla" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><Reply className="h-3.5 w-3.5" /></button>
                       <button type="button" onClick={() => setForwardingMessage(m)} aria-label="Mesajı ilet" title="İlet" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><Forward className="h-3.5 w-3.5" /></button>
                       {isSelf && <button type="button" onClick={() => { setEditingId(m.id); setEditContent(m.content); }} aria-label="Mesajı düzenle" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white" title="Mesajı düzenle">
                         <Pencil className="w-3.5 h-3.5" />
                       </button>
                       }
                       {isSelf && <button type="button" onClick={() => handleDelete(m.id)} aria-label="Mesajı sil" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-500/20 hover:text-rose-300" title="Mesajı sil">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>}
                     </div>
                   );

                   if (isGrouped) {
                     return (
                        <div id={`message-${m.id}`} key={m.id} className={`flex gap-3 hover:bg-white/5 px-2 py-0 group transition-colors relative min-w-0 ${mentionHighlightClass} ${m.isOptimistic ? 'opacity-50' : 'opacity-100'} ${editingId === m.id ? 'bg-white/5' : ''}`}>
                         <div className="w-10 min-w-[2.5rem] shrink-0 flex items-center justify-end pr-1">
                            <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity select-none">{time}</span>
                         </div>
                         <div className="flex flex-col flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
                             {renderMessageContent()}
                             {m.image_url && <AttachmentImage imagePath={m.image_url} />}
                             {m.reactions?.length > 0 && <MessageReactions reactions={m.reactions} currentUserId={user?.id} onToggle={(emoji) => toggleReaction(activeChannelId, m.id, emoji)} />}
                         </div>
                         {actionButtons}
                       </div>
                     );
                   }

                   return (
                    <div id={`message-${m.id}`} key={m.id} className={`flex gap-3 hover:bg-white/5 px-2 py-1.5 mt-2 ${isMentioned ? '' : 'rounded-xl'} group transition-colors relative min-w-0 ${mentionHighlightClass} ${m.isOptimistic ? 'opacity-50' : 'opacity-100'} ${editingId === m.id ? 'bg-white/5' : ''}`}>
                      <button type="button" onClick={() => profile.id && void fetchProfile(profile.id).then((value) => { if (value) setViewedProfile(value); })} title="Profili görüntüle" className="h-10 w-10 shrink-0 rounded-full"><img src={getAvatarUrl(profile.avatar_url, profile.username)} className="h-10 w-10 rounded-full bg-slate-800 object-cover" alt="Avatar" /></button>
                      <div className="flex flex-col flex-1 min-w-0 break-words [overflow-wrap:anywhere]">
                          <div className="flex items-baseline gap-2">
                            <button type="button" onClick={() => profile.id && void fetchProfile(profile.id).then((value) => { if (value) setViewedProfile(value); })} className={`text-sm font-bold hover:underline ${isSelf ? 'text-emerald-400' : 'text-slate-200'}`}>{profile.username || 'Bilinmeyen'}</button>
                            <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity select-none">{time}</span>
                          </div>
                          {renderMessageContent()}
                          {m.image_url && <AttachmentImage imagePath={m.image_url} />}
                          {m.reactions?.length > 0 && <MessageReactions reactions={m.reactions} currentUserId={user?.id} onToggle={(emoji) => toggleReaction(activeChannelId, m.id, emoji)} />}
                      </div>
                      {actionButtons}
                    </div>
                   );
               })}
             </div>
          </div>
          
          <div className="macos-message-composer shrink-0 border-t border-white/[0.04] px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-5">
              {(typingUsers.length > 0 || latestMessageWasRead) && <div aria-live="polite" className="mx-auto mb-1.5 flex h-5 w-full max-w-6xl items-center gap-2 px-1 text-[11px] text-slate-400">{typingUsers.length > 0 ? <><span className="flex items-center gap-0.5" aria-hidden="true"><i className="h-1 w-1 animate-bounce rounded-full bg-violet-300 [animation-delay:-.2s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-violet-300 [animation-delay:-.1s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-violet-300" /></span><b className="font-semibold text-slate-300">{typingUsers[0].username}</b> yazıyor{typingUsers.length > 1 ? ` ve ${typingUsers.length - 1} kişi daha` : ''}</> : <span className="text-emerald-200/70">Görüldü</span>}</div>}
              {input.trimStart().startsWith('/') && <p className="mx-auto mb-1.5 w-full max-w-6xl px-2 text-[10px] text-violet-200/70">Komutlar: <code>/me</code> · <code>/shrug</code> · <code>/tableflip</code> · <code>/help</code></p>}
              {uploadError && <p role="alert" className="mb-2 text-xs text-rose-400">{uploadError}</p>}
              {messageError && <p role="alert" className="mb-2 text-xs text-rose-400">{messageError}</p>}
              {commandNotice && <p role="status" className="mb-2 rounded-lg border border-violet-200/10 bg-violet-300/[0.045] px-3 py-2 text-[10px] text-violet-100/80">{commandNotice}</p>}
              {replyTo && <div className="mx-auto mb-2 flex w-full max-w-6xl items-center gap-2 rounded-xl border border-violet-300/15 bg-violet-400/[0.06] px-3 py-2 text-xs"><Reply className="h-3.5 w-3.5 text-violet-200" /><span className="min-w-0 flex-1 truncate text-slate-300"><b className="text-violet-200">{replyTo.username}</b> kişisine yanıt veriyorsun · {replyTo.content || 'Ek'}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Yanıtı iptal et" className="rounded p-1 text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button></div>}
              {selectedFile && <div className="mx-auto mb-2 w-full max-w-6xl rounded-xl border border-violet-300/15 bg-violet-400/[0.06] p-2.5">
                <div className="flex items-center gap-3"><img src={mediaPreviewUrl} alt="Gönderilecek medya önizlemesi" className="h-11 w-14 shrink-0 rounded-lg bg-black/20 object-cover" /><span className="min-w-0 flex-1 truncate text-xs text-slate-200">{selectedFile.name}<span className="ml-2 text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span></span>{isUploading ? <span className="text-[11px] text-violet-200">{uploadProgress}%</span> : <button type="button" aria-label="Seçilen medyayı kaldır" onClick={clearSelectedFile} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>}</div>
                {isUploading && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width]" style={{ width: `${uploadProgress}%` }} /></div>}
              </div>}
              <form onSubmit={(event) => { event.preventDefault(); void sendCurrentMessage(); }} className="relative mx-auto w-full max-w-6xl">
                <MentionSuggestions value={input} allowedUserIds={mentionUserIds} onSelect={(token, start) => { const next = `${input.slice(0, start)}${token} ${input.slice(input.length)}`; setDraft(activeChannelId, next); inputRef.current?.focus(); }} />
                <div className="macos-composer group/composer flex min-w-0 items-end gap-1.5 rounded-2xl border border-white/10 bg-[#121824]/75 p-2 shadow-[0_12px_48px_rgba(0,0,0,.32),inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-2xl transition-all focus-within:border-violet-300/35 focus-within:bg-[#171e2a]/90 focus-within:shadow-[0_0_0_3px_rgba(167,139,250,.08),0_16px_56px_rgba(0,0,0,.4)]">
                    <button type="button" disabled={isUploading || isSending} onClick={() => fileInputRef.current?.click()} aria-label="Görsel yükle" title="Görsel yükle" className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40">
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileUpload} />
                    <div className="relative min-h-9 min-w-0 w-0 flex-1">
                      <div ref={inputPreviewRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden px-2 py-2 text-sm leading-5 text-slate-100 [overflow-wrap:anywhere]">
                        {input ? <FormattedMessage content={input} userMap={mentionUserMap} showSyntax /> : <span className="text-slate-500">@{channelName} kullanıcısına mesaj gönder…</span>}
                      </div>
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(event) => { const value = event.target.value; setDraft(activeChannelId, value); setIsTypingNow(Boolean(value.trim())); window.clearTimeout(typingTimerRef.current); if (value.trim()) typingTimerRef.current = window.setTimeout(() => setIsTypingNow(false), 1400); }}
                        onKeyDown={handleSend}
                        onPaste={handleImagePaste}
                        onScroll={(event) => { if (inputPreviewRef.current) inputPreviewRef.current.scrollTop = event.currentTarget.scrollTop; }}
                        disabled={isUploading || isSending}
                        className="relative z-10 block max-h-36 min-h-9 w-full resize-none overflow-y-auto bg-transparent px-2 py-2 text-sm leading-5 text-transparent caret-slate-100 outline-none selection:bg-violet-300/25 selection:text-transparent [-webkit-text-fill-color:transparent] disabled:opacity-60"
                        placeholder={`@${channelName} kullanıcısına mesaj gönder…`}
                      />
                    </div>
                    <ComposerMediaPicker
                      key={user?.id || 'anonymous'}
                      userId={user?.id}
                      disabled={isUploading || isSending}
                      onEmoji={(emoji) => { setDraft(activeChannelId, `${input}${emoji}`); inputRef.current?.focus(); }}
                      onGif={sendGif}
                    />
                    <button type="submit" disabled={(!input.trim() && !selectedFile) || isUploading || isSending} aria-label="Mesaj gönder" title="Mesaj gönder" className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </div>
              </form>
          </div>
      </div>
      {isInfoOpen && <aside className="absolute inset-y-0 right-0 z-30 w-72 shrink-0 overflow-y-auto border-l border-white/[0.07] bg-[#10151e]/95 p-5 shadow-2xl backdrop-blur-2xl custom-scrollbar md:static md:z-auto md:bg-[#10151e]/75 md:shadow-none"><div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"><div className="h-24 bg-gradient-to-br from-violet-500/30 via-indigo-400/10 to-cyan-300/10">{getBannerUrl(dmProfile?.banner_url) && <img src={getBannerUrl(dmProfile.banner_url)} alt="" className="h-full w-full object-cover" />}</div><button type="button" onClick={() => setIsProfileOpen(true)} className="-mt-9 ml-4 block rounded-2xl border-4 border-[#10151e]"><img src={getAvatarUrl(dmProfile?.avatar_url || avatarUrl, channelName)} alt="" className="h-16 w-16 rounded-xl object-cover" /></button><div className="p-4 pt-2"><h2 className="truncate font-bold text-white">{dmProfile?.username || channelName}</h2><p className="mt-1 text-xs text-slate-500">Fastlynox kullanıcısı</p>{dmProfile?.bio && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-5 text-slate-300">{dmProfile.bio}</p>}<div className="my-4 h-px bg-white/[0.07]" /><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bu sohbette</div><div className="mt-2 flex justify-between text-xs text-slate-300"><span>Mesaj</span><span>{channelMessages.length}</span></div><div className="mt-1 flex justify-between text-xs text-slate-300"><span>Paylaşılan medya</span><span>{channelMessages.filter((message) => message.image_url).length}</span></div><button type="button" onClick={() => setIsProfileOpen(true)} className="mt-4 w-full rounded-xl border border-violet-300/15 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-400/15">Profili görüntüle</button></div></div></aside>}
      </div>
      {isProfileOpen && dmProfile && <UserProfileModal profile={dmProfile} role={null} onClose={() => setIsProfileOpen(false)} />}
      {viewedProfile && <UserProfileModal profile={viewedProfile} role={null} onClose={() => setViewedProfile(null)} />}
      {forwardingMessage && <ForwardMessageModal message={forwardingMessage} onClose={() => setForwardingMessage(null)} />}
      {incomingCallInvite?.dm_channel_id === activeChannelId && <div className="fixed inset-0 z-[220] grid place-items-center bg-black/60 p-4 backdrop-blur-md"><section role="dialog" aria-modal="true" aria-labelledby="dm-call-title" className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#151a24]/95 p-6 text-center shadow-2xl"><img src={getAvatarUrl(otherUser?.avatar_url, channelName)} alt="" className="mx-auto h-16 w-16 rounded-2xl object-cover ring-4 ring-emerald-300/10" /><h2 id="dm-call-title" className="mt-4 text-lg font-bold text-white">{channelName} arıyor</h2><p className="mt-1 text-sm text-slate-400">Bire bir sesli arama</p><div className="mt-6 flex justify-center gap-3"><button type="button" onClick={() => void declineDMCall()} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/15 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-400/20"><PhoneOff className="h-4 w-4" /> Reddet</button><button type="button" onClick={() => void acceptDMCall()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"><Phone className="h-4 w-4" /> Kabul et</button></div></section></div>}
    </div>
  );
}
