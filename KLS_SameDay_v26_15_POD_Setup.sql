-- KLS SameDay v26.15 — POD upload and driver completion

-- POD fields used by the office and driver apps.
alter table public.jobs add column if not exists recipient_name text;
alter table public.jobs add column if not exists pod_notes text;
alter table public.jobs add column if not exists pod_photo_url text;
alter table public.jobs add column if not exists pod_signature_url text;
alter table public.jobs add column if not exists delivered_at timestamptz;
alter table public.jobs add column if not exists pod_latitude double precision;
alter table public.jobs add column if not exists pod_longitude double precision;

-- Public POD bucket because the current apps use getPublicUrl().
insert into storage.buckets (id,name,public)
values ('pod','pod',true)
on conflict (id) do update set public=true;

drop policy if exists "KLS drivers upload POD" on storage.objects;
create policy "KLS drivers upload POD"
on storage.objects for insert to authenticated
with check (bucket_id='pod' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "KLS users view POD" on storage.objects;
create policy "KLS users view POD"
on storage.objects for select to authenticated
using (bucket_id='pod');

create or replace function public.driver_complete_job(
  p_job_id uuid,
  p_recipient_name text,
  p_pod_notes text default null,
  p_photo_url text default null,
  p_signature_url text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.jobs j
  set recipient_name=p_recipient_name,
      pod_notes=p_pod_notes,
      pod_photo_url=p_photo_url,
      pod_signature_url=p_signature_url,
      pod_latitude=p_latitude,
      pod_longitude=p_longitude,
      job_status='Delivered',
      delivered_at=now()
  where j.id=p_job_id
    and exists (select 1 from public.drivers d where d.id=j.assigned_driver_id and d.user_id=auth.uid());
  if not found then raise exception 'Job not found or not assigned to this driver'; end if;
end;
$$;

grant execute on function public.driver_complete_job(uuid,text,text,text,text,double precision,double precision) to authenticated;
