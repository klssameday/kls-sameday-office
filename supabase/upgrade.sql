-- KLS SameDay Office Supabase V2 upgrade
-- Run this entire file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Existing tables are kept. Missing columns are added safely.
alter table if exists public.jobs add column if not exists customer_name text;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  quote_number text not null unique,
  customer_name text not null,
  contact_name text,
  phone text,
  email text,
  collection_date date,
  collection_time time,
  collection_address text not null,
  delivery_address text not null,
  vehicle text,
  goods_description text,
  miles numeric default 0,
  quoted_price numeric(12,2) default 0,
  notes text,
  status text default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_number text not null unique,
  customer_name text not null,
  total numeric(12,2) default 0,
  status text default 'Unpaid',
  issue_date date default current_date,
  due_date date,
  paid_date date,
  created_at timestamptz not null default now()
);

alter table public.quotes enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "Own quotes" on public.quotes;
create policy "Own quotes" on public.quotes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own invoices" on public.invoices;
create policy "Own invoices" on public.invoices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recreate existing-table policies in case they are missing.
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.business_settings enable row level security;

drop policy if exists "Own customers" on public.customers;
create policy "Own customers" on public.customers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own jobs" on public.jobs;
create policy "Own jobs" on public.jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Own settings" on public.business_settings;
create policy "Own settings" on public.business_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
