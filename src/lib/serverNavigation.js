export function serverNavigationState(state, serverId) {
  const lastChannelByServer = { ...state.lastChannelByServer };
  const previousServer = state.servers.find(server => server.id === state.activeServerId);
  const previousChannels = previousServer?.categories?.flatMap(category => category.channels || []) || [];
  if (previousChannels.some(channel => channel.id === state.activeChannelId)) {
    lastChannelByServer[state.activeServerId] = state.activeChannelId;
  }
  const server = state.servers.find(item => item.id === serverId);
  const channels = server?.categories?.flatMap(category => category.channels || []) || [];
  const remembered = lastChannelByServer[serverId];
  const activeChannelId = channels.some(channel => channel.id === remembered)
    ? remembered
    : channels[0]?.id || null;
  if (serverId && activeChannelId) lastChannelByServer[serverId] = activeChannelId;
  else if (serverId) delete lastChannelByServer[serverId];
  return { activeServerId: serverId, activeChannelId, lastChannelByServer };
}
