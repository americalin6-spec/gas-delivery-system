-- Persisted AI analysis fields on customers.
-- Safe to re-run.

alter table public.customers
  add column if not exists ai_summary text;

alter table public.customers
  add column if not exists ai_customer_needs text;

alter table public.customers
  add column if not exists ai_pain_points text;

alter table public.customers
  add column if not exists ai_emotion text;

alter table public.customers
  add column if not exists ai_next_step text;

alter table public.customers
  add column if not exists ai_risk_alert text;

alter table public.customers
  add column if not exists ai_follow_up text;

alter table public.customers
  add column if not exists ai_probability text;

alter table public.customers
  add column if not exists ai_professional_reply text;

alter table public.customers
  add column if not exists ai_todo text;
