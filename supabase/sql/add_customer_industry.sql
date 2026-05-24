-- Industry / business type on customers (run once in Supabase SQL editor).

alter table public.customers
  add column if not exists industry text;

comment on column public.customers.industry is 'Business type or industry (e.g. 精品家具, 醫美診所) — not formal company name';
