-- Optional cloud database schema for a future sync upgrade.
create extension if not exists pgcrypto;
create table if not exists public.customers (id uuid primary key default gen_random_uuid(), company_name text not null, phone text, email text, created_at timestamptz default now());
create table if not exists public.quotes (id uuid primary key default gen_random_uuid(), quote_number text unique, customer_name text not null, collection_address text not null, delivery_address text not null, vehicle text, quoted_price numeric default 0, status text default 'Pending', created_at timestamptz default now());
create table if not exists public.jobs (id uuid primary key default gen_random_uuid(), job_number text unique, customer_name text not null, collection_address text not null, delivery_address text not null, vehicle text, price numeric default 0, status text default 'Booked', created_at timestamptz default now());
create table if not exists public.invoices (id uuid primary key default gen_random_uuid(), invoice_number text unique, customer_name text not null, total numeric default 0, status text default 'Unpaid', issue_date timestamptz default now(), due_date timestamptz);
