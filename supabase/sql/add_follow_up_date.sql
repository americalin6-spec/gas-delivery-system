-- Run in Supabase SQL editor (once): adds scheduled follow-up date for high-potential reminders
alter table public.customers
  add column if not exists follow_up_date date;

comment on column public.customers.follow_up_date is 'Scheduled salesperson follow-up (YYYY-MM-DD); set when deal probability is high';
