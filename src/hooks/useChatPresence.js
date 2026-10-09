import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Realtime-only typing and read activity; no database writes or migration required. */
export function useChatPresence({ scope, user, isTyping = false, lastReadAt = null }) {
  const [typingUsers, setTypingUsers] = useState([]);
  const [readAtByUser, setReadAtByUser] = useState({});
  const channelRef = useRef(null);
  const subscribedRef = useRef(false);
  const activityRef = useRef({ userId: user?.id, username: user?.username, isTyping, lastReadAt });

  useEffect(() => {
    if (!scope || !user?.id) {
      return undefined;
    }

    const channel = supabase.channel(`presence:${scope}`, { config: { presence: { key: user.id } } });
    channelRef.current = channel;

    const syncPresence = () => {
      const members = Object.values(channel.presenceState()).flat();
      const now = Date.now();
      const latestByUser = new Map();
      members.forEach((member) => {
        if (!member?.userId || member.userId === user.id) return;
        const previous = latestByUser.get(member.userId);
        if (!previous || Number(member.updatedAt || 0) > Number(previous.updatedAt || 0)) latestByUser.set(member.userId, member);
      });
      const latest = [...latestByUser.values()];
      setTypingUsers(latest.filter((member) => member.isTyping && now - Number(member.updatedAt || 0) < 8000).map((member) => ({ id: member.userId, username: member.username || 'Birisi' })));
      setReadAtByUser(Object.fromEntries(latest.filter((member) => member.lastReadAt).map((member) => [member.userId, member.lastReadAt])));
    };

    channel.on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        subscribedRef.current = true;
        const current = activityRef.current;
        void channel.track({ userId: current.userId, username: current.username, isTyping: current.isTyping, lastReadAt: current.lastReadAt, updatedAt: Date.now() });
        syncPresence();
      });

    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [scope, user?.id]);

  useEffect(() => {
    activityRef.current = { userId: user?.id, username: user?.username, isTyping, lastReadAt };
    const channel = channelRef.current;
    if (!channel || !subscribedRef.current || !user?.id) return;
    void channel.track({ userId: user.id, username: user.username, isTyping, lastReadAt, updatedAt: Date.now() });
  }, [isTyping, lastReadAt, user?.id, user?.username]);

  return { typingUsers: scope && user?.id ? typingUsers : [], readAtByUser: scope && user?.id ? readAtByUser : {} };
}
