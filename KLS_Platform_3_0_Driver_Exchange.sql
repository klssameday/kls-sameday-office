-- KLS SameDay Platform 3.0 - Driver Exchange
-- Tailored to the confirmed KLS schema. No bid-closing time is used.
begin;
create extension if not exists pgcrypto;

create table if not exists public.driver_network_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_job_id uuid references public.jobs(id) on delete set null,
  collection_area text not null,
  delivery_area text not null,
  collection_date date not null,
  collection_time time,
  vehicle_required text,
  approx_miles numeric not null default 0,
  weight_kg numeric,
  load_description text,
  notes text,
  status text not null default 'Open' check (status in ('Open','Awarded','Withdrawn')),
  awarded_driver_id uuid references public.drivers(id) on delete set null,
  awarded_bid_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_bids (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  network_job_id uuid not null references public.driver_network_jobs(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  message text,
  status text not null default 'Submitted' check (status in ('Submitted','Awarded','Not Awarded','Withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(network_job_id,driver_id)
);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='driver_network_jobs_awarded_bid_id_fkey') then
    alter table public.driver_network_jobs add constraint driver_network_jobs_awarded_bid_id_fkey foreign key(awarded_bid_id) references public.driver_bids(id) on delete set null;
  end if;
end $$;

create index if not exists driver_network_jobs_user_status_idx on public.driver_network_jobs(user_id,status,created_at desc);
create index if not exists driver_bids_job_idx on public.driver_bids(network_job_id,amount);
create index if not exists driver_bids_driver_idx on public.driver_bids(driver_id,created_at desc);

create or replace function public.set_exchange_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists driver_network_jobs_updated_at on public.driver_network_jobs;
create trigger driver_network_jobs_updated_at before update on public.driver_network_jobs for each row execute function public.set_exchange_updated_at();
drop trigger if exists driver_bids_updated_at on public.driver_bids;
create trigger driver_bids_updated_at before update on public.driver_bids for each row execute function public.set_exchange_updated_at();

alter table public.driver_network_jobs enable row level security;
alter table public.driver_bids enable row level security;

drop policy if exists "Office manages network jobs" on public.driver_network_jobs;
create policy "Office manages network jobs" on public.driver_network_jobs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists "Drivers read open network jobs" on public.driver_network_jobs;
create policy "Drivers read open network jobs" on public.driver_network_jobs for select to authenticated using(
 status='Open' and exists(select 1 from public.driver_accounts da join public.drivers d on d.id=da.driver_id where da.auth_user_id=auth.uid() and da.active=true and d.active=true and da.owner_id=driver_network_jobs.user_id)
 or awarded_driver_id=public.current_kls_driver_id()
);

drop policy if exists "Office reads network bids" on public.driver_bids;
create policy "Office reads network bids" on public.driver_bids for select to authenticated using(owner_id=auth.uid());
drop policy if exists "Drivers read own bids" on public.driver_bids;
create policy "Drivers read own bids" on public.driver_bids for select to authenticated using(driver_id=public.current_kls_driver_id());

create or replace function public.get_my_driver_network_jobs()
returns table(id uuid,user_id uuid,collection_area text,delivery_area text,collection_date date,collection_time time,vehicle_required text,approx_miles numeric,weight_kg numeric,load_description text,notes text,status text,created_at timestamptz)
language sql stable security definer set search_path=public as $$
 select n.id,n.user_id,n.collection_area,n.delivery_area,n.collection_date,n.collection_time,n.vehicle_required,n.approx_miles,n.weight_kg,n.load_description,n.notes,n.status,n.created_at
 from public.driver_network_jobs n
 join public.driver_accounts da on da.owner_id=n.user_id
 join public.drivers d on d.id=da.driver_id
 where da.auth_user_id=auth.uid() and da.active=true and d.active=true and (n.status='Open' or n.awarded_driver_id=d.id)
 order by n.created_at desc;
$$;
grant execute on function public.get_my_driver_network_jobs() to authenticated;

create or replace function public.submit_driver_bid(p_network_job_id uuid,p_amount numeric,p_message text default null)
returns public.driver_bids language plpgsql security definer set search_path=public as $$
declare v_driver uuid; v_owner uuid; v_bid public.driver_bids;
begin
 v_driver:=public.current_kls_driver_id();
 if v_driver is null then raise exception 'No active driver account is linked to this login.'; end if;
 select n.user_id into v_owner from public.driver_network_jobs n join public.driver_accounts da on da.owner_id=n.user_id and da.driver_id=v_driver where n.id=p_network_job_id and n.status='Open' and da.auth_user_id=auth.uid() and da.active=true;
 if v_owner is null then raise exception 'This network job is not available.'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Enter a valid offer amount.'; end if;
 insert into public.driver_bids(owner_id,network_job_id,driver_id,amount,message,status) values(v_owner,p_network_job_id,v_driver,p_amount,nullif(trim(coalesce(p_message,'')),''),'Submitted')
 on conflict(network_job_id,driver_id) do update set amount=excluded.amount,message=excluded.message,status='Submitted',updated_at=now() returning * into v_bid;
 return v_bid;
end $$;
grant execute on function public.submit_driver_bid(uuid,numeric,text) to authenticated;

create or replace function public.award_driver_bid(p_bid_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_bid public.driver_bids; v_network public.driver_network_jobs; v_name text;
begin
 select * into v_bid from public.driver_bids where id=p_bid_id and owner_id=auth.uid();
 if v_bid.id is null then raise exception 'Offer not found.'; end if;
 select * into v_network from public.driver_network_jobs where id=v_bid.network_job_id and user_id=auth.uid() for update;
 if v_network.id is null or v_network.status<>'Open' then raise exception 'This network job is no longer open.'; end if;
 select name into v_name from public.drivers where id=v_bid.driver_id;
 update public.driver_network_jobs set status='Awarded',awarded_driver_id=v_bid.driver_id,awarded_bid_id=v_bid.id where id=v_network.id;
 update public.driver_bids set status=case when id=v_bid.id then 'Awarded' else 'Not Awarded' end where network_job_id=v_network.id;
 if v_network.source_job_id is not null then
   update public.jobs set assigned_driver_id=v_bid.driver_id,assigned_driver_name=v_name where id=v_network.source_job_id and user_id=auth.uid();
 end if;
end $$;
grant execute on function public.award_driver_bid(uuid) to authenticated;

create or replace function public.withdraw_driver_network_job(p_network_job_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.driver_network_jobs set status='Withdrawn' where id=p_network_job_id and user_id=auth.uid() and status='Open';
 if not found then raise exception 'Open network job not found.'; end if;
 update public.driver_bids set status='Withdrawn' where network_job_id=p_network_job_id and status='Submitted';
end $$;
grant execute on function public.withdraw_driver_network_job(uuid) to authenticated;

-- Office-safe bid view with driver details. Customer prices are not included.
create or replace view public.driver_bid_details with (security_invoker=true) as
select b.*,d.name as driver_name,d.vehicle,d.registration,d.availability_status from public.driver_bids b join public.drivers d on d.id=b.driver_id;

commit;
notify pgrst,'reload schema';
select 'driver_network_jobs' item,to_regclass('public.driver_network_jobs') is not null ready union all select 'driver_bids',to_regclass('public.driver_bids') is not null;
