-- KLS SameDay Office v15: Accounts and Payments
-- Run once in Supabase SQL Editor after v14.

alter table public.invoices
  add column if not exists amount_paid numeric(10,2) not null default 0;

alter table public.invoices
  add column if not exists payment_method text;

alter table public.invoices
  add column if not exists payment_reference text;

update public.invoices
set amount_paid = total
where status = 'Paid' and coalesce(amount_paid,0) = 0;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expense_date date not null default current_date,
  category text not null default 'Other',
  supplier text,
  description text,
  amount numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

drop policy if exists "KLS users manage own expenses" on public.expenses;
create policy "KLS users manage own expenses"
on public.expenses
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists expenses_user_date_idx
  on public.expenses(user_id, expense_date desc);

create index if not exists invoices_user_status_idx
  on public.invoices(user_id, status);
