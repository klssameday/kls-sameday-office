-- ============================================================
-- KLS SameDay Office v24
-- Separate Driver App, restricted driver access and automatic tracking
-- Safe to run more than once.
-- ============================================================

begin;

create extension if not exists pgcrypto;

alter table public.jobs add column if not exists started_at timestamptz;
alter table public.jobs add column if not exists collected_at timestamptz;
alter table public.jobs add column if not exists arrived_collection_at timestamptz;
alter table public.jobs add column if not exists arrived_delivery_at timestamptz;
alter table public.jobs add column if not exists tracking_started_at timestamptz;
alter table public.jobs add column if not exists tracking_stopped_at timestamptz;

create table if not exists public.driver_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, driver_id),
  unique (owner_id, email)
);

create index if not exists driver_accounts_email_idx
  on public.driver_accounts (lower(email));
create index if not exists driver_accounts_auth_idx
  on public.driver_accounts (auth_user_id);

alter table public.driver_accounts enable row level security;

drop policy if exists "Office manages driver accounts" on public.driver_accounts;
create policy "Office manages driver accounts"
on public.driver_accounts
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Driver reads own account" on public.driver_accounts;
create policy "Driver reads own account"
on public.driver_accounts
for select to authenticated
using (auth_user_id = auth.uid());

