-- KLS SameDay Office v35.2
-- Secure messages between linked customer portals and the office.

begin;

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  customer_id uuid not null,
  auth_user_id uuid not null,
  sender_type text not null default 'customer',
  subject text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_messages_owner_idx
  on public.portal_messages(owner_id);

create index if not exists portal_messages_customer_idx
  on public.portal_messages(customer_id);

alter table public.portal_messages enable row level security;

drop policy if exists portal_messages_office_access
  on public.portal_messages;

create policy portal_messages_office_access
  on public.portal_messages
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists portal_messages_customer_access
  on public.portal_messages;

create policy portal_messages_customer_access
  on public.portal_messages
  for all to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1
      from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = portal_messages.customer_id
        and cu.owner_id = portal_messages.owner_id
        and cu.active = true
    )
  );

commit;
