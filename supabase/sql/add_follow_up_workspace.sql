-- Today follow-up workspace columns (run once in Supabase SQL editor).
-- Does not delete existing data. last_contacted_at may already exist (see add_last_contacted_and_line_history.sql).

alter table public.customers
  add column if not exists next_follow_up_at timestamptz;

alter table public.customers
  add column if not exists follow_up_note text;

alter table public.customers
  add column if not exists status text;

-- Optional alias column (app uses last_contacted_at if present)
alter table public.customers
  add column if not exists last_contact_at timestamptz;

comment on column public.customers.next_follow_up_at is 'Next scheduled follow-up (local timestamptz)';
comment on column public.customers.follow_up_note is 'Sales follow-up note from workspace';
comment on column public.customers.status is 'Pipeline: active | won | lost | etc.';

-- Backfill next_follow_up_at from existing follow_up_date (date-only) at 09:00 local — safe, keeps follow_up_date.
update public.customers
set next_follow_up_at = (follow_up_date::timestamp + time '09:00')
where next_follow_up_at is null
  and follow_up_date is not null;

-- Mirror last_contacted_at into last_contact_at when only one side is set (optional convenience).
update public.customers
set last_contact_at = last_contacted_at
where last_contact_at is null
  and last_contacted_at is not null;

update public.customers
set last_contacted_at = last_contact_at
where last_contacted_at is null
  and last_contact_at is not null;