-- A driver can claim the account prepared by the office when the login email matches.
create or replace function public.claim_my_driver_account()
returns table (
  account_id uuid,
  owner_id uuid,
  driver_id uuid,
  driver_name text,
  driver_phone text,
  driver_vehicle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then
    return;
  end if;

  update public.driver_accounts da
     set auth_user_id = auth.uid()
   where lower(da.email) = v_email
     and da.active = true
     and (da.auth_user_id is null or da.auth_user_id = auth.uid());

  return query
  select da.id, da.owner_id, da.driver_id, d.name, d.phone, d.vehicle
    from public.driver_accounts da
    join public.drivers d on d.id = da.driver_id
   where da.auth_user_id = auth.uid()
     and da.active = true
   limit 1;
end;
$$;

revoke all on function public.claim_my_driver_account() from public;
grant execute on function public.claim_my_driver_account() to authenticated;

-- Driver-safe job feed. Deliberately excludes prices, invoices, costs and accounts.
create or replace function public.get_my_driver_jobs()
returns table (
  id uuid,
  job_number text,
  customer_name text,
  contact_name text,
  customer_phone text,
  collection_date date,
  collection_time time,
  collection_address text,
  delivery_address text,
  vehicle text,
  goods_description text,
  booking_notes text,
  job_status text,
  route_stops jsonb,
  tracking_token uuid,
  eta_at timestamptz,
  started_at timestamptz,
  arrived_collection_at timestamptz,
  collected_at timestamptz,
  arrived_delivery_at timestamptz,
  delivered_at timestamptz,
  recipient_name text,
  pod_notes text,
  pod_photo_url text,
  pod_signature_url text,
  last_latitude double precision,
  last_longitude double precision,
  location_updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    j.id,
    j.job_number,
    coalesce(j.customer_name, j.contact_name),
    j.contact_name,
    coalesce(c.phone, null),
    j.collection_date,
    j.collection_time,
    j.collection_address,
    j.delivery_address,
    j.vehicle,
    j.goods_description,
    j.booking_notes,
    j.job_status,
    coalesce(j.route_stops, '[]'::jsonb),
    j.tracking_token,
    j.eta_at,
    j.started_at,
    j.arrived_collection_at,
    j.collected_at,
    j.arrived_delivery_at,
    j.delivered_at,
    j.recipient_name,
    j.pod_notes,
    j.pod_photo_url,
    j.pod_signature_url,
    j.last_latitude,
    j.last_longitude,
    j.location_updated_at
  from public.jobs j
  left join public.customers c on c.id = j.customer_id
  join public.driver_accounts da
    on da.driver_id = j.assigned_driver_id
   and da.auth_user_id = auth.uid()
   and da.active = true
  where j.job_status <> 'Cancelled'
  order by j.collection_date nulls last, j.collection_time nulls last, j.created_at;
$$;

revoke all on function public.get_my_driver_jobs() from public;
grant execute on function public.get_my_driver_jobs() to authenticated;

create or replace function public.driver_update_job_status(
  p_job_id uuid,
  p_status text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
  v_now timestamptz := now();
begin
  select exists (
    select 1
      from public.jobs j
      join public.driver_accounts da on da.driver_id = j.assigned_driver_id
     where j.id = p_job_id
       and da.auth_user_id = auth.uid()
       and da.active = true
  ) into v_allowed;

  if not v_allowed then
    raise exception 'This job is not assigned to your driver account.';
  end if;

  if p_status not in ('En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery') then
    raise exception 'Invalid driver status.';
  end if;

  update public.jobs
     set job_status = p_status,
         started_at = case when p_status = 'En Route to Collection' then coalesce(started_at, v_now) else started_at end,
         tracking_started_at = case when p_status = 'En Route to Collection' then coalesce(tracking_started_at, v_now) else tracking_started_at end,
         arrived_collection_at = case when p_status = 'Arrived at Collection' then coalesce(arrived_collection_at, v_now) else arrived_collection_at end,
         collected_at = case when p_status = 'Collected' then coalesce(collected_at, v_now) else collected_at end,
         arrived_delivery_at = case when p_status = 'Arrived at Delivery' then coalesce(arrived_delivery_at, v_now) else arrived_delivery_at end,
         last_latitude = coalesce(p_latitude, last_latitude),
         last_longitude = coalesce(p_longitude, last_longitude),
         location_accuracy = coalesce(p_accuracy, location_accuracy),
         location_updated_at = case when p_latitude is not null and p_longitude is not null then v_now else location_updated_at end
   where id = p_job_id;
end;
$$;

revoke all on function public.driver_update_job_status(uuid,text,double precision,double precision,double precision) from public;
grant execute on function public.driver_update_job_status(uuid,text,double precision,double precision,double precision) to authenticated;

create or replace function public.driver_update_location(
  p_job_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.jobs j
      join public.driver_accounts da on da.driver_id = j.assigned_driver_id
     where j.id = p_job_id
       and da.auth_user_id = auth.uid()
       and da.active = true
       and j.job_status not in ('Delivered','Cancelled')
  ) then
    raise exception 'Active assigned job not found.';
  end if;

  update public.jobs
     set last_latitude = p_latitude,
         last_longitude = p_longitude,
         location_accuracy = p_accuracy,
         location_updated_at = now()
   where id = p_job_id;
end;
$$;

revoke all on function public.driver_update_location(uuid,double precision,double precision,double precision) from public;
grant execute on function public.driver_update_location(uuid,double precision,double precision,double precision) to authenticated;

create or replace function public.driver_complete_job(
  p_job_id uuid,
  p_recipient_name text,
  p_pod_notes text,
  p_photo_url text,
  p_signature_url text,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_recipient_name,'')) = '' then
    raise exception 'Recipient name is required.';
  end if;
  if trim(coalesce(p_photo_url,'')) = '' then
    raise exception 'A delivery photo is required.';
  end if;
  if trim(coalesce(p_signature_url,'')) = '' then
    raise exception 'A signature is required.';
  end if;

  if not exists (
    select 1
      from public.jobs j
      join public.driver_accounts da on da.driver_id = j.assigned_driver_id
     where j.id = p_job_id
       and da.auth_user_id = auth.uid()
       and da.active = true
  ) then
    raise exception 'This job is not assigned to your driver account.';
  end if;

  update public.jobs
     set recipient_name = trim(p_recipient_name),
         pod_notes = nullif(trim(coalesce(p_pod_notes,'')),''),
         pod_photo_url = p_photo_url,
         pod_signature_url = p_signature_url,
         pod_latitude = coalesce(p_latitude, last_latitude),
         pod_longitude = coalesce(p_longitude, last_longitude),
         last_latitude = coalesce(p_latitude, last_latitude),
         last_longitude = coalesce(p_longitude, last_longitude),
         location_updated_at = case when p_latitude is not null and p_longitude is not null then now() else location_updated_at end,
         job_status = 'Delivered',
         delivered_at = now(),
         tracking_stopped_at = now()
   where id = p_job_id;
end;
$$;

revoke all on function public.driver_complete_job(uuid,text,text,text,text,double precision,double precision) from public;
grant execute on function public.driver_complete_job(uuid,text,text,text,text,double precision,double precision) to authenticated;

commit;
notify pgrst, 'reload schema';
