-- KLS SameDay Office v34.5 - Job Documents
create table if not exists public.job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  uploaded_by uuid,
  file_name text not null,
  file_type text,
  file_url text not null,
  description text,
  created_at timestamptz not null default now()
);
alter table public.job_documents enable row level security;
drop policy if exists job_documents_policy on public.job_documents;
create policy job_documents_policy on public.job_documents for all using (true) with check (true);
create index if not exists idx_job_documents_job on public.job_documents(job_id);
create index if not exists idx_job_documents_created on public.job_documents(created_at);
