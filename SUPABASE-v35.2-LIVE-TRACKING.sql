-- KLS SameDay Office v35.2
-- Secure live GPS updates for the driver assigned to an active job.

begin;

alter table public.jobs
  add column if not exists last_latitude double precision,
  add column if not exists last_longitude double precision,
  add column if not exists location_accuracy double precision,
  add column if not exists location_updated_at timestamptz;

create or replace function public.driver_update_location(
  p_job_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs
     set last_latitude = p_latitude,
         last_longitude = p_longitude,
         location_accuracy = p_accuracy,
         location_updated_at = now()
   where id = p_job_id
     and archived_at is null
     and assigned_driver_id in (
       select id
       from public.drivers
       where user_id = auth.uid()
     );

  if not found then
    raise exception 'Assigned job not found or access denied.';
  end if;
end;
$$;

revoke all on function public.driver_update_location(
  uuid, double precision, double precision, double precision
) from public, anon;

grant execute on function public.driver_update_location(
  uuid, double precision, double precision, double precision
) to authenticated;

commit;
