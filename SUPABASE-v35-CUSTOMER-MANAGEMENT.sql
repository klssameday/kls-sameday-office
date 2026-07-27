-- KLS SameDay Office v35.0 – Customer Management
alter table public.customers add column if not exists account_status text default 'Active';
alter table public.customers add column if not exists preferred_vehicle text;
alter table public.customers add column if not exists tags text;

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
create table if not exists public.customer_followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  due_date date not null,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.customer_contacts enable row level security;
alter table public.customer_followups enable row level security;
drop policy if exists customer_contacts_owner on public.customer_contacts;
create policy customer_contacts_owner on public.customer_contacts for all using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists customer_followups_owner on public.customer_followups;
create policy customer_followups_owner on public.customer_followups for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create index if not exists idx_customer_contacts_customer on public.customer_contacts(customer_id);
create index if not exists idx_customer_followups_customer on public.customer_followups(customer_id);
create index if not exists idx_customer_followups_due on public.customer_followups(due_date) where completed_at is null;
