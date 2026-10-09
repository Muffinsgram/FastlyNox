import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { readSavedMessages, toggleSavedMessage } from '../../../lib/savedMessages';

export function SaveMessageButton({ userId, message, sourceType, channelName, author }) {
  const identity = `${userId || ''}:${message?.id || ''}`;
  const [savedState, setSavedState] = useState(() => ({ identity, saved: readSavedMessages(userId).some((item) => item.id === message?.id) }));
  const saved = savedState.identity === identity ? savedState.saved : readSavedMessages(userId).some((item) => item.id === message?.id);
  const handleClick = () => {
    const nextSaved = toggleSavedMessage(userId, {
      id: message.id,
      content: message.content || '',
      image_url: message.image_url || null,
      created_at: message.created_at,
      author: author || 'Kullanıcı',
      source_type: sourceType,
      channel_id: message.channel_id || message.dm_channel_id,
      channel_name: channelName || '',
    });
    setSavedState({ identity, saved: nextSaved });
  };
  return <button type="button" onClick={handleClick} aria-label={saved ? 'Kaydı kaldır' : 'Mesajı kaydet'} aria-pressed={saved} title={saved ? 'Kaydedildi' : 'Kaydet'} className={`rounded-lg p-1.5 transition-colors hover:bg-white/10 ${saved ? 'text-violet-200' : 'text-slate-400 hover:text-white'}`}><Bookmark className="h-3.5 w-3.5" fill={saved ? 'currentColor' : 'none'} /></button>;
}
