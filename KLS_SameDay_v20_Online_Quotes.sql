-- KLS SameDay Office v20 — Online Quotations and Public Quote Requests
-- Run once in Supabase SQL Editor after v19.

create extension if not exists pgcrypto;

alter table public.quotes add column if not exists public_token uuid;
alter table public.quotes add column if not exists public_expires_at timestamptz;
alter table public.quotes add column if not exists customer_response text default 'Awaiting reply';
alter table public.quotes add column if not exists customer_response_name text;
alter table public.quotes add column if not exists customer_message text;
alter table public.quotes add column if not exists responded_at timestamptz;
create unique index if not exists quotes_public_token_idx on public.quotes(public_token) where public_token is not null;

create table if not exists public.public_quote_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  customer_name text not null,
  contact_name text,
  email text not null,
  phone text not null,
  collection_date date,
  collection_time time,
  collection_address text not null,
  delivery_address text not null,
  vehicle text,
  miles numeric,
  goods_description text,
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

alter table public.public_quote_requests enable row level security;
drop policy if exists "Public can submit quote requests" on public.public_quote_requests;
create policy "Public can submit quote requests" on public.public_quote_requests for insert to anon, authenticated with check (true);
drop policy if exists "Owners manage quote requests" on public.public_quote_requests;
create policy "Owners manage quote requests" on public.public_quote_requests for all to authenticated using (owner_id = auth.uid() or owner_id is null) with check (owner_id = auth.uid() or owner_id is null);

-- Assign unclaimed public requests to the first office user who opens them.
create or replace function public.claim_public_quote_requests() returns integer language plpgsql security definer set search_path=public as $$
declare n integer; begin update public.public_quote_requests set owner_id=auth.uid() where owner_id is null; get diagnostics n=row_count; return n; end; $$;
grant execute on function public.claim_public_quote_requests() to authenticated;

create or replace function public.get_public_quote(p_token uuid)
returns table(quote_number text,customer_name text,collection_date date,collection_address text,delivery_address text,vehicle text,miles numeric,quoted_price numeric,goods_description text,notes text,customer_response text,responded_at timestamptz)
language sql security definer set search_path=public as $$
 select q.quote_number,q.customer_name,q.collection_date,q.collection_address,q.delivery_address,q.vehicle,q.miles,q.quoted_price,q.goods_description,q.notes,q.customer_response,q.responded_at from public.quotes q where q.public_token=p_token and (q.public_expires_at is null or q.public_expires_at>now()) limit 1;
$$;
grant execute on function public.get_public_quote(uuid) to anon, authenticated;

create or replace function public.respond_public_quote(p_token uuid,p_response text,p_customer_name text,p_customer_message text default null)
returns table(quote_number text,customer_name text,collection_date date,collection_address text,delivery_address text,vehicle text,miles numeric,quoted_price numeric,goods_description text,notes text,customer_response text,responded_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if p_response not in ('Accepted','Declined') then raise exception 'Invalid response'; end if;
 update public.quotes set customer_response=p_response,customer_response_name=p_customer_name,customer_message=p_customer_message,responded_at=now(),status=case when p_response='Accepted' then 'Accepted Online' else 'Declined' end where public_token=p_token and (public_expires_at is null or public_expires_at>now()) and coalesce(customer_response,'Awaiting reply')='Awaiting reply';
 return query select q.quote_number,q.customer_name,q.collection_date,q.collection_address,q.delivery_address,q.vehicle,q.miles,q.quoted_price,q.goods_description,q.notes,q.customer_response,q.responded_at from public.quotes q where q.public_token=p_token limit 1;
end; $$;
grant execute on function public.respond_public_quote(uuid,text,text,text) to anon, authenticated;
