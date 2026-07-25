-- KLS SameDay v26.6 - repair Driver App account claiming
-- Run this once in Supabase SQL Editor.

begin;

create or replace function public.claim_my_driver_account()
returns table (
  account_id uuid,
  owner_id uuid,
  driver_id uuid,
  linked_driver_id uuid,
  driver_name text,
  driver_phone text,
  driver_vehicle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_account_id uuid;
begin
  if auth.uid() is null or v_email = '' then
    return;
  end if;

  -- Release stale links held by this login, then claim the active account
  -- prepared by the office for this exact authenticated email address.
  update public.driver_accounts
     set auth_user_id = null
   where auth_user_id = auth.uid()
     and lower(trim(email)) <> v_email;

  select da.id into v_account_id
    from public.driver_accounts da
   where lower(trim(da.email)) = v_email
     and da.active = true
   order by da.created_at desc
   limit 1;

  if v_account_id is not null then
    update public.driver_accounts
       set auth_user_id = null
     where auth_user_id = auth.uid()
       and id <> v_account_id;

    update public.driver_accounts
       set auth_user_id = auth.uid()
     where id = v_account_id;
  end if;

  return query
  select da.id, da.owner_id, da.driver_id, da.driver_id,
         d.name, d.phone, d.vehicle
    from public.driver_accounts da
    join public.drivers d on d.id = da.driver_id
   where da.auth_user_id = auth.uid()
     and da.active = true
   order by da.created_at desc
   limit 1;
end;
$$;

revoke all on function public.claim_my_driver_account() from public;
grant execute on function public.claim_my_driver_account() to authenticated;

commit;
