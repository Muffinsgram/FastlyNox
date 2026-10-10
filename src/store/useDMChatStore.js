import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { mergeFetchedMessages, mergeMessage, replaceOptimisticMessage, sortMessages } from '../lib/messageList';
import { appendReaction, MESSAGE_REACTIONS, removeReaction } from '../lib/messageReactions';
import { writeDraft } from '../lib/draftStorage';

function sendDMRealtimeSignal(channelId, payload) {
  const state = useDMChatStore.getState();
  if (state.activeSubscriptionChannelId !== channelId || !state.activeSubscription) return;
  void state.activeSubscription.send({ type: 'broadcast', event: 'dm_changed', payload }).then((status) => {
    if (status !== 'ok') console.warn(`DM canlı sinyali gönderilemedi (${channelId}):`, status);
  }).catch((error) => console.warn(`DM canlı sinyali gönderilemedi (${channelId}):`, error));
}

export const useDMChatStore = create((set, get) => ({
  messages: {},
  drafts: {},
  isLoading: false,
  requestGeneration: 0,
  fetchRequests: {},
  messageEventVersions: {},
  activeSubscription: null,
  activeSubscriptionCleanup: null,
  activeSubscriptionChannelId: null,
  subscriptionToken: 0,

  fetchMessages: async (channelId) => {
    if (!channelId) return;
    const generation = get().requestGeneration;
    const eventVersion = get().messageEventVersions[channelId] || 0;
    const requestId = (get().fetchRequests[channelId] || 0) + 1;
    const initialMessages = get().messages[channelId] || [];
    const initialIds = new Set(initialMessages.map((message) => message.id));
    set((state) => ({ isLoading: true, fetchRequests: { ...state.fetchRequests, [channelId]: requestId } }));
    
    const { data, error } = await supabase
      .from('dm_messages')
      .select(`*, profiles:user_id ( id, username, avatar_url )`)
      .eq('dm_channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (generation !== get().requestGeneration || get().fetchRequests[channelId] !== requestId) return;
    if (!error && data) {
      const current = get().messages[channelId] || [];
      const previousById = new Map(current.map((message) => [message.id, message]));
      const fetched = data.reverse().map((message) => ({ ...message, reactions: previousById.get(message.id)?.reactions || [] }));
      const arrivals = current.filter((message) => !initialIds.has(message.id) && !message.isOptimistic);
      const pendingSends = current.filter((message) => message.isOptimistic);
      const reconciled = mergeFetchedMessages([...arrivals, ...pendingSends], fetched);
      set((state) => ({ messages: { ...state.messages, [channelId]: reconciled }, isLoading: false }));
      if ((get().messageEventVersions[channelId] || 0) !== eventVersion) {
        window.setTimeout(() => {
          if (generation === get().requestGeneration) void get().fetchMessages(channelId);
        }, 150);
        return;
      }
      const messageIds = data.map((message) => message.id);
      if (messageIds.length) {
        const { data: reactions, error: reactionError } = await supabase.from('dm_message_reactions')
          .select('id, message_id, dm_channel_id, user_id, emoji').eq('dm_channel_id', channelId).in('message_id', messageIds);
        if (generation !== get().requestGeneration || get().fetchRequests[channelId] !== requestId) return;
        if (reactionError) console.warn('DM tepkileri eşitlenemedi:', reactionError.message);
        else {
          const reactionsByMessage = new Map();
          (reactions || []).forEach((reaction) => reactionsByMessage.set(reaction.message_id, [...(reactionsByMessage.get(reaction.message_id) || []), reaction]));
          set((state) => ({ messages: {
            ...state.messages,
            [channelId]: (state.messages[channelId] || []).map((message) => messageIds.includes(message.id)
              ? { ...message, reactions: reactionsByMessage.get(message.id) || [] }
              : message),
          } }));
        }
      }
    } else {
      console.error('DM mesajları yüklenemedi:', error?.message || 'Bilinmeyen veritabanı hatası');
      set({ isLoading: false });
    }
  },

  // A small live tail query is a recovery path for clients where the
  // Realtime publication/policy is misconfigured. Broadcast and postgres
  // changes remain the immediate path; this keeps an open DM self-healing.
  fetchRecentMessages: async (channelId) => {
    if (!channelId || document.visibilityState !== 'visible') return;
    const { data, error } = await supabase.from('dm_messages')
      .select('*, profiles:user_id ( id, username, avatar_url )')
      .eq('dm_channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error || !data?.length) return;
    const recent = data.reverse();
    set((state) => {
      const current = state.messages[channelId] || [];
      const incoming = new Map(recent.map((message) => [message.id, message]));
      const merged = current.map((message) => {
        const update = incoming.get(message.id);
        if (!update) return message;
        incoming.delete(message.id);
        return { ...message, ...update, reactions: update.reactions || message.reactions };
      });
      return { messages: { ...state.messages, [channelId]: sortMessages([...merged, ...incoming.values()]) } };
    });
  },

  bumpMessageEvent: (channelId) => set((state) => ({ messageEventVersions: { ...state.messageEventVersions, [channelId]: (state.messageEventVersions[channelId] || 0) + 1 } })),

  receiveRealtimeMessage: (channelId, message, profile = null) => {
    if (!channelId || !message?.id) return;
    get().bumpMessageEvent(channelId);
    set((state) => {
      const current = state.messages[channelId] || [];
      const existing = current.find((item) => item.id === message.id);
      const incoming = { ...message, profiles: profile || message.profiles || existing?.profiles || null, isOptimistic: false };
      const messages = existing
        ? current.map((item) => item.id === message.id ? { ...item, ...incoming } : item)
        : mergeMessage(current, incoming);
      return { messages: { ...state.messages, [channelId]: messages } };
    });
  },

  removeRealtimeMessage: (channelId, messageId) => {
    if (!channelId || !messageId) return;
    get().bumpMessageEvent(channelId);
    set((state) => ({ messages: { ...state.messages, [channelId]: (state.messages[channelId] || []).filter((message) => message.id !== messageId) } }));
  },

  subscribeToChannel: (channelId) => {
    if (!channelId) return;
    const generation = get().requestGeneration;
    const subscriptionToken = get().subscriptionToken + 1;
    set({ subscriptionToken });
    
    const { activeSubscription, activeSubscriptionCleanup } = get();
    activeSubscriptionCleanup?.();
    if (activeSubscription) void supabase.removeChannel(activeSubscription);

    let subscription;
    let subscribedOnce = false;
    const isCurrent = () => get().subscriptionToken === subscriptionToken && generation === get().requestGeneration;
    subscription = supabase.channel(`public:dm_messages:${channelId}`, { config: { broadcast: { ack: true } } })
      .on('broadcast', { event: 'dm_changed' }, ({ payload }) => {
        if (!isCurrent() || payload?.dm_channel_id !== channelId || !payload?.id) return;
        if (payload.kind === 'delete') get().removeRealtimeMessage(channelId, payload.id);
        else void get().fetchRecentMessages(channelId);
      })
      .on('broadcast', { event: 'dm_message_delete' }, ({ payload }) => {
        if (!isCurrent() || payload?.dm_channel_id !== channelId || !payload?.id) return;
        get().removeRealtimeMessage(channelId, payload.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages', filter: `dm_channel_id=eq.${channelId}` }, async (payload) => {
        if (!isCurrent()) return;
        const newMsg = payload.new;
        const stateMessages = get().messages[channelId] || [];
        if (stateMessages.find(m => m.id === newMsg.id)) return;
        get().receiveRealtimeMessage(channelId, { ...newMsg, profiles: { id: newMsg.user_id, username: 'Yükleniyor', avatar_url: null } });
        const { data: profile } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', newMsg.user_id).single();
        if (!isCurrent()) return;
        if (profile) get().receiveRealtimeMessage(channelId, newMsg, profile);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dm_messages', filter: `dm_channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        get().bumpMessageEvent(channelId);
        set((state) => {
          const msgs = state.messages[channelId] || [];
          return { messages: { ...state.messages, [channelId]: msgs.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m) } };
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_messages', filter: `dm_channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        get().bumpMessageEvent(channelId);
        set((state) => {
          const msgs = state.messages[channelId] || [];
          return { messages: { ...state.messages, [channelId]: msgs.filter(m => m.id !== payload.old.id) } };
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_message_reactions', filter: `dm_channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === payload.new.message_id ? appendReaction(message, payload.new) : message)])) }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_message_reactions', filter: `dm_channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === payload.old.message_id ? removeReaction(message, payload.old) : message)])) }));
      })
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED' && isCurrent()) {
          if (subscribedOnce) void get().fetchMessages(channelId);
          subscribedOnce = true;
        }
        else if (isCurrent() && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) console.warn(`DM mesaj kanalı bağlantı sorunu (${channelId}):`, status, error?.message || error || 'Sunucu ayrıntı göndermedi');
      });

    // Broadcast and Postgres Changes are the immediate delivery paths. The
    // full history is refreshed if this channel reconnects; there is no
    // periodic database polling while the DM stays open.
    const refreshWhenConnected = () => { if (isCurrent() && document.visibilityState === 'visible') void get().fetchRecentMessages(channelId); };
    window.addEventListener('online', refreshWhenConnected);
    document.addEventListener('visibilitychange', refreshWhenConnected);
    set({ activeSubscription: subscription, activeSubscriptionChannelId: channelId, activeSubscriptionCleanup: () => {
      window.removeEventListener('online', refreshWhenConnected);
      document.removeEventListener('visibilitychange', refreshWhenConnected);
    } });
  },

  unsubscribe: () => {
    const { activeSubscription, activeSubscriptionCleanup } = get();
    activeSubscriptionCleanup?.();
    if (activeSubscription) void supabase.removeChannel(activeSubscription);
    set((state) => ({ activeSubscription: null, activeSubscriptionCleanup: null, activeSubscriptionChannelId: null, subscriptionToken: state.subscriptionToken + 1 }));
  },

  reset: () => {
    get().unsubscribe();
    set((state) => ({ messages: {}, drafts: {}, fetchRequests: {}, messageEventVersions: {}, isLoading: false, requestGeneration: state.requestGeneration + 1 }));
  },

  setDraft: (channelId, draft) => {
    writeDraft(useAuthStore.getState().user?.id, `dm:${channelId}`, draft);
    set((state) => ({ drafts: { ...state.drafts, [channelId]: draft } }));
  },
  clearDraft: (channelId) => {
    writeDraft(useAuthStore.getState().user?.id, `dm:${channelId}`, '');
    set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[channelId];
      return { drafts };
    });
  },

  toggleReaction: async (channelId, messageId, emoji) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId || !channelId || !messageId || !MESSAGE_REACTIONS.includes(emoji)) return { success: false, error: 'Tepki eklemek için oturum açmalısın.' };
    try {
      const { data: existing, error: lookupError } = await supabase.from('dm_message_reactions').select('id').eq('dm_channel_id', channelId).eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { data, error } = await supabase.from('dm_message_reactions').delete().eq('id', existing.id).select('id, message_id, dm_channel_id, user_id, emoji').single();
        if (error) throw error;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === messageId ? removeReaction(message, data) : message)])) }));
      } else {
        const { data, error } = await supabase.from('dm_message_reactions').insert({ dm_channel_id: channelId, message_id: messageId, user_id: userId, emoji }).select('id, message_id, dm_channel_id, user_id, emoji').single();
        if (error) throw error;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === messageId ? appendReaction(message, data) : message)])) }));
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Tepki kaydedilemedi.' };
    }
  },

  editMessage: async (messageId, newContent) => {
    try {
      const { data, error } = await supabase.from('dm_messages').update({ content: newContent, is_edited: true }).eq('id', messageId).select('id, content, is_edited').single();
      if (error) return { success: false, error: error.message };
      set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === messageId ? { ...message, ...data } : message)])) }));
      const message = Object.values(get().messages).flat().find((item) => item.id === messageId);
      if (message) sendDMRealtimeSignal(message.dm_channel_id, { id: messageId, dm_channel_id: message.dm_channel_id, kind: 'update' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Message could not be edited.' };
    }
  },

  deleteMessage: async (messageId) => {
    try {
      const dmChannelId = Object.keys(get().messages).find((channelId) => (get().messages[channelId] || []).some((message) => message.id === messageId));
      const { error } = await supabase.from('dm_messages').delete().eq('id', messageId);
      if (error) return { success: false, error: error.message };
      set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.filter((message) => message.id !== messageId)])) }));
      if (dmChannelId) sendDMRealtimeSignal(dmChannelId, { id: messageId, dm_channel_id: dmChannelId, kind: 'delete' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Message could not be deleted.' };
    }
  },

  sendMessage: async (channelId, content, imageUrl = null, replyTo = null) => {
    const user = useAuthStore.getState().user;
    if (!user || !channelId || (!content.trim() && !imageUrl)) return { success: false, error: 'Message is empty or you are signed out.' };

    const tempId = `temp-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const tempMsg = { id: tempId, dm_channel_id: channelId, user_id: user.id, content, image_url: imageUrl, reply_to: replyTo, created_at: new Date().toISOString(), profiles: { username: user.username, avatar_url: user.avatar_url }, isOptimistic: true };
    
    set((state) => ({ messages: { ...state.messages, [channelId]: [...(state.messages[channelId] || []), tempMsg] } }));

    try {
      const { data, error } = await supabase.from('dm_messages').insert([{ dm_channel_id: channelId, user_id: user.id, content, ...(imageUrl && { image_url: imageUrl }), ...(replyTo && { reply_to: replyTo }) }]).select(`*, profiles:user_id ( id, username, avatar_url )`).single();
      set((state) => {
        const msgs = state.messages[channelId] || [];
        if (error) {
          console.error('DM mesajı gönderilemedi:', error.message);
          return { messages: { ...state.messages, [channelId]: msgs.filter(m => m.id !== tempId) } };
        }
        return { messages: { ...state.messages, [channelId]: replaceOptimisticMessage(msgs, tempId, data) } };
      });
      if (!error && data) sendDMRealtimeSignal(channelId, { id: data.id, dm_channel_id: channelId, kind: 'insert' });
      return error ? { success: false, error: error.message } : { success: true };
    } catch (error) {
      console.error('DM mesajı gönderimi başarısız:', error);
      set((state) => ({ messages: { ...state.messages, [channelId]: (state.messages[channelId] || []).filter((message) => message.id !== tempId) } }));
      return { success: false, error: error instanceof Error ? error.message : 'Message could not be sent.' };
    }
  }
}));
