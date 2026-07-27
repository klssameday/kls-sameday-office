-- KLS SameDay Office v34.3 - Driver App Pro

create table if not exists public.driver_job_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  sender_type text not null default 'driver' check (sender_type in ('driver','dispatch')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists driver_job_messages_job_id_idx on public.driver_job_messages(job_id);
create index if not exists driver_job_messages_driver_id_idx on public.driver_job_messages(driver_id);

alter table public.driver_job_messages enable row level security;

drop policy if exists driver_job_messages_own_select on public.driver_job_messages;
create policy driver_job_messages_own_select on public.driver_job_messages for select using (
  driver_id in (select id from public.drivers where user_id = auth.uid())
);

drop policy if exists driver_job_messages_own_insert on public.driver_job_messages;
create policy driver_job_messages_own_insert on public.driver_job_messages for insert with check (
  sender_type = 'driver' and driver_id in (select id from public.drivers where user_id = auth.uid())
);
