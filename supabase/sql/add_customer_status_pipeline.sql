-- Customer sales pipeline status. Idempotent — safe to run multiple times.
-- Run once in Supabase SQL editor.

alter table public.customers
  add column if not exists status text;

create index if not exists customers_status_idx
  on public.customers (status);

comment on column public.customers.status is
  'Sales pipeline status: new_lead | contacted | quoting | waiting_reply | won | lost (null treated as new_lead).';
