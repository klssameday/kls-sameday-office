-- KLS SameDay Office v14: Booking Calendar and Recurring Jobs
-- Run once in Supabase SQL Editor after v13.

alter table public.jobs add column if not exists booking_notes text;
alter table public.jobs add column if not exists scheduled_end_time time;
alter table public.jobs add column if not exists recurring_job_id uuid;

create table if not exists public.recurring_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  collection_address text not null,
  delivery_address text not null,
  collection_time time,
  vehicle text not null default 'Luton Tail Lift',
  total_price numeric(10,2) not null default 0,
  frequency text not null default 'Weekly',
  next_run_date date not null,
  last_generated_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recurring_jobs_frequency_check check (frequency in ('Daily','Weekly','Fortnightly','Monthly'))
);

alter table public.recurring_jobs enable row level security;

drop policy if exists "KLS users manage own recurring jobs" on public.recurring_jobs;
create policy "KLS users manage own recurring jobs"
on public.recurring_jobs
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists jobs_collection_schedule_idx
on public.jobs(user_id, collection_date, collection_time);

create index if not exists recurring_jobs_next_run_idx
on public.recurring_jobs(user_id, active, next_run_date);
