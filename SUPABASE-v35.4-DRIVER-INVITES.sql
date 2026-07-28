-- KLS SameDay Office v35.4
-- Secure office-issued Driver App invitations and separate driver logins.

begin;

create table if not exists public.driver_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  email text not null,
  auth_user_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists driver_accounts_driver_id_uidx
  on public.driver_accounts(driver_id);
create index if not exists driver_accounts_email_idx
  on public.driver_accounts(lower(email));
create index if not exists driver_accounts_auth_user_id_idx
  on public.driver_accounts(auth_user_id);

alter table public.driver_accounts enable row level security;

drop policy if exists driver_accounts_owner_manage on public.driver_accounts;
create policy driver_accounts_owner_manage
  on public.driver_accounts for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists driver_accounts_driver_read on public.driver_accounts;
create policy driver_accounts_driver_read
  on public.driver_accounts for select
  using (active = true and auth_user_id = auth.uid());

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select da.driver_id
      from public.driver_accounts da
      where da.auth_user_id = auth.uid()
        and da.active = true
      order by da.created_at desc
      limit 1
    ),
    (
      select d.id
      from public.drivers d
      where d.user_id = auth.uid()
      limit 1
    )
  );
$$;

revoke all on function public.current_driver_id() from public, anon;
grant execute on function public.current_driver_id() to authenticated;

create or replace function public.claim_driver_login()
returns table (
  id uuid,
  owner_id uuid,
  driver_id uuid,
  email text,
  auth_user_id uuid,
  active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_matches integer;
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'Sign in with the email used in your KLS driver invitation.';
  end if;

  select count(*)
    into v_matches
    from public.driver_accounts da
   where lower(trim(da.email)) = v_email
     and da.active = true;

  if v_matches = 0 then
    raise exception 'No active driver invitation matches %. Ask the KLS office to check the email and resend the setup link.', v_email;
  elsif v_matches > 1 then
    raise exception 'This email is linked to more than one active driver. Ask the KLS office to correct the driver records.';
  end if;

  if exists (
    select 1
      from public.driver_accounts da
     where lower(trim(da.email)) = v_email
       and da.active = true
       and da.auth_user_id is not null
       and da.auth_user_id <> auth.uid()
  ) then
    raise exception 'This driver invitation has already been activated with another login.';
  end if;

  update public.driver_accounts da
     set auth_user_id = auth.uid()
   where lower(trim(da.email)) = v_email
     and da.active = true
     and (da.auth_user_id is null or da.auth_user_id = auth.uid());

  return query
  select da.id, da.owner_id, da.driver_id, da.email, da.auth_user_id, da.active, da.created_at
    from public.driver_accounts da
   where da.auth_user_id = auth.uid()
     and da.active = true
   order by da.created_at desc
   limit 1;
end;
$$;

revoke all on function public.claim_driver_login() from public, anon;
grant execute on function public.claim_driver_login() to authenticated;

drop policy if exists drivers_linked_driver_read on public.drivers;
create policy drivers_linked_driver_read
  on public.drivers for select
  using (id = public.current_driver_id());

drop policy if exists drivers_linked_driver_update on public.drivers;
create policy drivers_linked_driver_update
  on public.drivers for update
  using (id = public.current_driver_id())
  with check (id = public.current_driver_id());

drop policy if exists jobs_linked_driver_read on public.jobs;
create policy jobs_linked_driver_read
  on public.jobs for select
  using (assigned_driver_id = public.current_driver_id());

drop policy if exists driver_checks_own on public.driver_job_checks;
create policy driver_checks_own
  on public.driver_job_checks for all
  using (driver_id = public.current_driver_id())
  with check (driver_id = public.current_driver_id());

drop policy if exists driver_incidents_own on public.driver_incidents;
create policy driver_incidents_own
  on public.driver_incidents for all
  using (driver_id = public.current_driver_id())
  with check (driver_id = public.current_driver_id());

drop policy if exists driver_messages_own on public.driver_messages;
create policy driver_messages_own
  on public.driver_messages for select
  using (driver_id = public.current_driver_id());

drop policy if exists driver_job_messages_own_select on public.driver_job_messages;
create policy driver_job_messages_own_select
  on public.driver_job_messages for select
  using (driver_id = public.current_driver_id());

drop policy if exists driver_job_messages_own_insert on public.driver_job_messages;
create policy driver_job_messages_own_insert
  on public.driver_job_messages for insert
  with check (sender_type = 'driver' and driver_id = public.current_driver_id());

drop policy if exists job_documents_driver_read_v354 on public.job_documents;
create policy job_documents_driver_read_v354
  on public.job_documents for select
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_documents.job_id
        and j.assigned_driver_id = public.current_driver_id()
    )
  );

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
     and assigned_driver_id = public.current_driver_id();

  if not found then
    raise exception 'Assigned job not found or access denied.';
  end if;
end;
$$;

create or replace function public.driver_update_job_status(
  p_job_id uuid,
  p_status text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in (
    'Booked', 'En Route to Collection', 'Arrived at Collection',
    'Collected', 'In Transit', 'Arrived at Delivery', 'Delivered'
  ) then
    raise exception 'Unsupported driver job status.';
  end if;

  update public.jobs
     set job_status = p_status,
         last_latitude = coalesce(p_latitude, last_latitude),
         last_longitude = coalesce(p_longitude, last_longitude),
         location_accuracy = coalesce(p_accuracy, location_accuracy),
         location_updated_at = case when p_latitude is not null then now() else location_updated_at end
   where id = p_job_id
     and archived_at is null
     and assigned_driver_id = public.current_driver_id();

  if not found then
    raise exception 'Assigned job not found or access denied.';
  end if;
end;
$$;

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
set search_path = public
as $$
begin
  update public.jobs
     set job_status = 'Delivered',
         delivered_at = now(),
         recipient_name = p_recipient_name,
         pod_notes = p_pod_notes,
         pod_photo_url = p_photo_url,
         pod_signature_url = p_signature_url,
         last_latitude = coalesce(p_latitude, last_latitude),
         last_longitude = coalesce(p_longitude, last_longitude),
         location_updated_at = case when p_latitude is not null then now() else location_updated_at end
   where id = p_job_id
     and archived_at is null
     and assigned_driver_id = public.current_driver_id();

  if not found then
    raise exception 'Assigned job not found or access denied.';
  end if;
end;
$$;

revoke all on function public.driver_update_location(uuid, double precision, double precision, double precision) from public, anon;
revoke all on function public.driver_update_job_status(uuid, text, double precision, double precision, double precision) from public, anon;
revoke all on function public.driver_complete_job(uuid, text, text, text, text, double precision, double precision) from public, anon;
grant execute on function public.driver_update_location(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.driver_update_job_status(uuid, text, double precision, double precision, double precision) to authenticated;
grant execute on function public.driver_complete_job(uuid, text, text, text, text, double precision, double precision) to authenticated;

commit;

select
  to_regprocedure('public.claim_driver_login()') is not null as driver_invites_ready,
  to_regprocedure('public.driver_update_job_status(uuid,text,double precision,double precision,double precision)') is not null as driver_status_ready,
  to_regprocedure('public.driver_complete_job(uuid,text,text,text,text,double precision,double precision)') is not null as driver_pod_ready;
