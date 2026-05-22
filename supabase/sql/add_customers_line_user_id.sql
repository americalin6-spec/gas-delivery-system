-- LINE Messaging API user ID (U…) on CRM customer rows.
-- Set via webhook「綁定」/「綁定 {客戶名}」. Run once in Supabase SQL editor.

alter table public.customers
  add column if not exists line_user_id text;

create index if not exists customers_line_user_id_idx
  on public.customers (line_user_id)
  where line_user_id is not null;

comment on column public.customers.line_user_id is
  'Official LINE userId from webhook event.source.userId. Used for Messaging API push.';
