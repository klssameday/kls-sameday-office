-- KLS SameDay Office v33.0 – Professional Dispatch Board
-- Run once in Supabase SQL Editor before using priority controls.

alter table public.jobs
  add column if not exists priority text not null default 'Normal',
  add column if not exists delivery_deadline time,
  add column if not exists dispatch_notes text;

alter table public.jobs drop constraint if exists jobs_priority_check;
alter table public.jobs add constraint jobs_priority_check
  check (priority in ('Normal','Urgent','Timed','VIP'));

create index if not exists jobs_dispatch_priority_idx
  on public.jobs (user_id, priority, collection_date, job_status);
