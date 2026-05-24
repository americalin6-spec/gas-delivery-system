-- SaaS subscription fields (Stripe-ready placeholders).
-- Safe to re-run.

alter table public.companies
  add column if not exists subscription_status text not null default 'active';

alter table public.companies
  add column if not exists subscription_plan text not null default 'trial';

alter table public.companies
  add column if not exists stripe_customer_id text;

alter table public.companies
  add column if not exists stripe_subscription_id text;

alter table public.companies
  add column if not exists paid_until timestamptz;

comment on column public.companies.subscription_status is 'active | canceled | past_due | inactive | trialing';
comment on column public.companies.subscription_plan is 'trial | starter | professional | enterprise';
comment on column public.companies.stripe_customer_id is 'Stripe Customer ID (cus_...)';
comment on column public.companies.stripe_subscription_id is 'Stripe Subscription ID (sub_...)';
comment on column public.companies.paid_until is 'Paid access valid until (renewal / period end)';

create index if not exists companies_stripe_customer_id_idx
  on public.companies (stripe_customer_id)
  where stripe_customer_id is not null;

-- Backfill trial defaults for existing rows.
update public.companies
set
  subscription_status = coalesce(nullif(trim(subscription_status), ''), 'active'),
  subscription_plan = coalesce(nullif(trim(subscription_plan), ''), 'trial')
where subscription_status is null
   or subscription_plan is null
   or trim(subscription_status) = ''
   or trim(subscription_plan) = '';
