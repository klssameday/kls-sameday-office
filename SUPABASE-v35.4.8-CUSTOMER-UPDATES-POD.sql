-- KLS SameDay Office v35.4.8
-- Customer stage notifications and collection-photo POD support.

begin;

alter table public.jobs
  add column if not exists collection_photo_url text;

update public.jobs j
set collection_photo_url = checks.photo_url
from (
  select distinct on (job_id) job_id, photo_url
  from public.driver_job_checks
  where check_type = 'collection'
    and photo_url is not null
    and photo_url <> ''
  order by job_id, created_at desc
) checks
where j.id = checks.job_id
  and (j.collection_photo_url is null or j.collection_photo_url = '');

drop policy if exists driver_checks_owner_read on public.driver_job_checks;
create policy driver_checks_owner_read
  on public.driver_job_checks for select
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = driver_job_checks.job_id
        and j.user_id = auth.uid()
    )
  );

create or replace function public.driver_save_collection_check(
  p_job_id uuid,
  p_condition text default null,
  p_notes text default null,
  p_photo_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid := public.current_driver_id();
begin
  if v_driver_id is null then
    raise exception 'Driver account is not linked.';
  end if;

  if not exists (
    select 1 from public.jobs
    where id = p_job_id
      and archived_at is null
      and assigned_driver_id = v_driver_id
  ) then
    raise exception 'Assigned job not found or access denied.';
  end if;

  insert into public.driver_job_checks (
    job_id, driver_id, check_type, condition, notes, photo_url
  ) values (
    p_job_id, v_driver_id, 'collection', p_condition, p_notes, p_photo_url
  );

  update public.jobs
     set collection_photo_url = coalesce(p_photo_url, collection_photo_url)
   where id = p_job_id
     and assigned_driver_id = v_driver_id;
end;
$$;

revoke all on function public.driver_save_collection_check(uuid, text, text, text)
  from public, anon;
grant execute on function public.driver_save_collection_check(uuid, text, text, text)
  to authenticated;

commit;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'collection_photo_url'
  ) as collection_photo_ready,
  to_regprocedure('public.driver_save_collection_check(uuid,text,text,text)') is not null
    as collection_check_rpc_ready;
