-- Link a LINE user to a CRM customer for personal reminders.
-- Run once in Supabase SQL editor.

alter table public.line_users
  add column if not exists customer_id text;

create index if not exists line_users_customer_id_idx
  on public.line_users (customer_id);

comment on column public.line_users.customer_id is
  'Bound customers.id (stringified). Set via LINE webhook "綁定 {customer_name}".';
