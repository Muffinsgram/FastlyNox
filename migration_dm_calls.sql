-- Enables private one-to-one voice call invitations and live call status.
create table if not exists public.dm_call_invites (
  id uuid primary key default gen_random_uuid(),
  dm_channel_id uuid not null references public.dm_channels(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_call_invites_distinct_users check (caller_id <> callee_id)
);

create index if not exists dm_call_invites_callee_status_idx
  on public.dm_call_invites (callee_id, status, created_at desc);
create index if not exists dm_call_invites_caller_status_idx
  on public.dm_call_invites (caller_id, status, created_at desc);

alter table public.dm_call_invites enable row level security;
drop policy if exists "DM call participants can read invitations" on public.dm_call_invites;
drop policy if exists "DM participants can start calls" on public.dm_call_invites;
drop policy if exists "DM call participants can update invitations" on public.dm_call_invites;

create policy "DM call participants can read invitations"
on public.dm_call_invites for select to authenticated
using (auth.uid() in (caller_id, callee_id));

create policy "DM participants can start calls"
on public.dm_call_invites for insert to authenticated
with check (
  caller_id = auth.uid()
  and exists (
    select 1 from public.dm_channels dm
    where dm.id = dm_channel_id
      and auth.uid() in (dm.user1_id, dm.user2_id)
      and callee_id in (dm.user1_id, dm.user2_id)
  )
);

create policy "DM call participants can update invitations"
on public.dm_call_invites for update to authenticated
using (auth.uid() in (caller_id, callee_id) and status in ('ringing', 'accepted'))
with check (
  auth.uid() in (caller_id, callee_id)
  and status in ('ringing', 'accepted', 'declined', 'ended')
  and exists (
    select 1 from public.dm_channels dm
    where dm.id = dm_channel_id
      and caller_id in (dm.user1_id, dm.user2_id)
      and callee_id in (dm.user1_id, dm.user2_id)
  )
);

grant select, insert, update on public.dm_call_invites to authenticated;
revoke all on public.dm_call_invites from anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_call_invites') then
    alter publication supabase_realtime add table public.dm_call_invites;
  end if;
end;
$$;
