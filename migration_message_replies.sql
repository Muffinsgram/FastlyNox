-- Add this migration in Supabase SQL Editor to enable persistent message replies.
alter table public.messages
  add column if not exists reply_to jsonb;

alter table public.dm_messages
  add column if not exists reply_to jsonb;

comment on column public.messages.reply_to is 'Snapshot of the message being replied to: id, user_id, username, content';
comment on column public.dm_messages.reply_to is 'Snapshot of the message being replied to: id, user_id, username, content';
