-- AI follow-up sending mode per customer (manual | assisted | auto). Run once in Supabase SQL editor.
alter table public.customers
  add column if not exists follow_up_mode text not null default 'manual';

alter table public.customers
  drop constraint if exists customers_follow_up_mode_check;

alter table public.customers
  add constraint customers_follow_up_mode_check
  check (follow_up_mode in ('manual', 'assisted', 'auto'));

comment on column public.customers.follow_up_mode is 'AI follow-up: manual (suggestions only), assisted (draft + confirm), auto (send without confirm; LINE not wired yet — simulate only)';
