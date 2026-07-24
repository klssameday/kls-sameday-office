-- KLS SameDay Office v16: Customer Portal
-- Run once in Supabase SQL Editor after v15.

create extension if not exists pgcrypto;

alter table public.jobs add column if not exists customer_visible boolean not null default true;
alter table public.invoices add column if not exists portal_visible boolean not null default true;

create table if not exists public.customer_users (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(owner_id, auth_user_id, customer_id)
);

create table if not exists public.portal_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  collection_date date not null,
  collection_time time,
  collection_address text not null,
  delivery_address text not null,
  vehicle text not null default 'Luton Tail Lift',
  contact_phone text,
  load_description text,
  special_instructions text,
  status text not null default 'Pending',
  office_notes text,
  created_at timestamptz not null default now(),
  constraint portal_booking_status_check check (status in ('Pending','Approved','Rejected','Converted','Cancelled'))
);

alter table public.customer_users enable row level security;
alter table public.portal_bookings enable row level security;

drop policy if exists "Owners manage portal users" on public.customer_users;
create policy "Owners manage portal users" on public.customer_users for all to authenticated
using (owner_id = auth.uid() or auth_user_id = auth.uid())
with check (owner_id = auth.uid() or auth_user_id = auth.uid());

drop policy if exists "Portal users manage own requests" on public.portal_bookings;
create policy "Portal users manage own requests" on public.portal_bookings for all to authenticated
using (owner_id = auth.uid() or requested_by = auth.uid())
with check (owner_id = auth.uid() or requested_by = auth.uid());

drop policy if exists "Portal customer reads own customer record" on public.customers;
create policy "Portal customer reads own customer record" on public.customers for select to authenticated
using (exists (select 1 from public.customer_users cu where cu.customer_id = customers.id and cu.auth_user_id = auth.uid() and cu.active));

drop policy if exists "Portal customer reads visible jobs" on public.jobs;
create policy "Portal customer reads visible jobs" on public.jobs for select to authenticated
using (customer_visible = true and exists (select 1 from public.customer_users cu where cu.customer_id = jobs.customer_id and cu.auth_user_id = auth.uid() and cu.active));

drop policy if exists "Portal customer reads visible invoices" on public.invoices;
create policy "Portal customer reads visible invoices" on public.invoices for select to authenticated
using (portal_visible = true and exists (select 1 from public.customer_users cu where cu.customer_id = invoices.customer_id and cu.auth_user_id = auth.uid() and cu.active));

create or replace function public.link_customer_portal(p_customer_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
  customer_owner uuid;
begin
  select user_id into customer_owner from public.customers where id = p_customer_id;
  if customer_owner is null or customer_owner <> auth.uid() then raise exception 'Customer not found or access denied'; end if;
  select id into target_user from auth.users where lower(email) = lower(trim(p_email));
  if target_user is null then raise exception 'That email has not created a portal account yet'; end if;
  insert into public.customer_users(owner_id,auth_user_id,customer_id,email,active)
  values(auth.uid(),target_user,p_customer_id,lower(trim(p_email)),true)
  on conflict(owner_id,auth_user_id,customer_id) do update set email=excluded.email,active=true;
  return 'Customer portal access enabled for ' || lower(trim(p_email));
end;
$$;

grant execute on function public.link_customer_portal(uuid,text) to authenticated;

create index if not exists customer_users_auth_idx on public.customer_users(auth_user_id, active);
create index if not exists customer_users_owner_idx on public.customer_users(owner_id, customer_id);
create index if not exists portal_bookings_customer_idx on public.portal_bookings(customer_id, created_at desc);
create index if not exists jobs_portal_customer_idx on public.jobs(customer_id, customer_visible);
create index if not exists invoices_portal_customer_idx on public.invoices(customer_id, portal_visible);
