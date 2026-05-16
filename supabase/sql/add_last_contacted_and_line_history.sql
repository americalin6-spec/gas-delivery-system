-- Simulated LINE send tracking (no Messaging API). Run once in Supabase SQL editor.
alter table public.customers
  add column if not exists last_contacted_at timestamptz;

alter table public.customers
  add column if not exists line_send_history jsonb not null default '[]'::jsonb;

comment on column public.customers.last_contacted_at is 'Last simulated one-click LINE send (clipboard + deep link)';
comment on column public.customers.line_send_history is 'Append-only log of simulated sends: [{ at: ISO8601, kind: string }]';
