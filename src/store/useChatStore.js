import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { mergeFetchedMessages, mergeMessage, replaceOptimisticMessage } from '../lib/messageList';
import { appendReaction, MESSAGE_REACTIONS, removeReaction } from '../lib/messageReactions';
import { writeDraft } from '../lib/draftStorage';

export const useChatStore = create((set, get) => ({
  messages: {},
  drafts: {},
  isLoading: false,
  requestGeneration: 0,
  fetchRequests: {},
  messageEventVersions: {},
  activeSubscription: null,
  activeSubscriptionCleanup: null,
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
      .from('messages')
      .select(`*, profiles:user_id ( id, username, avatar_url )`)
      .eq('channel_id', channelId)
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
      // Show the message snapshot as soon as it arrives. Reactions can load in
      // parallel afterwards and should not hold the whole chat behind another
      // database round-trip.
      set((state) => ({ messages: { ...state.messages, [channelId]: reconciled }, isLoading: false }));
      if ((get().messageEventVersions[channelId] || 0) !== eventVersion) {
        window.setTimeout(() => {
          if (generation === get().requestGeneration) void get().fetchMessages(channelId);
        }, 150);
        return;
      }
      const messageIds = data.map((message) => message.id);
      if (messageIds.length) {
        const { data: reactions, error: reactionError } = await supabase.from('message_reactions')
          .select('id, message_id, channel_id, user_id, emoji').eq('channel_id', channelId).in('message_id', messageIds);
        if (generation !== get().requestGeneration || get().fetchRequests[channelId] !== requestId) return;
        if (reactionError) console.warn('Kanal tepkileri eşitlenemedi:', reactionError.message);
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
      console.error('Kanal mesajları yüklenemedi:', error?.message || 'Bilinmeyen veritabanı hatası');
      set({ isLoading: false });
    }
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
    subscription = supabase.channel(`public:messages:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, async (payload) => {
        if (!isCurrent()) return;
        const newMsg = payload.new;
        if (newMsg.channel_id !== channelId) return;
        const stateMessages = get().messages[channelId] || [];
        if (stateMessages.find(m => m.id === newMsg.id)) return;
        get().receiveRealtimeMessage(channelId, { ...newMsg, profiles: { id: newMsg.user_id, username: 'Yükleniyor', avatar_url: null } });
        if (newMsg.user_id !== useAuthStore.getState().user?.id) {
          window.dispatchEvent(new CustomEvent('fastlynox:incoming-message', { detail: { message: newMsg, isDM: false } }));
        }
        void supabase.from('profiles').select('id, username, avatar_url').eq('id', newMsg.user_id).single().then(({ data: profile }) => {
          if (isCurrent() && profile) get().receiveRealtimeMessage(channelId, newMsg, profile);
        }).catch((error) => console.warn('Canlı mesaj profili yüklenemedi:', error));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        if (payload.new.channel_id === channelId) get().receiveRealtimeMessage(channelId, payload.new);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        if (payload.old.channel_id === channelId) get().removeRealtimeMessage(channelId, payload.old.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === payload.new.message_id ? appendReaction(message, payload.new) : message)])) }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (!isCurrent()) return;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === payload.old.message_id ? removeReaction(message, payload.old) : message)])) }));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && isCurrent()) {
          if (subscribedOnce) void get().fetchMessages(channelId);
          subscribedOnce = true;
        }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') console.warn(`Sunucu mesaj kanalı bağlantı sorunu (${channelId}):`, status);
      });

    const refreshWhenConnected = () => { if (isCurrent() && document.visibilityState === 'visible') void get().fetchMessages(channelId); };
    window.addEventListener('online', refreshWhenConnected);
    document.addEventListener('visibilitychange', refreshWhenConnected);
    set({ activeSubscription: subscription, activeSubscriptionCleanup: () => {
      window.removeEventListener('online', refreshWhenConnected);
      document.removeEventListener('visibilitychange', refreshWhenConnected);
    } });
  },

  unsubscribe: () => {
    const { activeSubscription, activeSubscriptionCleanup } = get();
    activeSubscriptionCleanup?.();
    if (activeSubscription) void supabase.removeChannel(activeSubscription);
    set((state) => ({ activeSubscription: null, activeSubscriptionCleanup: null, subscriptionToken: state.subscriptionToken + 1 }));
  },

  reset: () => {
    get().unsubscribe();
    set((state) => ({ messages: {}, drafts: {}, fetchRequests: {}, messageEventVersions: {}, isLoading: false, requestGeneration: state.requestGeneration + 1 }));
  },

  setDraft: (channelId, draft) => {
    writeDraft(useAuthStore.getState().user?.id, `server:${channelId}`, draft);
    set((state) => ({ drafts: { ...state.drafts, [channelId]: draft } }));
  },
  clearDraft: (channelId) => {
    writeDraft(useAuthStore.getState().user?.id, `server:${channelId}`, '');
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
      const { data: existing, error: lookupError } = await supabase.from('message_reactions').select('id').eq('channel_id', channelId).eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        const { data, error } = await supabase.from('message_reactions').delete().eq('id', existing.id).select('id, message_id, channel_id, user_id, emoji').single();
        if (error) throw error;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === messageId ? removeReaction(message, data) : message)])) }));
      } else {
        const { data, error } = await supabase.from('message_reactions').insert({ channel_id: channelId, message_id: messageId, user_id: userId, emoji }).select('id, message_id, channel_id, user_id, emoji').single();
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
      const { data, error } = await supabase.from('messages').update({ content: newContent, is_edited: true }).eq('id', messageId).select('id, content, is_edited').single();
      if (error) return { success: false, error: error.message };
      set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === messageId ? { ...message, ...data } : message)])) }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Message could not be edited.' };
    }
  },

  deleteMessage: async (messageId) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
      if (error) return { success: false, error: error.message };
      set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.filter((message) => message.id !== messageId)])) }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Message could not be deleted.' };
    }
  },

  sendMessage: async (channelId, content, imageUrl = null, replyTo = null) => {
    const user = useAuthStore.getState().user;
    if (!user || !channelId || (!content.trim() && !imageUrl)) return { success: false, error: 'Message is empty or you are signed out.' };

    const tempId = `temp-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const tempMsg = { id: tempId, channel_id: channelId, user_id: user.id, content, image_url: imageUrl, reply_to: replyTo, created_at: new Date().toISOString(), profiles: { username: user.username, avatar_url: user.avatar_url }, isOptimistic: true };
    
    set((state) => ({ messages: { ...state.messages, [channelId]: [...(state.messages[channelId] || []), tempMsg] } }));

    const insertData = { channel_id: channelId, user_id: user.id, content };
    if (imageUrl) insertData.image_url = imageUrl;
    if (replyTo) insertData.reply_to = replyTo;

    try {
      const { data, error } = await supabase.from('messages').insert([insertData]).select(`*, profiles:user_id ( id, username, avatar_url )`).single();
      set((state) => {
        const msgs = state.messages[channelId] || [];
        if (error) {
          console.error('Kanal mesajı gönderilemedi:', error.message);
          return { messages: { ...state.messages, [channelId]: msgs.filter(m => m.id !== tempId) } };
        }
        return { messages: { ...state.messages, [channelId]: replaceOptimisticMessage(msgs, tempId, data) } };
      });
      return error ? { success: false, error: error.message } : { success: true };
    } catch (error) {
      console.error('Kanal mesajı gönderimi başarısız:', error);
      set((state) => ({ messages: { ...state.messages, [channelId]: (state.messages[channelId] || []).filter((message) => message.id !== tempId) } }));
      return { success: false, error: error instanceof Error ? error.message : 'Message could not be sent.' };
    }
  }
}));
