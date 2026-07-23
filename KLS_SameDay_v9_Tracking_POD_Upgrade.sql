-- KLS SameDay Office v9: Driver App, customer tracking and POD
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.jobs add column if not exists tracking_token uuid default gen_random_uuid();
alter table public.jobs add column if not exists last_latitude double precision;
alter table public.jobs add column if not exists last_longitude double precision;
alter table public.jobs add column if not exists location_accuracy double precision;
alter table public.jobs add column if not exists location_updated_at timestamptz;
alter table public.jobs add column if not exists recipient_name text;
alter table public.jobs add column if not exists pod_notes text;
alter table public.jobs add column if not exists pod_photo_url text;
alter table public.jobs add column if not exists pod_signature_url text;
alter table public.jobs add column if not exists pod_latitude double precision;
alter table public.jobs add column if not exists pod_longitude double precision;
alter table public.jobs add column if not exists delivered_at timestamptz;

update public.jobs set tracking_token = gen_random_uuid() where tracking_token is null;
alter table public.jobs alter column tracking_token set default gen_random_uuid();
create unique index if not exists jobs_tracking_token_idx on public.jobs(tracking_token);

insert into storage.buckets (id, name, public)
values ('pod', 'pod', true)
on conflict (id) do update set public = true;

-- Logged-in users can upload/read POD files only inside their own user folder.
drop policy if exists "KLS users upload own POD" on storage.objects;
create policy "KLS users upload own POD" on storage.objects for insert to authenticated
with check (bucket_id = 'pod' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "KLS users update own POD" on storage.objects;
create policy "KLS users update own POD" on storage.objects for update to authenticated
using (bucket_id = 'pod' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Public can view POD bucket" on storage.objects;
create policy "Public can view POD bucket" on storage.objects for select to public
using (bucket_id = 'pod');

-- Public tracking only returns the limited fields needed by a customer tracking screen.
create or replace function public.get_public_tracking(p_token uuid)
returns table (
  job_number text,
  status text,
  collection_area text,
  delivery_area text,
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
