-- KLS SameDay Office v31.0
-- Customer Portal activation migration
-- Run once in Supabase SQL Editor while signed in as the project owner.

create extension if not exists pgcrypto;

-- Portal visibility fields on existing commercial records.
alter table if exists public.jobs add column if not exists customer_visible boolean not null default true;
alter table if exists public.jobs add column if not exists tracking_token uuid default gen_random_uuid();
alter table if exists public.jobs add column if not exists pod_photo_url text;
alter table if exists public.jobs add column if not exists pod_signature_url text;
alter table if exists public.invoices add column if not exists portal_visible boolean not null default true;

-- Links a Supabase login to one office customer account.
create table if not exists public.customer_users (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  customer_id uuid not null,
  auth_user_id uuid not null unique,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists customer_users_owner_idx on public.customer_users(owner_id);
create index if not exists customer_users_customer_idx on public.customer_users(customer_id);

-- Customer booking requests awaiting office approval.
create table if not exists public.portal_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  customer_id uuid not null,
  auth_user_id uuid not null,
  collection_date date not null,
  collection_time time,
  required_delivery_date date,
  required_delivery_time time,
  collection_address text not null,
  delivery_address text not null,
  vehicle text,
  weight_kg numeric,
  dimensions text,
  collection_contact text,
  delivery_contact text,
  contact_phone text,
  load_description text,
  special_instructions text,
  status text not null default 'Pending',
  office_notes text,
  created_at timestamptz not null default now()
);

create index if not exists portal_bookings_owner_idx on public.portal_bookings(owner_id);
create index if not exists portal_bookings_customer_idx on public.portal_bookings(customer_id);

-- Saved customer delivery locations.
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  customer_id uuid not null,
  auth_user_id uuid not null,
  label text not null,
  address text not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_addresses_customer_idx on public.customer_addresses(customer_id);

-- Messages sent from a customer portal to the office.
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

create index if not exists portal_messages_owner_idx on public.portal_messages(owner_id);
create index if not exists portal_messages_customer_idx on public.portal_messages(customer_id);

-- Turn on row-level security.
alter table public.customer_users enable row level security;
alter table public.portal_bookings enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.portal_messages enable row level security;

-- Recreate policies so this migration is safe to run again.
drop policy if exists customer_users_office_access on public.customer_users;
drop policy if exists customer_users_customer_read on public.customer_users;
create policy customer_users_office_access on public.customer_users
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy customer_users_customer_read on public.customer_users
  for select to authenticated
  using (auth_user_id = auth.uid() and active = true);

drop policy if exists portal_bookings_office_access on public.portal_bookings;
drop policy if exists portal_bookings_customer_access on public.portal_bookings;
create policy portal_bookings_office_access on public.portal_bookings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy portal_bookings_customer_access on public.portal_bookings
  for all to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = portal_bookings.customer_id
        and cu.owner_id = portal_bookings.owner_id
        and cu.active = true
    )
  );

drop policy if exists customer_addresses_office_access on public.customer_addresses;
drop policy if exists customer_addresses_customer_access on public.customer_addresses;
create policy customer_addresses_office_access on public.customer_addresses
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy customer_addresses_customer_access on public.customer_addresses
  for all to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = customer_addresses.customer_id
        and cu.owner_id = customer_addresses.owner_id
        and cu.active = true
    )
  );

drop policy if exists portal_messages_office_access on public.portal_messages;
drop policy if exists portal_messages_customer_access on public.portal_messages;
create policy portal_messages_office_access on public.portal_messages
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy portal_messages_customer_access on public.portal_messages
  for all to authenticated
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = portal_messages.customer_id
        and cu.owner_id = portal_messages.owner_id
        and cu.active = true
    )
  );

-- Allow customer accounts to see only their own customer-visible commercial records.
-- Existing office policies remain in place.
drop policy if exists jobs_customer_portal_read on public.jobs;
create policy jobs_customer_portal_read on public.jobs
  for select to authenticated
  using (
    customer_visible = true
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = jobs.customer_id
        and cu.active = true
    )
  );

drop policy if exists invoices_customer_portal_read on public.invoices;
create policy invoices_customer_portal_read on public.invoices
  for select to authenticated
  using (
    portal_visible = true
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = invoices.customer_id
        and cu.active = true
    )
  );

drop policy if exists quotes_customer_portal_read on public.quotes;
create policy quotes_customer_portal_read on public.quotes
  for select to authenticated
  using (
    status in ('Sent','Accepted','Declined')
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = quotes.customer_id
        and cu.active = true
    )
  );

drop policy if exists quotes_customer_portal_update on public.quotes;
create policy quotes_customer_portal_update on public.quotes
  for update to authenticated
  using (
    status = 'Sent'
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = quotes.customer_id
        and cu.active = true
    )
  )
  with check (
    status in ('Accepted','Declined')
    and exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = quotes.customer_id
        and cu.active = true
    )
  );

-- Office-only helper: link an existing Supabase login email to a customer.
create or replace function public.link_customer_portal(p_customer_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_user_id uuid;
  v_company text;
begin
  select id into v_auth_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_auth_user_id is null then
    raise exception 'No Supabase login exists for %. Ask the customer to create an account first.', p_email;
  end if;

  select company into v_company
  from public.customers
  where id = p_customer_id and user_id = auth.uid();

  if v_company is null then
    raise exception 'Customer not found or not owned by this office account.';
  end if;

  insert into public.customer_users(owner_id, customer_id, auth_user_id, email, active)
  values (auth.uid(), p_customer_id, v_auth_user_id, lower(trim(p_email)), true)
  on conflict (auth_user_id) do update
    set owner_id = excluded.owner_id,
        customer_id = excluded.customer_id,
        email = excluded.email,
        active = true;

  return 'Customer portal enabled for ' || v_company || '.';
end;
$$;

revoke all on function public.link_customer_portal(uuid,text) from public;
grant execute on function public.link_customer_portal(uuid,text) to authenticated;
