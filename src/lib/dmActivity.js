export function mergeDMPreview(channels, message) {
  const channel = channels.find(item => item.id === message.dm_channel_id);
  if (!channel) return channels;
  const previous = channel.last_message;
  if (previous?.id !== message.id && Date.parse(previous?.created_at || '') > Date.parse(message.created_at)) return channels;
  return channels.map(item => item.id === channel.id ? { ...item, last_message: message } : item)
    .sort((a, b) => Date.parse(b.last_message?.created_at || b.created_at) - Date.parse(a.last_message?.created_at || a.created_at));
}

export function createDMActivityReceiver({ userId, isCurrent, getChannels, updateChannels, receiveMessage, removeMessage, notify, refresh }) {
  const received = new Map();
  return (eventType, message) => {
    if (!isCurrent() || !message?.id || !message.dm_channel_id) return;
    if (eventType === 'DELETE') { removeMessage(message.dm_channel_id, message.id); refresh(); return; }
    if (!message.user_id || !message.created_at) return;
    const fingerprint = JSON.stringify([message.content, message.image_url, message.is_edited, message.reply_to]);
    const previous = received.get(message.id);
    if (previous === fingerprint) return false;
    const channels = getChannels();
    const channel = channels.find(item => item.id === message.dm_channel_id);
    if (channel && ![channel.user1_id, channel.user2_id].includes(userId)) return;
    const profile = channel?.user1_id === message.user_id ? channel.user1 : channel?.user2;
    receiveMessage(message.dm_channel_id, message, profile);
    received.set(message.id, fingerprint);
    if (received.size > 2000) received.delete(received.keys().next().value);
    updateChannels(current => mergeDMPreview(current, message));
    if (!channel) refresh();
    if (eventType === 'INSERT' && previous === undefined) {
      if (message.user_id !== userId) notify(message);
    }
    return true;
  };
}
