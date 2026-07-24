-- KLS SameDay Office v19: Route Planner
-- Run once in Supabase SQL Editor after v18.

create extension if not exists pgcrypto;

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  route_date date not null,
  stop_order integer not null default 1 check (stop_order > 0),
  planned_arrival timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, job_id, route_date)
);

alter table public.route_stops enable row level security;

drop policy if exists "Users manage own route stops" on public.route_stops;
create policy "Users manage own route stops"
on public.route_stops
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists route_stops_user_date_idx on public.route_stops(user_id, route_date);
create index if not exists route_stops_driver_date_idx on public.route_stops(driver_id, route_date, stop_order);

create or replace function public.set_route_stops_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists route_stops_updated_at on public.route_stops;
create trigger route_stops_updated_at
before update on public.route_stops
for each row execute function public.set_route_stops_updated_at();
