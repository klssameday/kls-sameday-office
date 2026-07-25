-- KLS SameDay Platform 5.0 - Customer Portal upgrade
-- Run once in Supabase SQL Editor before deploying Platform 5.0.

create extension if not exists pgcrypto;

alter table public.portal_bookings add column if not exists required_delivery_date date;
alter table public.portal_bookings add column if not exists required_delivery_time time;
alter table public.portal_bookings add column if not exists weight_kg numeric;
alter table public.portal_bookings add column if not exists dimensions text;
alter table public.portal_bookings add column if not exists collection_contact text;
alter table public.portal_bookings add column if not exists delivery_contact text;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  label text not null,
  address text not null,
  created_at timestamptz not null default now()
);

alter table public.customer_addresses enable row level security;
drop policy if exists "Portal users manage customer addresses" on public.customer_addresses;
create policy "Portal users manage customer addresses" on public.customer_addresses for all to authenticated
using (
  owner_id = auth.uid() or exists (
    select 1 from public.customer_users cu
    where cu.customer_id = customer_addresses.customer_id
      and cu.auth_user_id = auth.uid() and cu.active
  )
)
with check (
  owner_id = auth.uid() or exists (
    select 1 from public.customer_users cu
    where cu.customer_id = customer_addresses.customer_id
      and cu.auth_user_id = auth.uid() and cu.active
  )
);

create index if not exists customer_addresses_customer_idx on public.customer_addresses(customer_id, label);
