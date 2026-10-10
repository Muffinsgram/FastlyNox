-- Index the exact channel and newest-first ordering used by message history.
-- Safe to run more than once in the Supabase SQL Editor.
CREATE INDEX IF NOT EXISTS messages_channel_created_at_idx
  ON public.messages (channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dm_messages_channel_created_at_idx
  ON public.dm_messages (dm_channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS message_reactions_channel_message_idx
  ON public.message_reactions (channel_id, message_id);

CREATE INDEX IF NOT EXISTS dm_message_reactions_channel_message_idx
  ON public.dm_message_reactions (dm_channel_id, message_id);
