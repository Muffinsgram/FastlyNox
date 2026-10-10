import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { fetchProfiles } from '../lib/profileMedia';

export const useFriendStore = create((set, get) => ({
  friendships: [],
  dmChannels: [],
  isLoading: false,
  friendRequestGeneration: 0,
  dmRequestGeneration: 0,
  friendshipEventVersion: 0,
  dmActivityVersion: 0,
  activeDMActivitySubscription: null,
  dmActivityCleanup: null,
  reset: () => set((state) => ({
    friendships: [], dmChannels: [], isLoading: false,
    friendRequestGeneration: state.friendRequestGeneration + 1,
    dmRequestGeneration: state.dmRequestGeneration + 1,
  })),

  fetchFriendships: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const eventVersion = get().friendshipEventVersion;
    const generation = get().friendRequestGeneration + 1;
    set({ friendRequestGeneration: generation });
    if (!get().friendships.length) set({ isLoading: true });

    // Fetch friendships where user is requester or addressee
    let { data, error } = await supabase
      .from('friendships')
      .select(`
        *,
        requester:requester_id(id, username, avatar_url, status_text, status_expires_at),
        addressee:addressee_id(id, username, avatar_url, status_text, status_expires_at)
      `)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    // The embedded profile relation can fail independently when PostgREST's
    // schema cache is stale. Keep the friendship rows visible and hydrate names
    // from profiles as a fallback instead of dropping the whole list.
    if (error) {
      const fallback = await supabase.from('friendships').select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
      data = fallback.data;
      error = fallback.error;
    }

    if (generation !== get().friendRequestGeneration) return;
    if (eventVersion !== get().friendshipEventVersion) {
      window.setTimeout(() => void get().fetchFriendships(), 120);
      return;
    }
    if (!error && data) {
      const ids = [...new Set(data.flatMap(item => [item.requester_id, item.addressee_id]).filter(id => id && id !== user.id))];
      const profiles = await fetchProfiles(ids).catch(() => []);
      const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
      const hydrated = data.map(item => ({
        ...item,
        requester: item.requester || (item.requester_id === user.id ? useAuthStore.getState().user : profileMap.get(item.requester_id) || null),
        addressee: item.addressee || (item.addressee_id === user.id ? useAuthStore.getState().user : profileMap.get(item.addressee_id) || null),
      }));
      if (generation === get().friendRequestGeneration) set({ friendships: hydrated, isLoading: false });
    } else {
      console.error('Arkadaşlıklar yüklenemedi:', error?.message || 'Bilinmeyen veritabanı hatası');
      set({ isLoading: false });
    }
  },

  subscribeToFriendships: (userId) => {
    if (!userId) return () => {};
    let refreshTimer;
    const recoveryTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void get().fetchFriendships(); }, 45_000);
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void get().fetchFriendships(); }, 100);
    };
    const onFriendshipEvent = () => {
      set((state) => ({ friendshipEventVersion: state.friendshipEventVersion + 1 }));
      refresh();
    };
    const channel = supabase.channel(`friendships:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `requester_id=eq.${userId}` }, onFriendshipEvent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${userId}` }, onFriendshipEvent)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Arkadaşlık senkronu yeniden bağlanıyor:', status);
        }
      });
    const handleOnline = () => refresh();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearTimeout(refreshTimer);
      clearInterval(recoveryTimer);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      void supabase.removeChannel(channel);
    };
  },

  sendFriendRequest: async (username) => {
    return get().sendFriendRequestToUser(username, false);
  },

  sendFriendRequestToUser: async (target, isUserId = true) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'Not authenticated' };

    // Find the target user by username
    const { data: targetUser, error: searchError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, status_text, status_expires_at')
      .eq(isUserId ? 'id' : 'username', target)
      .maybeSingle();

    if (searchError || !targetUser) return { success: false, error: 'Kullanıcı bulunamadı.' };
    if (targetUser.id === user.id) return { success: false, error: 'Kendinize arkadaşlık isteği gönderemezsiniz.' };

    const { data: existing, error: friendshipLookupError } = await supabase.from('friendships')
      .select('id, requester_id, addressee_id, status')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},addressee_id.eq.${user.id})`)
      .limit(1)
      .maybeSingle();
    if (friendshipLookupError) return { success: false, error: 'Mevcut arkadaşlık durumu doğrulanamadı. Tekrar dene.' };
    if (existing?.status === 'accepted') return { success: false, error: 'Bu kullanıcı zaten arkadaş listende.' };
    if (existing?.status === 'pending') return { success: false, error: existing.requester_id === user.id ? 'Bu kullanıcıya zaten istek gönderdin.' : 'Bu kullanıcıdan bekleyen bir isteğin var; Bekleyenler sekmesinden kabul edebilirsin.' };

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticRequest = {
      id: optimisticId,
      requester_id: user.id,
      addressee_id: targetUser.id,
      status: 'pending',
      created_at: new Date().toISOString(),
      requester: { id: user.id, username: user.username, avatar_url: user.avatar_url },
      addressee: targetUser,
    };
    set((state) => ({ friendships: [optimisticRequest, ...state.friendships] }));

    const { error: insertError } = await supabase
      .from('friendships')
      .insert([{ requester_id: user.id, addressee_id: targetUser.id, status: 'pending' }]);

    if (insertError) {
      set((state) => ({ friendships: state.friendships.filter((friendship) => friendship.id !== optimisticId) }));
      if (insertError.code === '23505') return { success: false, error: 'Bu kullanıcıya zaten istek gönderdiniz.' };
      console.error('Arkadaşlık isteği gönderilemedi:', insertError.message);
      return { success: false, error: insertError.message || 'İstek gönderilemedi.' };
    }

    void get().fetchFriendships();
    return { success: true };
  },

  acceptFriendRequest: async (friendshipId) => {
    const previous = get().friendships.find((item) => item.id === friendshipId);
    if (!previous || previous.status !== 'pending' || previous.addressee_id !== useAuthStore.getState().user?.id) return { success: false, error: 'Bu arkadaşlık isteği artık kabul edilebilir durumda değil.' };
    set((state) => ({ friendships: state.friendships.map((item) => item.id === friendshipId ? { ...item, status: 'accepted' } : item) }));
    const { data, error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId).eq('status', 'pending').select('*').maybeSingle();
    if (error || !data) {
      set((state) => ({ friendships: state.friendships.map((item) => item.id === friendshipId ? previous : item) }));
      console.error('Arkadaşlık isteği kabul edilemedi:', error?.message || 'İstek zaten değişmiş.');
      void get().fetchFriendships();
      return { success: false, error: error?.message || 'İstek zaten değişmiş.' };
    }
    set((state) => ({ friendships: state.friendships.map((item) => item.id === friendshipId ? { ...item, ...data, requester: item.requester, addressee: item.addressee } : item) }));
    return { success: true };
  },

  removeFriend: async (friendshipId) => {
    const previous = get().friendships.find((item) => item.id === friendshipId);
    if (!previous) return { success: false, error: 'Arkadaşlık kaydı bulunamadı.' };
    set((state) => ({ friendships: state.friendships.filter((item) => item.id !== friendshipId) }));
    const { data, error } = await supabase.from('friendships').delete().eq('id', friendshipId).select('id').maybeSingle();
    if (error || !data) {
      set((state) => ({ friendships: [previous, ...state.friendships.filter((item) => item.id !== friendshipId)] }));
      if (error) console.error('Arkadaşlık kaydı kaldırılamadı:', error.message);
      void get().fetchFriendships();
      return { success: false, error: error?.message || 'Arkadaşlık kaydı zaten kaldırılmış.' };
    }
    return { success: true };
  },

  fetchDMs: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const eventVersion = get().dmActivityVersion;
    const generation = get().dmRequestGeneration + 1;
    set({ dmRequestGeneration: generation });
    
    let { data, error } = await supabase
      .from('dm_channels')
      .select(`
        *,
        user1:user1_id(id, public_id, username, avatar_url, status_text, status_expires_at),
        user2:user2_id(id, public_id, username, avatar_url, status_text, status_expires_at)
      `)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      const fallback = await supabase.from('dm_channels').select('*')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (generation !== get().dmRequestGeneration) return;
    if (eventVersion !== get().dmActivityVersion) {
      window.setTimeout(() => void get().fetchDMs(), 150);
      return;
    }
    if (error || !data) { console.error('DM listesi eşitlenemedi:', error?.message || 'Bilinmeyen veritabanı hatası'); return; }
    const profiles = await fetchProfiles([...new Set(data.flatMap(channel => [channel.user1_id, channel.user2_id]).filter(id => id && id !== user.id))]).catch(() => []);
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const hydratedChannels = data.map(channel => ({ ...channel, user1: channel.user1 || (channel.user1_id === user.id ? user : profileMap.get(channel.user1_id) || null), user2: channel.user2 || (channel.user2_id === user.id ? user : profileMap.get(channel.user2_id) || null) }));
    const channelIds = data.map((channel) => channel.id);
    let latestByChannel = {};
    if (channelIds.length) {
      const { data: recentMessages, error: messagesError } = await supabase.from('dm_messages')
        .select('id, dm_channel_id, user_id, content, image_url, created_at')
        .in('dm_channel_id', channelIds)
        .order('created_at', { ascending: false })
        .limit(Math.min(1000, Math.max(channelIds.length * 3, 100)));
      if (messagesError) console.warn('DM son mesaj önizlemeleri eşitlenemedi:', messagesError.message);
      for (const message of recentMessages || []) if (!latestByChannel[message.dm_channel_id]) latestByChannel[message.dm_channel_id] = message;
    }
    if (generation !== get().dmRequestGeneration) return;
    if (eventVersion !== get().dmActivityVersion) {
      window.setTimeout(() => void get().fetchDMs(), 150);
      return;
    }
    set({ dmChannels: hydratedChannels.map((channel) => ({ ...channel, last_message: latestByChannel[channel.id] || null }))
      .sort((left, right) => Date.parse(right.last_message?.created_at || right.created_at) - Date.parse(left.last_message?.created_at || left.created_at)) });
  },

  subscribeToDMActivity: (userId) => {
    if (!userId) return () => {};
    get().dmActivityCleanup?.();
    if (get().activeDMActivitySubscription) void supabase.removeChannel(get().activeDMActivitySubscription);
    let refreshTimer;
    let subscription;
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void get().fetchDMs(); }, 120);
    };
    subscription = supabase.channel(`dm-activity:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_channels' }, () => {
        set((state) => ({ dmActivityVersion: state.dmActivityVersion + 1 }));
        refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages' }, (payload) => {
        set((state) => ({ dmActivityVersion: state.dmActivityVersion + 1 }));
        const message = payload.new;
        const channelId = message?.dm_channel_id || payload.old?.dm_channel_id;
        if (!channelId) return refresh();
        if (payload.eventType !== 'INSERT') return refresh();
        set((state) => {
          const currentChannel = state.dmChannels.find((channel) => channel.id === channelId);
          if (!currentChannel) return state;
          if (Date.parse(currentChannel.last_message?.created_at || '') >= Date.parse(message.created_at || '')) return state;
          return { dmChannels: state.dmChannels.map((channel) => channel.id === channelId ? { ...channel, last_message: message } : channel).sort((left, right) => new Date(right.last_message?.created_at || right.created_at) - new Date(left.last_message?.created_at || left.created_at)) };
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('DM aktivite kanalı bağlantı sorunu:', status);
        }
      });
    const refreshOnReconnect = () => refresh();
    const recoveryTimer = window.setInterval(refresh, 45_000);
    const refreshOnVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', refreshOnReconnect);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    const cleanup = () => {
      clearTimeout(refreshTimer);
      clearInterval(recoveryTimer);
      window.removeEventListener('online', refreshOnReconnect);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
      void supabase.removeChannel(subscription);
    };
    set({ activeDMActivitySubscription: subscription, dmActivityCleanup: cleanup });
    return cleanup;
  },

  getOrCreateDM: async (otherUserId) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;

    if (!otherUserId || otherUserId === user.id) return null;
    // Consult the database as well as the local list. A second device can have
    // created the conversation moments ago while this client's cache is stale.
    const existing = get().dmChannels.find(
      dm => (dm.user1_id === user.id && dm.user2_id === otherUserId) || 
            (dm.user1_id === otherUserId && dm.user2_id === user.id)
    );

    if (existing) return existing;

    const pairFilter = `and(user1_id.eq.${user.id},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${user.id})`;
    const { data: found } = await supabase.from('dm_channels').select(`*, user1:user1_id(id, public_id, username, avatar_url, status_text, status_expires_at), user2:user2_id(id, public_id, username, avatar_url, status_text, status_expires_at)`).or(pairFilter).limit(1).maybeSingle();
    if (found) { set(state => ({ dmChannels: [found, ...state.dmChannels.filter(channel => channel.id !== found.id)] })); return found; }

    // Create new DM channel
    const { data, error } = await supabase
      .from('dm_channels')
      .insert([{ 
        user1_id: user.id, 
        user2_id: otherUserId 
      }])
      .select(`
        *,
        user1:user1_id(id, public_id, username, avatar_url, status_text, status_expires_at),
        user2:user2_id(id, public_id, username, avatar_url, status_text, status_expires_at)
      `)
      .single();

    if (!error && data) {
      set(state => ({ dmChannels: [data, ...state.dmChannels] }));
      return data;
    }
    if (error?.code === '23505') {
      const { data: duplicate } = await supabase.from('dm_channels').select(`*, user1:user1_id(id, public_id, username, avatar_url, status_text, status_expires_at), user2:user2_id(id, public_id, username, avatar_url, status_text, status_expires_at)`).or(pairFilter).limit(1).maybeSingle();
      if (duplicate) { set(state => ({ dmChannels: [duplicate, ...state.dmChannels.filter(channel => channel.id !== duplicate.id)] })); return duplicate; }
    }
    return null;
  }
}));
