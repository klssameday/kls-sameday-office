-- KLS SameDay Office v35.1
-- Safe job archive, restore and owner-only permanent deletion.
-- Run once in the Supabase SQL Editor while signed in as the project owner.

begin;

alter table public.jobs
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create index if not exists jobs_owner_archived_idx
  on public.jobs (user_id, archived_at, created_at desc);

create table if not exists public.job_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  owner_id uuid not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  job_number text,
  job_status text,
  customer_name text,
  collection_address text,
  delivery_address text,
  snapshot jsonb not null
);

alter table public.job_deletion_audit enable row level security;

drop policy if exists job_deletion_audit_owner_read on public.job_deletion_audit;
create policy job_deletion_audit_owner_read
  on public.job_deletion_audit
  for select
  using (owner_id = auth.uid());

-- Replace the v34.5 open document policy. Office owners manage documents;
-- drivers may read documents only for their own active assigned jobs.
drop policy if exists job_documents_policy on public.job_documents;
drop policy if exists job_documents_owner_manage on public.job_documents;
drop policy if exists job_documents_assigned_driver_read on public.job_documents;

create policy job_documents_owner_manage
  on public.job_documents
  for all
  using (
    exists (
      select 1
        from public.jobs
       where jobs.id = job_documents.job_id
         and jobs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.jobs
       where jobs.id = job_documents.job_id
         and jobs.user_id = auth.uid()
    )
  );

create policy job_documents_assigned_driver_read
  on public.job_documents
  for select
  using (
    exists (
      select 1
        from public.jobs
        join public.drivers
          on drivers.id = jobs.assigned_driver_id
       where jobs.id = job_documents.job_id
         and jobs.archived_at is null
         and drivers.user_id = auth.uid()
    )
  );

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

create or replace function public.delete_archived_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_job public.jobs;
begin
  select *
    into deleted_job
    from public.jobs
   where id = p_job_id
     and user_id = auth.uid()
     and archived_at is not null
   for update;

  if deleted_job.id is null then
    raise exception 'Archived job not found or access denied.';
  end if;

  if exists (select 1 from public.invoices where job_id = p_job_id) then
    raise exception 'This job has an invoice and cannot be permanently deleted.';
  end if;

  insert into public.job_deletion_audit (
    job_id,
    owner_id,
    deleted_by,
    job_number,
    job_status,
    customer_name,
    collection_address,
    delivery_address,
    snapshot
  ) values (
    deleted_job.id,
    deleted_job.user_id,
    auth.uid(),
    deleted_job.job_number,
    deleted_job.job_status,
    coalesce(deleted_job.customer_name, deleted_job.contact_name),
    deleted_job.collection_address,
    deleted_job.delivery_address,
    to_jsonb(deleted_job)
  );

  delete from public.jobs
   where id = deleted_job.id
     and user_id = auth.uid();
end;
$$;

revoke all on function public.archive_job(uuid) from public, anon;
revoke all on function public.restore_archived_job(uuid) from public, anon;
revoke all on function public.delete_archived_job(uuid) from public, anon;

grant execute on function public.archive_job(uuid) to authenticated;
grant execute on function public.restore_archived_job(uuid) to authenticated;
grant execute on function public.delete_archived_job(uuid) to authenticated;

commit;
