-- KLS SameDay Office v34.1 Driver Professional Workflow
create table if not exists public.driver_job_checks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  check_type text not null check (check_type in ('collection','delivery')),
  condition text, notes text, photo_url text, created_at timestamptz not null default now()
);
create table if not exists public.driver_incidents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  incident_type text not null, notes text not null, photo_url text,
  latitude double precision, longitude double precision,
  status text not null default 'open', created_at timestamptz not null default now()
);
create table if not exists public.driver_messages (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  subject text, message text not null, read_at timestamptz, created_at timestamptz not null default now()
);
alter table public.driver_job_checks enable row level security;
alter table public.driver_incidents enable row level security;
alter table public.driver_messages enable row level security;
drop policy if exists driver_checks_own on public.driver_job_checks;
create policy driver_checks_own on public.driver_job_checks for all using (driver_id in (select id from public.drivers where user_id=auth.uid())) with check (driver_id in (select id from public.drivers where user_id=auth.uid()));
drop policy if exists driver_incidents_own on public.driver_incidents;
create policy driver_incidents_own on public.driver_incidents for all using (driver_id in (select id from public.drivers where user_id=auth.uid())) with check (driver_id in (select id from public.drivers where user_id=auth.uid()));
drop policy if exists driver_messages_own on public.driver_messages;
create policy driver_messages_own on public.driver_messages for select using (driver_id in (select id from public.drivers where user_id=auth.uid()));
