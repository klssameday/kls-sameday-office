-- ============================================================
-- KLS SameDay Office v23
-- Mobile Driver Mode Migration
-- Safe to run more than once
-- ============================================================

begin;

-- Saved when the driver starts travelling to the collection.
alter table public.jobs
add column if not exists started_at timestamptz;

-- Saved when the driver confirms the goods have been collected.
alter table public.jobs
add column if not exists collected_at timestamptz;

-- Existing POD versions already use this field; this confirms it exists.
alter table public.jobs
add column if not exists delivered_at timestamptz;

-- Automatically set timestamps whenever job status changes anywhere in the app.
create or replace function public.set_kls_driver_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.job_status = 'En Route to Collection'
     and old.job_status is distinct from new.job_status
     and new.started_at is null then
    new.started_at := now();
  end if;

  if new.job_status = 'Collected'
     and old.job_status is distinct from new.job_status
     and new.collected_at is null then
    new.collected_at := now();
  end if;

  if new.job_status = 'Delivered'
     and old.job_status is distinct from new.job_status
     and new.delivered_at is null then
    new.delivered_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists kls_driver_timestamps_trigger on public.jobs;

create trigger kls_driver_timestamps_trigger
before update of job_status on public.jobs
for each row
execute function public.set_kls_driver_timestamps();

create index if not exists jobs_started_at_idx
on public.jobs(user_id, started_at);

create index if not exists jobs_collected_at_idx
on public.jobs(user_id, collected_at);

create index if not exists jobs_delivered_at_idx
on public.jobs(user_id, delivered_at);

commit;

notify pgrst, 'reload schema';

-- Confirmation: Supabase should return these three rows.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'jobs'
  and column_name in ('started_at', 'collected_at', 'delivered_at')
order by column_name;
