-- Add company_id to all tenant-scoped tables. Idempotent — safe to re-run.
-- Run AFTER add_companies.sql.

-- 1. customers
alter table public.customers
  add column if not exists company_id bigint;
update public.customers set company_id = 1 where company_id is null;
alter table public.customers alter column company_id set default 1;
alter table public.customers alter column company_id set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_company_id_fkey'
  ) then
    alter table public.customers
      add constraint customers_company_id_fkey
      foreign key (company_id) references public.companies(id);
  end if;
end$$;
create index if not exists customers_company_id_idx on public.customers (company_id);

-- 2. conversations
alter table public.conversations
  add column if not exists company_id bigint;
update public.conversations set company_id = 1 where company_id is null;
alter table public.conversations alter column company_id set default 1;
alter table public.conversations alter column company_id set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_company_id_fkey'
  ) then
    alter table public.conversations
      add constraint conversations_company_id_fkey
      foreign key (company_id) references public.companies(id);
  end if;
end$$;
create index if not exists conversations_company_id_idx on public.conversations (company_id);

-- 3. line_users
alter table public.line_users
  add column if not exists company_id bigint;
update public.line_users set company_id = 1 where company_id is null;
alter table public.line_users alter column company_id set default 1;
alter table public.line_users alter column company_id set not null;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'line_users_company_id_fkey'
  ) then
    alter table public.line_users
      add constraint line_users_company_id_fkey
      foreign key (company_id) references public.companies(id);
  end if;
end$$;
create index if not exists line_users_company_id_idx on public.line_users (company_id);

comment on column public.customers.company_id is 'Tenant. Defaults to 1 (Default Company).';
comment on column public.conversations.company_id is 'Tenant. Defaults to 1 (Default Company).';
comment on column public.line_users.company_id is 'Tenant. Defaults to 1 (Default Company).';
