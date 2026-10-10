import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './useAuthStore';
import { serverNavigationState } from '../lib/serverNavigation';

const orderServerChannels = (server) => ({
  ...server,
  categories: [...(server.categories || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((category) => ({
    ...category,
    channels: [...(category.channels || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  })),
});

export const useServerStore = create((set, get) => ({
  servers: [],
  activeServerId: null,
  activeChannelId: null,
  lastChannelByServer: {},
  isLoading: false,
  requestGeneration: 0,
  reset: () => set((state) => ({ servers: [], activeServerId: null, activeChannelId: null, lastChannelByServer: {}, isLoading: false, requestGeneration: state.requestGeneration + 1 })),

  fetchServers: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      set((state) => ({ servers: [], activeServerId: null, activeChannelId: null, lastChannelByServer: {}, isLoading: false, requestGeneration: state.requestGeneration + 1 }));
      return;
    }
    const requestGeneration = get().requestGeneration + 1;
    set({ isLoading: true, requestGeneration });
    
    // Get servers the user is a member of
    const { data: memberData, error: memberError } = await supabase
      .from('server_members')
      .select('server_id, role')
      .eq('user_id', userId);

    if (requestGeneration !== get().requestGeneration) return;
    if (memberError || !memberData) {
      set({ servers: [], activeServerId: null, activeChannelId: null, isLoading: false });
      return;
    }

    const serverIds = memberData.map(m => m.server_id);
    
    if (serverIds.length === 0) {
      if (requestGeneration === get().requestGeneration) set({ servers: [], activeServerId: null, activeChannelId: null, isLoading: false });
      return;
    }

    // Fetch server details along with categories and channels
    const { data: serversData, error: serversError } = await supabase
      .from('servers')
      .select(`
        *,
        categories (
          *,
          channels (*)
        )
      `)
      .in('id', serverIds);

    if (requestGeneration !== get().requestGeneration) return;
    if (!serversError && serversData) {
      const orderedServers = serversData.map((server) => orderServerChannels({
        ...server,
        member_role: memberData.find((membership) => membership.server_id === server.id)?.role || 'member',
      }));
      set((state) => {
        const activeServer = orderedServers.find((server) => server.id === state.activeServerId) || orderedServers[0];
        return {
          servers: orderedServers,
          isLoading: false,
          ...serverNavigationState({ ...state, servers: orderedServers }, activeServer?.id || null),
        };
      });
    } else {
      set({ servers: [], activeServerId: null, activeChannelId: null, isLoading: false });
    }
  },

  setActiveServer: (id) => set((state) => serverNavigationState(state, id)),
  openServer: (id) => set((state) => serverNavigationState(state, id)),
  setActiveChannel: (id) => set((state) => ({ activeChannelId: id, ...(id && state.activeServerId ? { lastChannelByServer: { ...state.lastChannelByServer, [state.activeServerId]: id } } : {}) })),

  refreshServer: async (serverId) => {
    const { data, error } = await supabase.from('servers').select(`*, categories (*, channels (*))`).eq('id', serverId).maybeSingle();
    if (error || !data) return;
    const memberRole = get().servers.find((server) => server.id === serverId)?.member_role || 'member';
    const refreshed = orderServerChannels({ ...data, member_role: memberRole });
    set((state) => {
      const servers = state.servers.some((server) => server.id === serverId)
        ? state.servers.map((server) => server.id === serverId ? refreshed : server)
        : [...state.servers, refreshed];
      const active = servers.find((server) => server.id === state.activeServerId);
      const channels = active?.categories?.flatMap((category) => category.channels || []) || [];
      return {
        servers,
        ...(state.activeServerId === serverId && !channels.some((channel) => channel.id === state.activeChannelId)
          ? serverNavigationState({ ...state, servers }, serverId)
          : {}),
      };
    });
  },

  subscribeToServer: (serverId) => {
    if (!serverId) return () => {};
    let refreshTimer;
    let subscribedOnce = false;
    const queueRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void get().refreshServer(serverId); }, 180);
    };
    const subscription = supabase.channel(`server-live:${serverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `server_id=eq.${serverId}` }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `server_id=eq.${serverId}` }, queueRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers', filter: `id=eq.${serverId}` }, queueRefresh)
      .subscribe((status) => {
        // Realtime can reconnect after a brief network interruption. Reload a
        // snapshot on reconnect; the initial server snapshot is already loaded.
        if (status === 'SUBSCRIBED' && subscribedOnce) queueRefresh();
        if (status === 'SUBSCRIBED') subscribedOnce = true;
      });
    return () => {
      clearTimeout(refreshTimer);
      void supabase.removeChannel(subscription);
    };
  },

  subscribeToMembership: (userId) => {
    if (!userId) return () => {};
    let refreshTimer;
    let subscribedOnce = false;
    const queueRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void get().fetchServers(); }, 180);
    };
    const subscription = supabase.channel(`server-membership-live:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members', filter: `user_id=eq.${userId}` }, queueRefresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && subscribedOnce) queueRefresh();
        if (status === 'SUBSCRIBED') subscribedOnce = true;
      });
    return () => {
      clearTimeout(refreshTimer);
      void supabase.removeChannel(subscription);
    };
  },

  reorderChannels: async (serverId, categoryId, channelIds) => {
    const previousServers = get().servers;
    const server = previousServers.find((item) => item.id === serverId);
    const category = server?.categories?.find((item) => item.id === categoryId);
    const categoryChannels = category?.channels || [];
    if (!category || new Set(channelIds).size !== categoryChannels.length || channelIds.some((id) => !categoryChannels.some((channel) => channel.id === id))) {
      return { success: false, error: 'Kanal sırası doğrulanamadı.' };
    }

    set((state) => ({
      servers: state.servers.map((item) => item.id !== serverId ? item : {
        ...item,
        categories: item.categories.map((group) => group.id !== categoryId ? group : {
          ...group,
          channels: channelIds.map((id, sort_order) => ({ ...group.channels.find((channel) => channel.id === id), sort_order })),
        }),
      }),
    }));

    const { error } = await supabase.rpc('reorder_server_channels', {
      server_uuid: serverId,
      category_uuid: categoryId,
      ordered_channel_ids: channelIds,
    });
    if (error) {
      set((state) => ({
        servers: state.servers.map((item) => item.id !== serverId ? item : {
          ...item,
          categories: item.categories.map((group) => group.id !== categoryId ? group : {
            ...group,
            channels: previousServers.find((previous) => previous.id === serverId)?.categories?.find((previous) => previous.id === categoryId)?.channels || group.channels,
          }),
        }),
      }));
      return { success: false, error: error.message || 'Kanal sırası kaydedilemedi.' };
    }
    return { success: true };
  },

  reorderCategories: async (serverId, categoryIds) => {
    const previousServers = get().servers;
    const server = previousServers.find((item) => item.id === serverId);
    const categories = server?.categories || [];
    if (!server || new Set(categoryIds).size !== categories.length || categoryIds.some((id) => !categories.some((category) => category.id === id))) return { success: false, error: 'Kategori sırası doğrulanamadı.' };
    set((state) => ({ servers: state.servers.map((item) => item.id !== serverId ? item : { ...item, categories: categoryIds.map((id, sort_order) => ({ ...categories.find((category) => category.id === id), sort_order })) }) }));
    const { error } = await supabase.rpc('reorder_server_categories', { server_uuid: serverId, ordered_category_ids: categoryIds });
    if (error) {
      set((state) => ({ servers: state.servers.map((item) => item.id === serverId ? { ...item, categories: previousServers.find((previous) => previous.id === serverId)?.categories || item.categories } : item) }));
      return { success: false, error: error.message || 'Kategori sırası kaydedilemedi.' };
    }
    return { success: true };
  },

  moveChannelToCategory: async (serverId, channelId, targetCategoryId) => {
    const server = get().servers.find((item) => item.id === serverId);
    const target = server?.categories?.find((category) => category.id === targetCategoryId);
    const source = server?.categories?.find((category) => category.channels?.some((channel) => channel.id === channelId));
    const channel = source?.channels?.find((item) => item.id === channelId);
    if (!server || !source || !target || !channel) return { success: false, error: 'Kanal veya hedef kategori bulunamadı.' };
    if (source.id === target.id) return { success: true };
    const sort_order = Math.max(-1, ...(target.channels || []).map((item) => item.sort_order ?? -1)) + 1;
    set((state) => ({ servers: state.servers.map((item) => item.id !== serverId ? item : { ...item, categories: item.categories.map((category) => category.id === source.id ? { ...category, channels: category.channels.filter((item) => item.id !== channelId) } : category.id === target.id ? { ...category, channels: [...category.channels, { ...channel, category_id: target.id, sort_order }] } : category) }) }));
    const { error } = await supabase.from('channels').update({ category_id: target.id, sort_order }).eq('id', channelId).eq('server_id', serverId);
    if (error) {
      await get().fetchServers();
      return { success: false, error: error.message || 'Kanal başka kategoriye taşınamadı.' };
    }
    return { success: true };
  },

  createCategory: async (serverId, name) => {
    const trimmedName = name?.trim();
    if (!serverId || !trimmedName || trimmedName.length > 100) return { success: false, error: 'Kategori adı 1–100 karakter arasında olmalı.' };
    const server = get().servers.find((item) => item.id === serverId);
    const sort_order = server?.categories?.length || 0;
    const { error } = await supabase.from('categories').insert({ server_id: serverId, name: trimmedName, sort_order });
    if (error) return { success: false, error: error.message };
    await get().fetchServers();
    return { success: true };
  },

  updateCategory: async (serverId, categoryId, name) => {
    const trimmedName = name?.trim();
    if (!serverId || !categoryId || !trimmedName || trimmedName.length > 100) return { success: false, error: 'Kategori adı 1–100 karakter arasında olmalı.' };
    const { error } = await supabase.from('categories').update({ name: trimmedName }).eq('id', categoryId).eq('server_id', serverId);
    if (error) return { success: false, error: error.message };
    await get().fetchServers();
    return { success: true };
  },

  deleteCategory: async (serverId, categoryId) => {
    const { error } = await supabase.rpc('delete_server_category', { server_uuid: serverId, category_uuid: categoryId });
    if (error) return { success: false, error: error.message || 'Kategori silinemedi.' };
    await get().fetchServers();
    return { success: true };
  },
  
  createChannel: async (serverId, categoryId, name, type, options = {}) => {
    if (!serverId || !categoryId || !name?.trim() || !['text', 'voice'].includes(type)) {
      return { success: false, error: 'Invalid channel details.' };
    }
    try {
      const user = useAuthStore.getState().user;
      const category = get().servers.find((server) => server.id === serverId)?.categories?.find((item) => item.id === categoryId);
      const sortOrder = Math.max(-1, ...(category?.channels || []).map((channel) => channel.sort_order ?? -1)) + 1;
      const payload = { server_id: serverId, category_id: categoryId, name: name.trim(), type, sort_order: sortOrder, topic: options.topic || '', is_private: Boolean(options.isPrivate), nsfw: Boolean(options.nsfw), slowmode_seconds: Number(options.slowmodeSeconds) || 0 };
      let insert = await supabase.from('channels').insert([payload]).select('id').single();
      if (insert.error?.code === 'PGRST204' && /sort_order/i.test(insert.error.message || '')) {
        const payloadWithoutOrder = { ...payload };
        delete payloadWithoutOrder.sort_order;
        insert = await supabase.from('channels').insert([payloadWithoutOrder]).select('id').single();
      }
      if (insert.error) {
        const missingPermissionsMigration = /is_private|nsfw|slowmode_seconds|topic/i.test(insert.error.message || '') || insert.error.code === 'PGRST204';
        return { success: false, error: missingPermissionsMigration ? 'Kanal izinleri için migration_server_roles_permissions.sql dosyasını Supabase SQL Editor’da çalıştır.' : insert.error.message };
      }
      if (options.isPrivate) {
        const overrides = [
          ...(user?.id ? [{ channel_id: insert.data.id, user_id: user.id, allow_permissions: ['view_channel'], deny_permissions: [] }] : []),
          ...(options.visibleRoleIds || []).map((roleId) => ({ channel_id: insert.data.id, role_id: roleId, allow_permissions: ['view_channel'], deny_permissions: [] })),
        ];
        const { error } = await supabase.from('channel_permission_overrides').insert(overrides);
        if (error) {
          await supabase.from('channels').delete().eq('id', insert.data.id);
          return { success: false, error: 'Gizli kanal izinleri kaydedilemedi. migration_server_roles_permissions.sql dosyasını kontrol et.' };
        }
      }
      await get().fetchServers();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not create channel.' };
    }
  },

  updateChannel: async (serverId, channelId, updates, options = {}) => {
    const name = updates?.name?.trim();
    if (!serverId || !channelId || !name || name.length > 100) return { success: false, error: 'Kanal adı 1–100 karakter arasında olmalı.' };
    const destinationCategoryId = updates.categoryId || get().servers.find((server) => server.id === serverId)?.categories?.find((category) => category.channels?.some((channel) => channel.id === channelId))?.id;
    const currentServer = get().servers.find((server) => server.id === serverId);
    const destinationCategory = currentServer?.categories?.find((category) => category.id === destinationCategoryId);
    const movingCategory = destinationCategoryId && destinationCategoryId !== updates.currentCategoryId;
    const destinationOrder = movingCategory ? Math.max(-1, ...(destinationCategory?.channels || []).map((channel) => channel.sort_order ?? -1)) + 1 : undefined;
    const payload = {
      name,
      ...(destinationCategoryId ? { category_id: destinationCategoryId } : {}),
      ...(destinationOrder !== undefined ? { sort_order: destinationOrder } : {}),
      topic: updates.topic?.trim() || '',
      is_private: Boolean(updates.isPrivate),
      nsfw: Boolean(updates.nsfw),
      slowmode_seconds: Math.max(0, Math.min(21600, Number(updates.slowmodeSeconds) || 0)),
    };
    const { error } = await supabase.from('channels').update(payload).eq('id', channelId).eq('server_id', serverId);
    if (error) return { success: false, error: error.message };

    const { data: existingOverrides, error: readError } = await supabase.from('channel_permission_overrides').select('id,role_id,user_id').eq('channel_id', channelId);
    if (readError) return { success: false, error: `Kanal güncellendi ancak erişim izinleri okunamadı: ${readError.message}` };
    const existingRoleRows = (existingOverrides || []).filter((row) => row.role_id);
    const nextRoleIds = payload.is_private ? [...new Set(options.visibleRoleIds || [])] : [];
    const keepRoleIds = new Set(nextRoleIds);
    const removeIds = existingRoleRows.filter((row) => !keepRoleIds.has(row.role_id)).map((row) => row.id);
    if (removeIds.length) {
      const { error: removeError } = await supabase.from('channel_permission_overrides').delete().in('id', removeIds);
      if (removeError) return { success: false, error: `Kanal güncellendi ancak bazı rol izinleri kaldırılamadı: ${removeError.message}` };
    }
    const existingRoleIds = new Set(existingRoleRows.map((row) => row.role_id));
    const insertRows = nextRoleIds.filter((id) => !existingRoleIds.has(id)).map((role_id) => ({ channel_id: channelId, role_id, allow_permissions: ['view_channel'], deny_permissions: [] }));
    if (insertRows.length) {
      const { error: insertError } = await supabase.from('channel_permission_overrides').insert(insertRows);
      if (insertError) return { success: false, error: `Kanal güncellendi ancak rol izinleri kaydedilemedi: ${insertError.message}` };
    }
    await get().fetchServers();
    return { success: true };
  },

  deleteChannel: async (serverId, channelId) => {
    const { error } = await supabase.from('channels').delete().eq('id', channelId).eq('server_id', serverId);
    if (error) return { success: false, error: error.message || 'Kanal silinemedi.' };
    await get().fetchServers();
    return { success: true };
  },

  joinServer: async (serverId) => {
    const user = useAuthStore.getState().user;
    if (!user || !serverId) return { success: false, error: 'Enter a valid server invite.' };
    const inviteValue = String(serverId).trim().replace(/^https?:\/\/[^/]+\/invite\//i, '').replace(/^\/invite\//i, '').replace(/\/$/, '');
    let resolvedServerId = inviteValue;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteValue)) {
      const { data, error } = await supabase.rpc('join_server_by_invite', { invite_code: inviteValue });
      if (error) return { success: false, error: error.message || 'Davet bağlantısı geçersiz.' };
      resolvedServerId = data;
    } else {
      const { error } = await supabase.from('server_members').insert([{ server_id: resolvedServerId, user_id: user.id, role: 'member' }]);
      if (error && error.code !== '23505') return { success: false, error: error.message || 'Sunucuya katılınamadı.' };
    }
    if (resolvedServerId) {
      await get().fetchServers();
      const server = get().servers.find((item) => item.id === resolvedServerId);
      if (!server) return { success: false, error: 'Could not join this server.' };
      const channelId = server.categories?.flatMap((category) => category.channels || [])[0]?.id || null;
      set({ activeServerId: resolvedServerId, activeChannelId: channelId });
      return { success: true };
    }
    return { success: false, error: 'Davet bağlantısı sunucuyla eşleşmedi.' };
  },

  createServer: async (name) => {
    const user = useAuthStore.getState().user;
    if (!user) return { success: false, error: 'Authentication required.' };
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) {
      return { success: false, error: 'Server name must be between 1 and 100 characters.' };
    }

    const { data: serverId, error } = await supabase.rpc('create_server_with_defaults', {
      server_name: trimmedName,
    });

    let createdServerId = serverId;
    if (error) {
      const missingRpc = error.status === 404 || error.code === 'PGRST202' || error.code === '42883' || /create_server_with_defaults.*(not find|does not exist|schema cache)|404/i.test(error.message || '');
      if (!missingRpc) return { success: false, error: error.message || 'Sunucu oluşturulamadı.' };

      // Keep server creation usable when the project has not applied the RPC migration yet.
      let partialServerId = null;
      try {
        const serverInsert = await supabase.from('servers').insert({ name: trimmedName, owner_id: user.id }).select('id').single();
        if (serverInsert.error) throw serverInsert.error;
        partialServerId = serverInsert.data.id;

        const memberInsert = await supabase.from('server_members').insert({ server_id: partialServerId, user_id: user.id, role: 'owner' });
        if (memberInsert.error) throw memberInsert.error;

        const categoryInsert = await supabase.from('categories').insert([
          { server_id: partialServerId, name: 'METİN KANALLARI' },
          { server_id: partialServerId, name: 'SES KANALLARI' },
        ]).select('id, name');
        if (categoryInsert.error) throw categoryInsert.error;
        const textCategory = categoryInsert.data.find(category => category.name === 'METİN KANALLARI');
        const voiceCategory = categoryInsert.data.find(category => category.name === 'SES KANALLARI');
        if (!textCategory || !voiceCategory) throw new Error('Varsayılan kanal kategorileri oluşturulamadı.');

        const channelInsert = await supabase.from('channels').insert([
          { server_id: partialServerId, category_id: textCategory.id, name: 'genel-sohbet', type: 'text' },
          { server_id: partialServerId, category_id: voiceCategory.id, name: 'Genel Odası', type: 'voice' },
        ]);
        if (channelInsert.error) throw channelInsert.error;
        createdServerId = partialServerId;
      } catch (fallbackError) {
        if (partialServerId) {
          await supabase.from('channels').delete().eq('server_id', partialServerId);
          await supabase.from('categories').delete().eq('server_id', partialServerId);
          await supabase.from('servers').delete().eq('id', partialServerId).eq('owner_id', user.id);
        }
        return { success: false, error: fallbackError.message || 'Sunucu oluşturulamadı. migration_server_creation.sql dosyasını Supabase SQL Editor’da çalıştır.' };
      }
    }
    if (!createdServerId) return { success: false, error: 'Sunucu oluşturulamadı. migration_server_creation.sql dosyasını Supabase SQL Editor’da çalıştır.' };

    await get().fetchServers();
    set({ activeServerId: createdServerId });
    return { success: true };
  },

  deleteServer: async (serverId) => {
    const user = useAuthStore.getState().user;
    const server = get().servers.find(item => item.id === serverId);
    if (!user || !server || server.owner_id !== user.id) return { success: false, error: 'Bu sunucuyu yalnızca sahibi silebilir.' };
    const { error } = await supabase.rpc('delete_server', { server_uuid: serverId });
    if (error) return { success: false, error: error.message || 'Sunucu silinemedi. migration_server_creation.sql dosyasını Supabase SQL Editor’da çalıştır.' };
    set(state => {
      const servers = state.servers.filter(item => item.id !== serverId);
      const activeServer = servers.find(item => item.id === state.activeServerId) || servers[0] || null;
      const channels = activeServer?.categories?.flatMap(category => category.channels || []) || [];
      return {
        servers,
        activeServerId: activeServer?.id || null,
        activeChannelId: channels[0]?.id || null,
      };
    });
    return { success: true };
  }
}));
