-- Run in Supabase SQL editor (once) for CRM calendar / notification center
-- follow_up_date should already exist (see add_follow_up_date.sql)

alter table public.customers
  add column if not exists urgency text;

alter table public.customers
  add column if not exists reminder_status text default 'pending';

comment on column public.customers.urgency is 'Optional cached urgency: overdue | today | within_3 | within_7 | later | completed';
comment on column public.customers.reminder_status is 'Reminder workflow: pending | completed';

-- Optional: constrain values (skip if you prefer free text)
-- alter table public.customers add constraint customers_reminder_status_check
--   check (reminder_status is null or reminder_status in ('pending', 'completed'));
