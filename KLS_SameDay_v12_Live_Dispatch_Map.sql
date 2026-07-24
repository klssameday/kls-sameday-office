-- KLS SameDay Office v12: Live Dispatch Map and Driver Availability
-- Run once in Supabase SQL Editor after v11.

alter table public.drivers
  add column if not exists availability_status text not null default 'Available';

alter table public.drivers
  add column if not exists last_seen_at timestamptz;

alter table public.drivers
  add column if not exists battery_level integer;

alter table public.drivers
  drop constraint if exists drivers_availability_status_check;

alter table public.drivers
  add constraint drivers_availability_status_check
  check (availability_status in ('Available', 'On Job', 'Break', 'Offline'));

create index if not exists drivers_availability_idx
  on public.drivers(user_id, availability_status);

update public.drivers
set availability_status = 'Available'
where availability_status is null;
