-- CRM customer_status + urgency flags. Idempotent — safe to run multiple times.

alter table public.customers
  add column if not exists customer_status text;

alter table public.customers
  add column if not exists urgent boolean default false;

alter table public.customers
  add column if not exists priority text;

create index if not exists customers_customer_status_idx
  on public.customers (customer_status);

comment on column public.customers.customer_status is
  'CRM lifecycle: new_lead | negotiating | quoted | waiting_reply | scheduled | in_progress | won | completed | cancelled | invalid';

comment on column public.customers.urgent is 'True when important_date is within 2 days';
comment on column public.customers.priority is 'high when urgent; otherwise null or normal';

-- Backfill from legacy status column
update public.customers
set customer_status = case lower(trim(coalesce(status, '')))
  when 'contacted' then 'negotiating'
  when 'quoting' then 'quoted'
  when 'lost' then 'invalid'
  when 'new_lead' then 'new_lead'
  when 'waiting_reply' then 'waiting_reply'
  when 'won' then 'won'
  when 'active' then 'new_lead'
  when '' then 'new_lead'
  else coalesce(nullif(trim(status), ''), 'new_lead')
end
where customer_status is null or trim(customer_status) = '';

-- Keep status in sync for older clients
update public.customers
set status = customer_status
where customer_status is not null
  and (status is null or trim(status) = '' or status <> customer_status);
