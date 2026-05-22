-- Backfill customers.line_user_id from line_users (migration-safe, idempotent).
-- Picks the newest line_users row per customer_id (created_at desc).
-- Run in Supabase SQL editor after add_customers_line_user_id.sql.

update public.customers c
set line_user_id = sub.line_user_id
from (
  select distinct on (lu.customer_id)
    lu.customer_id,
    lu.line_user_id
  from public.line_users lu
  where lu.customer_id is not null
    and trim(lu.customer_id) <> ''
    and lu.line_user_id is not null
    and trim(lu.line_user_id) <> ''
  order by lu.customer_id, lu.created_at desc nulls last
) sub
where c.id::text = sub.customer_id
  and (c.line_user_id is null or trim(c.line_user_id) = '');

comment on column public.customers.line_user_id is
  'Official LINE userId (line_users.line_user_id). Synced on bind and from newest line_users row per customer.';
