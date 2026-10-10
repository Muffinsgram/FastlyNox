import { getClipboardImage } from '../../../lib/clipboardImage';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Hash, Info, Plus, Loader2, Pencil, Trash2, Send, X, Reply, Forward, BarChart3, CalendarClock, MessageSquareText, ImagePlus, Copy, UserRound } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { uploadStorageFile } from '../../../lib/storageUpload';
import { useAuthStore } from '../../../store/useAuthStore';
import { useChatStore } from '../../../store/useChatStore';
import { fetchProfile, fetchProfiles, getAvatarUrl } from '../../../lib/profileMedia';
import { AttachmentImage } from './AttachmentImage';
import { MessageReactions } from './MessageReactions';
import { ComposerMediaPicker } from './ComposerMediaPicker';
import { CopyMessageButton } from './CopyMessageButton';
import { readDraft } from '../../../lib/draftStorage';
import { MentionSuggestions } from './MentionSuggestions';
import { ForwardMessageModal } from './ForwardMessageModal';
import { UserProfileModal } from '../../../components/layout/UserProfileModal';
import { useServerStore } from '../../../store/useServerStore';
import { jumpToMessage } from '../../../lib/messageNavigation';
import { SaveMessageButton } from './SaveMessageButton';
import { ChannelPollsModal } from './ChannelPollsModal';
import { MessageThreadModal } from './MessageThreadModal';
import { ScheduleMessageModal } from './ScheduleMessageModal';
import { useChatPresence } from '../../../hooks/useChatPresence';
import { ActionContextMenu } from '../../../components/layout/ActionContextMenu';
import { FormattedMessage } from './FormattedMessage';
import { useUploadLimit } from '../../../hooks/useUploadLimit';
import { COMMAND_HELP, resolveChatCommand } from '../../../lib/chatCommands';

const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

