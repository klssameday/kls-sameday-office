-- KLS SameDay Office v26.32 Customer Portal upgrade
-- Run once in Supabase SQL Editor before deploying v26.32.

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  sender_type text not null default 'customer' check (sender_type in ('customer','office')),
  subject text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.portal_messages enable row level security;

drop policy if exists "Owners manage portal messages" on public.portal_messages;
create policy "Owners manage portal messages" on public.portal_messages
for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Customers read linked portal messages" on public.portal_messages;
create policy "Customers read linked portal messages" on public.portal_messages
for select using (
  exists (
    select 1 from public.customer_users cu
    where cu.auth_user_id = auth.uid()
      and cu.customer_id = portal_messages.customer_id
      and cu.owner_id = portal_messages.owner_id
      and cu.active = true
  )
);

drop policy if exists "Customers send linked portal messages" on public.portal_messages;
create policy "Customers send linked portal messages" on public.portal_messages
for insert with check (
  auth_user_id = auth.uid()
  and sender_type = 'customer'
  and exists (
    select 1 from public.customer_users cu
    where cu.auth_user_id = auth.uid()
      and cu.customer_id = portal_messages.customer_id
      and cu.owner_id = portal_messages.owner_id
      and cu.active = true
  )
);

-- Allow linked customers to view and respond to quotations belonging to their account.
drop policy if exists "Customers view linked quotations" on public.quotes;
create policy "Customers view linked quotations" on public.quotes
for select using (
  exists (
    select 1 from public.customer_users cu
    where cu.auth_user_id = auth.uid()
      and cu.customer_id = quotes.customer_id
      and cu.active = true
  )
);

drop policy if exists "Customers respond to linked quotations" on public.quotes;
create policy "Customers respond to linked quotations" on public.quotes
for update using (
  exists (
    select 1 from public.customer_users cu
    where cu.auth_user_id = auth.uid()
      and cu.customer_id = quotes.customer_id
      and cu.active = true
  )
) with check (
  status in ('Accepted','Declined')
  and exists (
    select 1 from public.customer_users cu
    where cu.auth_user_id = auth.uid()
      and cu.customer_id = quotes.customer_id
      and cu.active = true
  )
);
