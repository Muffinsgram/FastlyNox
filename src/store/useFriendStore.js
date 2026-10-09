import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';

export const useFriendStore = create((set, get) => ({
  friendships: [],
  dmChannels: [],
  isLoading: false,
  friendRequestGeneration: 0,
  dmRequestGeneration: 0,
  reset: () => set((state) => ({
    friendships: [], dmChannels: [], isLoading: false,
    friendRequestGeneration: state.friendRequestGeneration + 1,
    dmRequestGeneration: state.dmRequestGeneration + 1,
  })),

  fetchFriendships: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const generation = get().friendRequestGeneration + 1;
    set({ friendRequestGeneration: generation });
    set({ isLoading: true });

    // Fetch friendships where user is requester or addressee
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        *,
        requester:requester_id(id, username, avatar_url, status_text, status_expires_at),
        addressee:addressee_id(id, username, avatar_url, status_text, status_expires_at)
      `)
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (generation !== get().friendRequestGeneration) return;
    if (!error && data) {
      set({ friendships: data, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },

  sendFriendRequest: async (username) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'Not authenticated' };

    // Find the target user by username
    const { data: targetUser, error: searchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (searchError || !targetUser) return { success: false, error: 'Kullanıcı bulunamadı.' };
    if (targetUser.id === user.id) return { success: false, error: 'Kendinize arkadaşlık isteği gönderemezsiniz.' };

    // Insert friendship
    const { error: insertError } = await supabase
      .from('friendships')
      .insert([{ requester_id: user.id, addressee_id: targetUser.id, status: 'pending' }]);

    if (insertError) {
      if (insertError.code === '23505') return { success: false, error: 'Bu kullanıcıya zaten istek gönderdiniz.' };
      return { success: false, error: 'İstek gönderilemedi.' };
    }

    get().fetchFriendships();
    return { success: true };
  },

  acceptFriendRequest: async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
      
    if (!error) get().fetchFriendships();
  },

  removeFriend: async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);
      
    if (!error) get().fetchFriendships();
  },

  fetchDMs: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const generation = get().dmRequestGeneration + 1;
    set({ dmRequestGeneration: generation });
    
    const { data, error } = await supabase
      .from('dm_channels')
      .select(`
        *,
        user1:user1_id(id, username, avatar_url, status_text, status_expires_at),
        user2:user2_id(id, username, avatar_url, status_text, status_expires_at)
      `)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (generation !== get().dmRequestGeneration) return;
    if (!error && data) {
      set({ dmChannels: data });
    }
  },

  getOrCreateDM: async (otherUserId) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;

    // Check if DM already exists in state
    const existing = get().dmChannels.find(
      dm => (dm.user1_id === user.id && dm.user2_id === otherUserId) || 
            (dm.user1_id === otherUserId && dm.user2_id === user.id)
    );

    if (existing) return existing;

    // Create new DM channel
    const { data, error } = await supabase
      .from('dm_channels')
      .insert([{ 
        user1_id: user.id, 
        user2_id: otherUserId 
      }])
      .select(`
        *,
        user1:user1_id(id, username, avatar_url, status_text, status_expires_at),
        user2:user2_id(id, username, avatar_url, status_text, status_expires_at)
      `)
      .single();

    if (!error && data) {
      set(state => ({ dmChannels: [data, ...state.dmChannels] }));
      return data;
    }
    return null;
  }
}));
