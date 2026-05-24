-- One-time / add-on AI credits (added via Stripe credit pack purchase).
alter table public.companies
  add column if not exists ai_extra_credits int not null default 0;

comment on column public.companies.ai_extra_credits is
  'Additional AI actions beyond monthly plan limit (does not reset each month)';

update public.companies
set ai_extra_credits = coalesce(ai_extra_credits, 0)
where ai_extra_credits is null;
