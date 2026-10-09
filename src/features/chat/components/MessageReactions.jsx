import { useState } from 'react';
import { Plus } from 'lucide-react';
import { MESSAGE_REACTIONS } from '../../../lib/messageReactions';

export function MessageReactions({ reactions = [], currentUserId, onToggle, pickerOnly = false }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState('');
  const grouped = MESSAGE_REACTIONS
    .map((emoji) => ({
      emoji,
      count: reactions.filter((reaction) => reaction.emoji === emoji).length,
      selected: reactions.some((reaction) => reaction.emoji === emoji && reaction.user_id === currentUserId),
    }))
    .filter((reaction) => reaction.count > 0);

  const toggle = async (emoji) => {
    setError('');
    const result = await onToggle(emoji);
    if (!result?.success) setError(result?.error || 'Tepki kaydedilemedi.');
    setIsPickerOpen(false);
  };

  return (
    <div className={`relative flex flex-wrap items-center gap-1 ${pickerOnly ? '' : 'mt-1'}`}>
      {!pickerOnly && grouped.map(({ emoji, count, selected }) => (
        <button
          key={emoji}
          type="button"
          aria-pressed={selected}
          aria-label={`${emoji}, ${count} tepki${selected ? ', seçili' : ''}`}
          onClick={() => void toggle(emoji)}
          className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors ${selected ? 'border-violet-400/60 bg-violet-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
        >
          <span aria-hidden="true">{emoji}</span><span>{count}</span>
        </button>
      ))}
      {pickerOnly && <button
        type="button"
        aria-label="Tepki ekle"
        aria-expanded={isPickerOpen}
        onClick={() => setIsPickerOpen((open) => !open)}
        className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>}
      {isPickerOpen && (
        <div role="group" aria-label="Hızlı tepkiler" className="absolute bottom-full left-0 z-30 mb-2 flex gap-1 rounded-xl border border-white/10 bg-[#11151E] p-1.5 shadow-xl">
          {MESSAGE_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => void toggle(emoji)} aria-label={`${emoji} tepkisi ekle`} className="grid h-8 w-8 place-items-center rounded-lg text-lg transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
              {emoji}
            </button>
          ))}
        </div>
      )}
      {error && <span role="alert" className="text-[11px] text-rose-400">{error}</span>}
    </div>
  );
}
