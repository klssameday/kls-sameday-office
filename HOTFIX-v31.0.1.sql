-- KLS SameDay Office v31.0.1 Customer Portal Hotfix
-- Run this in Supabase SQL Editor if the original v31.0 migration was already run.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_users_customer_id_fkey'
  ) then
    alter table public.customer_users
      add constraint customer_users_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete cascade;
  end if;
end $$;

drop policy if exists customers_customer_portal_read on public.customers;
create policy customers_customer_portal_read on public.customers
  for select to authenticated
  using (
    exists (
      select 1 from public.customer_users cu
      where cu.auth_user_id = auth.uid()
        and cu.customer_id = customers.id
        and cu.active = true
    )
  );
