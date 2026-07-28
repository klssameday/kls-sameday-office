-- KLS SameDay Office v35.1.1
-- Compatibility repair for jobs tables that do not have an updated_at column.

begin;

create or replace function public.archive_job(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  archived_job public.jobs;
begin
  update public.jobs
     set archived_at = now(),
         archived_by = auth.uid()
   where id = p_job_id
     and user_id = auth.uid()
     and archived_at is null
     and job_status in ('Delivered', 'Cancelled')
  returning * into archived_job;

  if archived_job.id is null then
    raise exception 'Only your delivered or cancelled jobs can be archived.';
  end if;

  return archived_job;
end;
$$;

create or replace function public.restore_archived_job(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  restored_job public.jobs;
begin
  update public.jobs
     set archived_at = null,
         archived_by = null
   where id = p_job_id
     and user_id = auth.uid()
     and archived_at is not null
  returning * into restored_job;

  if restored_job.id is null then
    raise exception 'Archived job not found or access denied.';
  end if;

  return restored_job;
end;
$$;

revoke all on function public.archive_job(uuid) from public, anon;
revoke all on function public.restore_archived_job(uuid) from public, anon;
grant execute on function public.archive_job(uuid) to authenticated;
grant execute on function public.restore_archived_job(uuid) to authenticated;

commit;
