-- KLS SameDay Office v35.2
-- Prevent duplicate jobs from one quote and duplicate invoices for one job.

begin;

create unique index if not exists jobs_one_per_quote_idx
  on public.jobs (quote_id)
  where quote_id is not null;

create unique index if not exists invoices_one_per_job_idx
  on public.invoices (job_id)
  where job_id is not null;

commit;
