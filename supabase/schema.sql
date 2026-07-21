-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  company text not null,
  contact_name text,
  phone text,
  email text,
  billing_address text,
  payment_terms integer not null default 7,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  job_number text unique,
  customer_id uuid references public.customers(id) on delete set null,
  contact_name text,
  customer_email text,
  collection_date date,
  collection_time time,
  collection_address text,
  delivery_address text,
  vehicle text,
  goods_description text,
  miles numeric default 0,
  base_price numeric(12,2) default 0,
  extras numeric(12,2) default 0,
  total_price numeric(12,2) default 0,
  costs numeric(12,2) default 0,
  job_status text default 'Enquiry',
  quote_status text default 'Draft',
  invoice_status text default 'Not Invoiced',
  invoice_date date,
  amount_paid numeric(12,2) default 0,
  paid_date date,
  pod_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid(),
  trading_name text default 'KLS SameDay',
  legal_name text default 'Kings Logistics Services Ltd',
  phone text,
  whatsapp text,
  email text,
  website text,
  address_line text,
  bank_name text,
  sort_code text,
  account_number text,
  default_terms integer default 7,
  created_at timestamptz not null default now()
);

create sequence if not exists public.kls_job_seq start 1;

create or replace function public.set_job_number()
returns trigger language plpgsql security definer as $$
begin
  if new.job_number is null then
    new.job_number := 'KLS-' || to_char(current_date,'YYMMDD') || '-' || lpad(nextval('public.kls_job_seq')::text,3,'0');
  end if;
  return new;
end $$;

drop trigger if exists trg_set_job_number on public.jobs;
create trigger trg_set_job_number before insert on public.jobs
for each row execute function public.set_job_number();

alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.business_settings enable row level security;

drop policy if exists "Own customers" on public.customers;
create policy "Own customers" on public.customers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own jobs" on public.jobs;
create policy "Own jobs" on public.jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own settings" on public.business_settings;
create policy "Own settings" on public.business_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
