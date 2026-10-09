-- Run migration_public_numeric_ids.sql first, then run this in Supabase SQL Editor.
-- Enables numeric @user/@role mentions, @everyone and server badges.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'mention',
  title text not null,
  body text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists server_id uuid references public.servers(id) on delete cascade;
alter table public.notifications add column if not exists channel_id uuid references public.channels(id) on delete cascade;
alter table public.notifications add column if not exists sender_id uuid references public.profiles(id) on delete set null;
alter table public.notifications add column if not exists message_id uuid references public.messages(id) on delete cascade;
alter table public.notifications add column if not exists type text not null default 'mention';
alter table public.notifications add column if not exists title text not null default 'Yeni bildirim';
alter table public.notifications add column if not exists body text not null default '';
alter table public.notifications add column if not exists is_read boolean not null default false;
alter table public.notifications add column if not exists created_at timestamptz not null default now();
create index if not exists notifications_user_unread_server_idx
  on public.notifications (user_id, server_id, created_at desc) where is_read = false;

alter table public.notifications enable row level security;
do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies where schemaname = 'public' and tablename = 'notifications' loop
    execute format('drop policy if exists %I on public.notifications', policy_row.policyname);
  end loop;
end;
$$;
drop trigger if exists notify_server_message_mentions on public.messages;
drop function if exists public.notify_server_message_mentions();

create or replace function public.notify_server_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_server_id uuid;
  sender_name text;
  sender_role text;
  is_everyone boolean;
begin
  if coalesce(trim(new.content), '') = '' then return new; end if;
  select c.server_id into target_server_id from public.channels c where c.id = new.channel_id;
  if target_server_id is null then return new; end if;

  select p.username, sm.role into sender_name, sender_role
  from public.profiles p
  join public.server_members sm on sm.user_id = p.id and sm.server_id = target_server_id
  where p.id = new.user_id;
  if sender_name is null then return new; end if;

  is_everyone := lower(new.content) ~ '(^|[^[:alnum:]_])@everyone([^[:alnum:]_]|$)'
    and (sender_role in ('owner', 'admin') or exists (
      select 1 from public.servers s where s.id = target_server_id and s.owner_id = new.user_id
    ));

  if is_everyone then
    insert into public.notifications (user_id, type, title, body, server_id, channel_id, sender_id, message_id)
    select sm.user_id, 'mention', '@everyone etiketi', coalesce(sender_name, 'Bir kullanıcı') || ' sunucudaki herkesi etiketledi.', target_server_id, new.channel_id, new.user_id, new.id
    from public.server_members sm
    where sm.server_id = target_server_id and sm.user_id <> new.user_id;
  else
    insert into public.notifications (user_id, type, title, body, server_id, channel_id, sender_id, message_id)
    select distinct p.id, 'mention', 'Senden bahsedildi', coalesce(sender_name, 'Bir kullanıcı') || ' bir mesajda senden bahsetti.', target_server_id, new.channel_id, new.user_id, new.id
    from (
      select tags.capture[1]::uuid as user_id
      from regexp_matches(lower(new.content), '<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') as tags(capture)
      union
      select p.id as user_id
      from regexp_matches(lower(new.content), '<@([0-9]+)>', 'g') as tags(capture)
      join public.profiles p on p.public_id = tags.capture[1]::bigint
      union
      select smr.user_id
      from regexp_matches(lower(new.content), '<@&([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>', 'g') as tags(capture)
      join public.server_roles sr on sr.id = tags.capture[1]::uuid and sr.server_id = target_server_id
      join public.server_member_roles smr on smr.role_id = sr.id and smr.server_id = target_server_id
      where sr.mentionable or sender_role in ('owner', 'admin') or exists (select 1 from public.servers s where s.id = target_server_id and s.owner_id = new.user_id)
      union
      select smr.user_id
      from regexp_matches(lower(new.content), '<@&([0-9]+)>', 'g') as tags(capture)
      join public.server_roles sr on sr.public_id = tags.capture[1]::bigint and sr.server_id = target_server_id
      join public.server_member_roles smr on smr.role_id = sr.id and smr.server_id = target_server_id
      where sr.mentionable or sender_role in ('owner', 'admin') or exists (select 1 from public.servers s where s.id = target_server_id and s.owner_id = new.user_id)
      union
      select p.id
      from regexp_matches(lower(new.content), '(^|[^[:alnum:]_])@([[:alnum:]_.-]+)', 'g') as tags(capture)
      join public.profiles p on lower(p.username) = tags.capture[2]
      where tags.capture[2] <> 'everyone'
    ) as mentioned
    join public.profiles p on p.id = mentioned.user_id
    join public.server_members sm on sm.user_id = p.id and sm.server_id = target_server_id
    where p.id <> new.user_id;
  end if;
  return new;
end;
$$;

create trigger notify_server_message_mentions
after insert on public.messages
for each row execute function public.notify_server_message_mentions();

grant select, update on public.notifications to authenticated;
revoke insert, delete on public.notifications from anon, authenticated;
create policy "Users read their notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "Users mark their notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
