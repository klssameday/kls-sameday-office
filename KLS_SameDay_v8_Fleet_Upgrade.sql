-- KLS SameDay Office v8 Fleet & Assignments upgrade
-- Run once in Supabase SQL Editor before opening v8.

begin;

create table if not exists public.fleet (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  vehicle_name text not null,
  registration text not null,
  vehicle_type text,
  status text not null default 'Available',
  mot_due date,
  insurance_due date,
  service_due date,
  loler_due date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.jobs add column if not exists assigned_vehicle_id uuid references public.fleet(id) on delete set null;
alter table public.jobs add column if not exists driver_name text;

alter table public.fleet enable row level security;
drop policy if exists "Own fleet" on public.fleet;
create policy "Own fleet" on public.fleet for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists fleet_user_id_idx on public.fleet(user_id);
create index if not exists jobs_assigned_vehicle_id_idx on public.jobs(assigned_vehicle_id);

commit;
notify pgrst, 'reload schema';
