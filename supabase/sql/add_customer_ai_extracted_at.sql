-- AI CRM field extraction timestamp (run once in Supabase SQL editor).

alter table public.customers
  add column if not exists ai_extracted_at timestamptz;

comment on column public.customers.ai_extracted_at is 'Last time AI auto-extracted CRM fields from conversation';
