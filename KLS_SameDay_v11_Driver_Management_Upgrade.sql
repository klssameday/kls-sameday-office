-- KLS SameDay Office v11: Driver Management
-- Run once in Supabase SQL Editor after the v10 migration.

alter table public.drivers add column if not exists email text;
alter table public.drivers add column if not exists address text;
alter table public.drivers add column if not exists emergency_contact text;
alter table public.drivers add column if not exists emergency_phone text;
alter table public.drivers add column if not exists employment_type text not null default 'Subcontractor';
alter table public.drivers add column if not exists start_date date;
alter table public.drivers add column if not exists driver_number text;
alter table public.drivers add column if not exists current_mileage integer;
alter table public.drivers add column if not exists service_due_date date;
alter table public.drivers add column if not exists licence_expiry date;
alter table public.drivers add column if not exists insurance_expiry date;
alter table public.drivers add column if not exists cpc_expiry date;
alter table public.drivers add column if not exists mot_expiry date;
alter table public.drivers add column if not exists licence_url text;
alter table public.drivers add column if not exists insurance_url text;
alter table public.drivers add column if not exists cpc_url text;
alter table public.drivers add column if not exists notes text;

create index if not exists drivers_active_idx on public.drivers(user_id, active);
create index if not exists drivers_licence_expiry_idx on public.drivers(licence_expiry);
create index if not exists drivers_insurance_expiry_idx on public.drivers(insurance_expiry);
