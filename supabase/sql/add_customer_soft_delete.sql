-- Soft delete for CRM customers (trash). Run in Supabase SQL editor.
alter table public.customers
  add column if not exists deleted_at timestamptz;

comment on column public.customers.deleted_at is
  'When set, customer is in trash (hidden from active CRM views).';

create index if not exists customers_active_company_idx
  on public.customers (company_id, created_at desc)
  where deleted_at is null;

create index if not exists customers_trash_company_idx
  on public.customers (company_id, deleted_at desc)
  where deleted_at is not null;
