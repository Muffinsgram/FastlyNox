import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { mergeMessage, replaceOptimisticMessage } from '../lib/messageList';
import { appendReaction, attachReactions, MESSAGE_REACTIONS, removeReaction } from '../lib/messageReactions';
import { writeDraft } from '../lib/draftStorage';

export const useChatStore = create((set, get) => ({
  messages: {},
  drafts: {},
  isLoading: false,
  requestGeneration: 0,
  activeSubscription: null,

  fetchMessages: async (channelId) => {
    if (!channelId) return;
    const generation = get().requestGeneration;
    set({ isLoading: true });
    
    const { data, error } = await supabase
      .from('messages')
      .select(`*, profiles:user_id ( id, username, avatar_url )`)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (generation !== get().requestGeneration) return;
    if (!error && data) {
      const messageIds = data.map((message) => message.id);
      const { data: reactions } = messageIds.length
        ? await supabase.from('message_reactions').select('id, message_id, channel_id, user_id, emoji').eq('channel_id', channelId).in('message_id', messageIds)
        : { data: [] };
      if (generation !== get().requestGeneration) return;
      set((state) => ({ messages: { ...state.messages, [channelId]: attachReactions(data.reverse(), reactions || []) }, isLoading: false }));
    } else {
      set({ isLoading: false });
    }
  },

  subscribeToChannel: (channelId) => {
    if (!channelId) return;
    const generation = get().requestGeneration;
    
    const { activeSubscription } = get();
    if (activeSubscription) supabase.removeChannel(activeSubscription);

    const subscription = supabase
      .channel(`public:messages:${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, async (payload) => {
        if (generation !== get().requestGeneration) return;
        const newMsg = payload.new;
        const stateMessages = get().messages[channelId] || [];
        if (stateMessages.find(m => m.id === newMsg.id)) return;
        const { data: profile } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', newMsg.user_id).single();
        if (generation !== get().requestGeneration) return;
        set((state) => ({ messages: { ...state.messages, [channelId]: mergeMessage(state.messages[channelId] || [], { ...newMsg, profiles: profile }) } }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (generation !== get().requestGeneration) return;
        set((state) => {
          const msgs = state.messages[channelId] || [];
          return { messages: { ...state.messages, [channelId]: msgs.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m) } };
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (generation !== get().requestGeneration) return;
        set((state) => {
          const msgs = state.messages[channelId] || [];
          return { messages: { ...state.messages, [channelId]: msgs.filter(m => m.id !== payload.old.id) } };
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (generation !== get().requestGeneration) return;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === payload.new.message_id ? appendReaction(message, payload.new) : message)])) }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: `channel_id=eq.${channelId}` }, (payload) => {
        if (generation !== get().requestGeneration) return;
        set((state) => ({ messages: Object.fromEntries(Object.entries(state.messages).map(([id, messages]) => [id, messages.map((message) => message.id === payload.old.message_id ? removeReaction(message, payload.old) : message)])) }));
      })
      .subscribe();

    set({ activeSubscription: subscription });
  },

  unsubscribe: () => {
    const { activeSubscription } = get();
    if (activeSubscription) { supabase.removeChannel(activeSubscription); set({ activeSubscription: null }); }
  },

  reset: () => {
    get().unsubscribe();
    set((state) => ({ messages: {}, drafts: {}, isLoading: false, requestGeneration: state.requestGeneration + 1 }));
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
        if (error) return { messages: { ...state.messages, [channelId]: msgs.filter(m => m.id !== tempId) } };
        return { messages: { ...state.messages, [channelId]: replaceOptimisticMessage(msgs, tempId, data) } };
      });
      return error ? { success: false, error: error.message } : { success: true };
    } catch (error) {
      set((state) => ({ messages: { ...state.messages, [channelId]: (state.messages[channelId] || []).filter((message) => message.id !== tempId) } }));
      return { success: false, error: error instanceof Error ? error.message : 'Message could not be sent.' };
    }
  }
}));
