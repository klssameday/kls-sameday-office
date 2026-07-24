-- KLS SameDay Office v10: Dispatch Centre, driver assignment, multi-drop routes and customer ETA
-- Run this once in Supabase SQL Editor before uploading the v10 website files.

create extension if not exists pgcrypto;

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  vehicle text,
  registration text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.drivers enable row level security;
drop policy if exists "KLS users manage own drivers" on public.drivers;
create policy "KLS users manage own drivers" on public.drivers
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.quotes add column if not exists route_stops jsonb not null default '[]'::jsonb;
alter table public.jobs add column if not exists route_stops jsonb not null default '[]'::jsonb;
alter table public.jobs add column if not exists assigned_driver_id uuid references public.drivers(id) on delete set null;
alter table public.jobs add column if not exists assigned_driver_name text;
alter table public.jobs add column if not exists eta_at timestamptz;

create index if not exists jobs_assigned_driver_idx on public.jobs(assigned_driver_id);
create index if not exists jobs_eta_at_idx on public.jobs(eta_at);

-- Replace the v9 public tracking function so customers can also see ETA and additional stops.
drop function if exists public.get_public_tracking(uuid);
create function public.get_public_tracking(p_token uuid)
returns table (
  job_number text,
  status text,
  collection_area text,
  delivery_area text,
  route_stops jsonb,
  assigned_driver_name text,
  eta_at timestamptz,
  last_latitude double precision,
  last_longitude double precision,
  location_updated_at timestamptz,
  delivered_at timestamptz,
  recipient_name text
)
language sql
security definer
set search_path = public
as $$
  select
    j.job_number,
    j.job_status,
    j.collection_address,
    j.delivery_address,
    coalesce(j.route_stops, '[]'::jsonb),
    j.assigned_driver_name,
    j.eta_at,
    j.last_latitude,
    j.last_longitude,
    j.location_updated_at,
    j.delivered_at,
    j.recipient_name
  from public.jobs j
  where j.tracking_token = p_token
  limit 1;
$$;

revoke all on function public.get_public_tracking(uuid) from public;
grant execute on function public.get_public_tracking(uuid) to anon, authenticated;
