-- KLS SameDay Office v13: Fleet Management
-- Run once in Supabase SQL Editor after v12.

create extension if not exists pgcrypto;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, registration text, vehicle_type text,
  current_mileage integer not null default 0,
  service_due_mileage integer, service_due_date date,
  mot_expiry date, insurance_expiry date, active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  log_date date not null default current_date, litres numeric(10,2) not null default 0,
  cost numeric(10,2) not null default 0, mileage integer, created_at timestamptz not null default now()
);

create table if not exists public.vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  log_date date not null default current_date, category text not null default 'Maintenance',
  description text, supplier text, cost numeric(10,2) not null default 0, mileage integer,
  created_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.vehicle_maintenance enable row level security;

drop policy if exists "KLS users manage own vehicles" on public.vehicles;
create policy "KLS users manage own vehicles" on public.vehicles for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "KLS users manage own fuel logs" on public.fuel_logs;
create policy "KLS users manage own fuel logs" on public.fuel_logs for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "KLS users manage own maintenance" on public.vehicle_maintenance;
create policy "KLS users manage own maintenance" on public.vehicle_maintenance for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

create index if not exists vehicles_user_active_idx on public.vehicles(user_id,active);
create index if not exists fuel_logs_vehicle_date_idx on public.fuel_logs(vehicle_id,log_date desc);
create index if not exists maintenance_vehicle_date_idx on public.vehicle_maintenance(vehicle_id,log_date desc);