export function ChatArea({ activeChannelId, channelName, onOpenChannelMention, onInviteClick }) {
  const { user } = useAuthStore();
  const maxUploadBytes = useUploadLimit('attachments', user?.id);
  const { messages, drafts, isLoading, setDraft, clearDraft, fetchMessages, subscribeToChannel, unsubscribe, sendMessage, editMessage, deleteMessage, toggleReaction } = useChatStore();
  const input = drafts[activeChannelId] ?? readDraft(user?.id, `server:${activeChannelId}`) ?? '';
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
  const [threadMessage, setThreadMessage] = useState(null);
  const [showPolls, setShowPolls] = useState(false);
  const [showComposerMenu, setShowComposerMenu] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [viewedProfile, setViewedProfile] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [messagePermission, setMessagePermission] = useState({ serverId: null, allowed: false });
  const [isTypingNow, setIsTypingNow] = useState(false);
  const typingTimerRef = useRef(null);
  const activeServerId = useServerStore((state) => state.activeServerId);
  const activeServer = useServerStore((state) => state.servers.find((server) => server.id === state.activeServerId));
  const serverDirectory = useServerStore((state) => state.servers);
  const canManageMessages = activeServer?.owner_id === user?.id || activeServer?.member_role === 'admin' || activeServer?.member_role === 'owner' || (messagePermission.serverId === activeServerId && messagePermission.allowed);
  const allowEveryone = activeServer?.owner_id === user?.id || activeServer?.member_role === 'admin' || activeServer?.member_role === 'owner';
  const allowAllRoleMentions = allowEveryone;
  const [serverMembers, setServerMembers] = useState({ serverId: null, ids: [], profiles: {}, roles: [], assignedRoleIds: [], roleAssignments: {} });
  const memberIds = serverMembers.serverId === activeServerId ? serverMembers.ids : [];
  const mentionProfiles = serverMembers.serverId === activeServerId ? serverMembers.profiles : EMPTY_OBJECT;
  const mentionRoles = serverMembers.serverId === activeServerId ? serverMembers.roles : EMPTY_ARRAY;
  const assignedRoleIds = serverMembers.serverId === activeServerId ? (serverMembers.roleAssignments[user?.id] || serverMembers.assignedRoleIds) : EMPTY_ARRAY;
  const mentionChannels = useMemo(() => activeServer?.categories?.flatMap((category) => category.channels || []) || [], [activeServer]);
  const channelDirectory = useMemo(() => serverDirectory.flatMap((server) => (server.categories || []).flatMap((category) => (category.channels || []).map((channel) => ({ ...channel, serverName: server.name, server_id: server.id })))), [serverDirectory]);
  const mentionUserMap = useMemo(() => Object.fromEntries(Object.values(mentionProfiles).flatMap((profile) => [[profile.id, profile], ...(profile.public_id ? [[String(profile.public_id), profile]] : [])])), [mentionProfiles]);
  const mentionRoleMap = useMemo(() => Object.fromEntries(mentionRoles.flatMap((role) => [[role.id, role], ...(role.public_id ? [[String(role.public_id), role]] : [])])), [mentionRoles]);
  const mentionChannelMap = useMemo(() => Object.fromEntries(channelDirectory.flatMap((channel) => [[channel.id, channel], ...(channel.public_id ? [[String(channel.public_id), channel]] : [])])), [channelDirectory]);

  useEffect(() => {
    let active = true;
    if (!activeServerId) return undefined;
    const loadServerMemberData = async () => {
      const [memberResult, roleResult, assignmentResult] = await Promise.all([
        supabase.from('server_members').select('user_id').eq('server_id', activeServerId),
        supabase.from('server_roles').select('id,public_id,name,color,position,mentionable,emoji,gradient_color,animated').eq('server_id', activeServerId).order('position', { ascending: false }).order('id', { ascending: true }),
        supabase.from('server_member_roles').select('user_id,role_id').eq('server_id', activeServerId),
      ]);
      if (!active) return;
      const ids = (memberResult.data || []).map((member) => member.user_id);
      const profiles = ids.length ? await fetchProfiles(ids) : [];
      const roleAssignments = {};
      (assignmentResult.data || []).forEach(({ user_id, role_id }) => { (roleAssignments[user_id] ||= []).push(role_id); });
      if (active) setServerMembers({ serverId: activeServerId, ids, profiles: Object.fromEntries((profiles || []).map((profile) => [profile.id, profile])), roles: roleResult.data || [], assignedRoleIds: roleAssignments[user?.id] || [], roleAssignments });
    };
    void loadServerMemberData();
    const channel = supabase.channel(`chat-role-colors:${activeServerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_member_roles', filter: `server_id=eq.${activeServerId}` }, () => void loadServerMemberData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_roles', filter: `server_id=eq.${activeServerId}` }, () => void loadServerMemberData())
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [activeServerId, user?.id]);

  useEffect(() => {
    if (!activeServerId || !user?.id || activeServer?.owner_id === user.id || activeServer?.member_role === 'admin' || activeServer?.member_role === 'owner') return undefined;
    let current = true;
    void supabase.rpc('has_server_permission', { server_uuid: activeServerId, permission_key: 'manage_messages' })
      .then(({ data, error }) => { if (current) setMessagePermission({ serverId: activeServerId, allowed: !error && data === true }); });
    return () => { current = false; };
  }, [activeServerId, activeServer, user?.id]);

  const channelMessages = useMemo(() => messages[activeChannelId] || [], [messages, activeChannelId]);
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
    const directIds = [...(message.content || '').matchAll(/<@!?([0-9a-f-]{36}|[0-9]+)>/giu)].map((match) => match[1]);
    const roleIds = [...(message.content || '').matchAll(/<@&([0-9a-f-]{36}|[0-9]+)>/giu)].map((match) => match[1]);
    const ownPublicId = mentionProfiles[user?.id]?.public_id;
    const assignedPublicIds = mentionRoles.filter((role) => assignedRoleIds.includes(role.id)).map((role) => String(role.public_id));
    return tokens.some((mention) => mention.slice(1).toLowerCase() === user?.username?.toLowerCase() || mention.toLowerCase() === '@everyone') || directIds.includes(user?.id) || directIds.includes(String(ownPublicId)) || roleIds.some((roleId) => assignedRoleIds.includes(roleId) || assignedPublicIds.includes(roleId));
  }), [channelMessages, user?.username, user?.id, assignedRoleIds, mentionProfiles, mentionRoles]);
  const latestIncomingAt = useMemo(() => [...channelMessages].reverse().find((message) => message.user_id !== user?.id && !message.isOptimistic)?.created_at || null, [channelMessages, user?.id]);
  const { typingUsers } = useChatPresence({ scope: `server:${activeChannelId}`, user, isTyping: isTypingNow, lastReadAt: latestIncomingAt });

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

  const buildMessageMenuItems = (message) => {
    if (!message) return [];
    const isSelf = message.user_id === user?.id;
    const profile = message.profiles || {};
    return [
      { id: 'reply', label: 'Yanıtla', icon: Reply, onSelect: () => setReplyTo({ id: message.id, user_id: message.user_id, username: profile.username || 'Kullanıcı', content: message.content || '' }) },
      { id: 'forward', label: 'İlet', icon: Forward, onSelect: () => setForwardingMessage(message) },
      { id: 'copy', label: 'Mesaj metnini kopyala', icon: Copy, disabled: !message.content, onSelect: async () => {
        try { await navigator.clipboard.writeText(message.content || ''); setMessageError('Mesaj metni kopyalandı.'); }
        catch { setMessageError('Metin kopyalanamadı. Tarayıcı pano iznini kontrol et.'); }
      } },
      { id: 'copy-user-id', label: 'Gönderen kimliğini kopyala', icon: Copy, onSelect: async () => {
        try { await navigator.clipboard.writeText(message.user_id); setMessageError('Kullanıcı kimliği kopyalandı.'); }
        catch { setMessageError('Kimlik kopyalanamadı. Tarayıcı pano iznini kontrol et.'); }
      } },
      { id: 'copy-message-id', label: 'Mesaj kimliğini kopyala', icon: Copy, onSelect: async () => {
        try { await navigator.clipboard.writeText(message.id); setMessageError('Mesaj kimliği kopyalandı.'); }
        catch { setMessageError('Kimlik kopyalanamadı. Tarayıcı pano iznini kontrol et.'); }
      } },
      { id: 'profile', label: 'Gönderenin profilini görüntüle', icon: UserRound, onSelect: () => { const profileId = profile.id || message.user_id; if (profileId) void fetchProfile(profileId).then((value) => setViewedProfile(value)); } },
      ...((isSelf || canManageMessages) ? [
        { separator: true },
        ...(isSelf ? [{ id: 'edit', label: 'Mesajı düzenle', icon: Pencil, onSelect: () => { setEditingId(message.id); setEditContent(message.content || ''); } }] : []),
        { id: 'delete', label: isSelf ? 'Mesajını sil' : 'Mesajı yönetici olarak sil', icon: Trash2, danger: true, onSelect: () => void handleDelete(message.id) },
      ] : []),
    ];
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
    <div className="macos-chat flex min-h-0 min-w-0 flex-1 flex-col relative bg-fastcord-bg">
      <div className="macos-chat-header h-12 border-b border-white/5 flex items-center px-4 shrink-0 justify-between bg-fastcord-bg z-10 shadow-sm">
          <div className="flex items-center gap-3">
              <Hash className="w-5 h-5 text-slate-400" />
              <span className="font-bold text-slate-200">{channelName}</span>
          </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col relative overflow-hidden">
          <div ref={chatScrollRef} onScroll={(event) => {
            const element = event.currentTarget;
            shouldAutoScroll.current = element.scrollHeight - element.clientHeight - element.scrollTop < 96;
          }} className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4 flex flex-col custom-scrollbar">
             
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
                    <h3 className="text-sm font-bold text-emerald-400 mb-1">#{channelName} kanalına hoş geldin!</h3>
                    <p className="text-xs text-slate-400">Bu kanalın ilk mesajını sen gönder.</p>
                  </div>
                </div>
             )}

             <div className="flex min-w-0 w-full flex-col">
               {channelMessages.map((m, index) => {
                   const isSelf = m.user_id === user?.id;
                   const msgDate = new Date(m.created_at);
                   const time = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                   const profile = m.profiles || {};
                   const authorRoleIds = serverMembers.serverId === activeServerId ? (serverMembers.roleAssignments[profile.id || m.user_id] || []) : [];
                   const authorRole = mentionRoles.find((role) => authorRoleIds.includes(role.id));
                   const authorNameStyle = authorRole?.gradient_color
                     ? { backgroundImage: `linear-gradient(100deg, ${authorRole.color}, ${authorRole.gradient_color}, ${authorRole.color})`, backgroundSize: '180% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
                     : { color: authorRole?.color || '#e2e8f0' };
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
                       <div className={`min-w-0 text-sm text-slate-300 ${isGrouped ? 'leading-5' : 'mt-0.5 leading-relaxed'}`}><FormattedMessage content={m.content || ''} userMap={mentionUserMap} roleMap={mentionRoleMap} channelMap={mentionChannelMap} onChannelClick={onOpenChannelMention} onUserClick={(profile) => setViewedProfile(profile)} onPublicProfileClick={(profile) => setViewedProfile(profile)} onInviteClick={onInviteClick} />{m.is_edited && <span className="ml-1 select-none text-[10px] text-slate-500">(düzenlendi)</span>}</div>
                     </>;
                   };

                   const actionButtons = !m.isOptimistic && (
                     <div className="pointer-events-auto absolute right-3 top-1 z-20 flex -translate-y-1/2 items-center gap-0.5 rounded-xl border border-white/10 bg-[#151b27]/90 p-1 opacity-100 shadow-xl backdrop-blur-xl transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:focus-within:pointer-events-auto sm:focus-within:opacity-100">
                       <MessageReactions pickerOnly reactions={m.reactions} currentUserId={user?.id} onToggle={(emoji) => toggleReaction(activeChannelId, m.id, emoji)} />
                       <CopyMessageButton content={m.content} />
                       <SaveMessageButton userId={user?.id} message={m} sourceType="server" channelName={channelName} author={profile.username} />
                       <button type="button" onClick={() => setReplyTo({ id: m.id, user_id: m.user_id, username: profile.username || 'Kullanıcı', content: m.content || '' })} aria-label="Mesajı yanıtla" title="Yanıtla" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><Reply className="h-3.5 w-3.5" /></button>
                       <button type="button" onClick={() => setThreadMessage(m)} aria-label="Mesaj başlığını aç" title="Başlıkta yanıtla" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><MessageSquareText className="h-3.5 w-3.5" /></button>
                       <button type="button" onClick={() => setForwardingMessage(m)} aria-label="Mesajı ilet" title="İlet" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><Forward className="h-3.5 w-3.5" /></button>
                       {isSelf && <button type="button" onClick={() => { setEditingId(m.id); setEditContent(m.content); }} aria-label="Mesajı düzenle" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white" title="Mesajı düzenle">
                         <Pencil className="w-3.5 h-3.5" />
                       </button>
                       }
                       {(isSelf || canManageMessages) && <button type="button" onClick={() => handleDelete(m.id)} aria-label="Mesajı sil" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-500/20 hover:text-rose-300" title="Mesajı sil">
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>}
                     </div>
                   );

                   if (isGrouped) {
                     return (
                        <div id={`message-${m.id}`} key={m.id} onContextMenu={(event) => { if (m.isOptimistic) return; event.preventDefault(); setMessageContextMenu({ x: event.clientX, y: event.clientY, message: m }); }} className={`flex min-w-0 max-w-full gap-3 hover:bg-white/5 px-2 py-0 group transition-colors relative ${mentionHighlightClass} ${m.isOptimistic ? 'opacity-50' : 'opacity-100'} ${editingId === m.id ? 'bg-white/5' : ''}`}>
                         <div className="w-10 min-w-[2.5rem] shrink-0 flex items-center justify-end pr-1">
                            <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity select-none">{time}</span>
                         </div>
                         <div className="flex min-w-0 max-w-full flex-1 flex-col [overflow-wrap:anywhere]">
                             {renderMessageContent()}
                             {m.image_url && <AttachmentImage imagePath={m.image_url} />}
                             {m.reactions?.length > 0 && <MessageReactions reactions={m.reactions} currentUserId={user?.id} onToggle={(emoji) => toggleReaction(activeChannelId, m.id, emoji)} />}
                         </div>
                         {actionButtons}
                       </div>
                     );
                   }

                   return (
                    <div id={`message-${m.id}`} key={m.id} onContextMenu={(event) => { if (m.isOptimistic) return; event.preventDefault(); setMessageContextMenu({ x: event.clientX, y: event.clientY, message: m }); }} className={`flex min-w-0 max-w-full gap-4 hover:bg-white/5 px-2 py-2 mt-4 ${isMentioned ? '' : 'rounded-xl'} group transition-colors relative ${mentionHighlightClass} ${m.isOptimistic ? 'opacity-50' : 'opacity-100'} ${editingId === m.id ? 'bg-white/5' : ''}`}>
                      <button type="button" onClick={() => profile.id && void fetchProfile(profile.id).then((value) => setViewedProfile(value))} title="Profili görüntüle" className="h-10 w-10 shrink-0 rounded-full"><img src={getAvatarUrl(profile.avatar_url, profile.username)} className="h-10 w-10 rounded-full bg-slate-800 object-cover" alt="Avatar" /></button>
                      <div className="flex min-w-0 max-w-full flex-1 flex-col [overflow-wrap:anywhere]">
                      <div className="flex items-baseline gap-2">
                            <button type="button" onClick={() => profile.id && void fetchProfile(profile.id).then((value) => setViewedProfile(value))} className={`text-sm font-bold hover:underline ${authorRole?.animated ? 'role-name-animated' : ''}`} style={authorNameStyle}>{profile.username || 'Bilinmeyen'}</button>
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
              {typingUsers.length > 0 && <div aria-live="polite" className="mx-auto mb-1.5 flex h-5 w-full max-w-6xl items-center gap-2 px-1 text-[11px] text-slate-400"><span className="flex items-center gap-0.5" aria-hidden="true"><i className="h-1 w-1 animate-bounce rounded-full bg-violet-300 [animation-delay:-.2s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-violet-300 [animation-delay:-.1s]" /><i className="h-1 w-1 animate-bounce rounded-full bg-violet-300" /></span><span>{typingUsers.length === 1 ? <><b className="font-semibold text-slate-300">{typingUsers[0].username}</b> yazıyor</> : typingUsers.length === 2 ? <><b className="font-semibold text-slate-300">{typingUsers[0].username}</b> ve <b className="font-semibold text-slate-300">{typingUsers[1].username}</b> yazıyor</> : `${typingUsers.length} kişi yazıyor`}</span></div>}
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
                <MentionSuggestions value={input} allowedUserIds={memberIds} allowEveryone={allowEveryone} allowAllRoles={allowAllRoleMentions} roles={mentionRoles} channels={mentionChannels} onSelect={(token, start) => { const next = `${input.slice(0, start)}${token} ${input.slice(input.length)}`; setDraft(activeChannelId, next); inputRef.current?.focus(); }} />
                <div className="macos-composer group/composer flex min-w-0 items-end gap-1.5 rounded-2xl border border-white/10 bg-[#121824]/75 p-2 shadow-[0_12px_48px_rgba(0,0,0,.32),inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-2xl transition-all focus-within:border-violet-300/35 focus-within:bg-[#171e2a]/90 focus-within:shadow-[0_0_0_3px_rgba(167,139,250,.08),0_16px_56px_rgba(0,0,0,.4)]">
                    <div className="relative mb-0.5 shrink-0">
                      <button type="button" disabled={isUploading || isSending} onClick={() => setShowComposerMenu((open) => !open)} aria-label="Medya veya anket ekle" aria-expanded={showComposerMenu} title="Medya veya anket ekle" className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40">
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </button>
                      {showComposerMenu && <div className="dropdown-surface absolute bottom-full left-0 z-[90] mb-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#171d29]/95 p-1.5 shadow-2xl backdrop-blur-2xl" style={{ transformOrigin: 'bottom left' }}><button type="button" onClick={() => { setShowComposerMenu(false); fileInputRef.current?.click(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"><ImagePlus className="h-4 w-4 text-cyan-200" /><span>Fotoğraf veya GIF yükle</span></button><button type="button" onClick={() => { setShowComposerMenu(false); setShowPolls(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-200 transition hover:bg-white/[0.07]"><BarChart3 className="h-4 w-4 text-violet-200" /><span>Anket oluştur</span></button></div>}
                    </div>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileUpload} />
                    <div className="relative min-h-9 min-w-0 w-0 flex-1">
                      <div ref={inputPreviewRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden px-2 py-2 text-sm leading-5 text-slate-100 [overflow-wrap:anywhere]">
                        {input ? <FormattedMessage content={input} userMap={mentionUserMap} roleMap={mentionRoleMap} channelMap={mentionChannelMap} showSyntax /> : <span className="text-slate-500">#{channelName} kanalına mesaj gönder…</span>}
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
                        placeholder={`#${channelName} kanalına mesaj gönder…`}
                      />
                    </div>
                    <ComposerMediaPicker
                      key={user?.id || 'anonymous'}
                      userId={user?.id}
                      disabled={isUploading || isSending}
                      onEmoji={(emoji) => { setDraft(activeChannelId, `${input}${emoji}`); inputRef.current?.focus(); }}
                      onGif={sendGif}
                    />
                    <button type="button" disabled={isUploading || isSending} onClick={() => setShowSchedule(true)} aria-label="Zamanlanmış mesajlar" title="Mesajı zamanla veya sırayı görüntüle" className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-cyan-100 disabled:opacity-35"><CalendarClock className="h-4 w-4" /></button>
                    <button type="submit" disabled={(!input.trim() && !selectedFile) || isUploading || isSending} aria-label="Mesaj gönder" title="Mesaj gönder" className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </div>
              </form>
          </div>
      </div>
      {viewedProfile && <UserProfileModal profile={viewedProfile} role={null} serverId={activeServerId} serverName={activeServer?.name} onClose={() => setViewedProfile(null)} />}
      <ActionContextMenu position={messageContextMenu} items={buildMessageMenuItems(messageContextMenu?.message)} onClose={() => setMessageContextMenu(null)} label="Mesaj işlemleri" />
      {forwardingMessage && <ForwardMessageModal message={forwardingMessage} onClose={() => setForwardingMessage(null)} />}
      {showPolls && <ChannelPollsModal channelId={activeChannelId} serverId={activeServerId} userId={user?.id} onClose={() => setShowPolls(false)} />}
      {threadMessage && <MessageThreadModal message={threadMessage} channelId={activeChannelId} user={user} onClose={() => setThreadMessage(null)} />}
      {showSchedule && <ScheduleMessageModal channelId={activeChannelId} userId={user?.id} content={input} onClose={() => setShowSchedule(false)} onScheduled={() => { clearDraft(activeChannelId); setMessageError('Mesaj zamanlandı. Fastlynox açık ve çevrimiçiyken gönderilecek.'); }} />}
    </div>
  );
}
