-- Stricter customers RLS: null company_id never visible; membership required.
-- Run in Supabase SQL Editor after tenant_auth_rls.sql

alter table public.customers enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'customers'
  loop
    execute format('drop policy if exists %I on public.customers', pol.policyname);
  end loop;
end $$;

grant select, insert, update, delete on public.customers to authenticated;

create policy "customers_select_member"
  on public.customers for select to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "customers_insert_member"
  on public.customers for insert to authenticated
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
    and (created_by_user_id is null or created_by_user_id = auth.uid())
  );

create policy "customers_update_member"
  on public.customers for update to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  )
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "customers_delete_member"
  on public.customers for delete to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );
