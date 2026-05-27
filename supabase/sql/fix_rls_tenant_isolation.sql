-- =============================================================================
-- Tenant isolation hardening (strict company_id RLS)
-- =============================================================================
-- Goal: authenticated users can only read/write rows in companies they belong to.
-- Safe to re-run (drops/recreates policies idempotently).

-- Shared helper should already exist from tenant_auth_rls.sql.
create or replace function public.user_company_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.company_members
  where user_id = auth.uid();
$$;

revoke all on function public.user_company_ids() from public;
grant execute on function public.user_company_ids() to authenticated;

create or replace function public.is_member_of_company(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where user_id = auth.uid()
      and company_id = target_company_id
  );
$$;

revoke all on function public.is_member_of_company(bigint) from public;
grant execute on function public.is_member_of_company(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- company_members: users may only read their own membership; no direct writes.
-- -----------------------------------------------------------------------------
alter table public.company_members enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'company_members'
  loop
    execute format('drop policy if exists %I on public.company_members', pol.policyname);
  end loop;
end $$;

revoke insert, update, delete on table public.company_members from authenticated, anon;
grant select on table public.company_members to authenticated;

create policy "company_members_select_own"
  on public.company_members for select to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- companies: tenant visibility by ownership/membership only.
-- -----------------------------------------------------------------------------
alter table public.companies enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'companies'
  loop
    execute format('drop policy if exists %I on public.companies', pol.policyname);
  end loop;
end $$;

revoke all on table public.companies from anon;
grant select, insert, update on table public.companies to authenticated;

create policy "companies_select_member"
  on public.companies for select to authenticated
  using (
    owner_user_id = auth.uid()
    or id in (select public.user_company_ids())
  );

create policy "companies_insert_self_owner"
  on public.companies for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "companies_update_member"
  on public.companies for update to authenticated
  using (id in (select public.user_company_ids()))
  with check (id in (select public.user_company_ids()));

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
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

revoke all on table public.customers from anon;
grant select, insert, update, delete on table public.customers to authenticated;

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

-- -----------------------------------------------------------------------------
-- conversations (replace permissive legacy policies)
-- -----------------------------------------------------------------------------
alter table public.conversations enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'conversations'
  loop
    execute format('drop policy if exists %I on public.conversations', pol.policyname);
  end loop;
end $$;

revoke all on table public.conversations from anon;
grant select, insert, delete on table public.conversations to authenticated;

create policy "conversations_select_member"
  on public.conversations for select to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "conversations_insert_member"
  on public.conversations for insert to authenticated
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "conversations_delete_member"
  on public.conversations for delete to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

-- -----------------------------------------------------------------------------
-- line_users (LINE accounts/messages linkage)
-- -----------------------------------------------------------------------------
alter table public.line_users enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'line_users'
  loop
    execute format('drop policy if exists %I on public.line_users', pol.policyname);
  end loop;
end $$;

revoke all on table public.line_users from anon;
grant select, insert, update, delete on table public.line_users to authenticated;

create policy "line_users_select_member"
  on public.line_users for select to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "line_users_insert_member"
  on public.line_users for insert to authenticated
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "line_users_update_member"
  on public.line_users for update to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  )
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "line_users_delete_member"
  on public.line_users for delete to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

-- -----------------------------------------------------------------------------
-- crm_notifications / reminders
-- -----------------------------------------------------------------------------
alter table public.crm_notifications enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'crm_notifications'
  loop
    execute format('drop policy if exists %I on public.crm_notifications', pol.policyname);
  end loop;
end $$;

revoke all on table public.crm_notifications from anon;
grant select, insert, update on table public.crm_notifications to authenticated;

create policy "crm_notifications_select_member"
  on public.crm_notifications for select to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "crm_notifications_insert_member"
  on public.crm_notifications for insert to authenticated
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "crm_notifications_update_member"
  on public.crm_notifications for update to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  )
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

-- -----------------------------------------------------------------------------
-- company_settings (tenant scoped integrations/settings)
-- -----------------------------------------------------------------------------
alter table public.company_settings enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'company_settings'
  loop
    execute format('drop policy if exists %I on public.company_settings', pol.policyname);
  end loop;
end $$;

revoke all on table public.company_settings from anon;
grant select, insert, update, delete on table public.company_settings to authenticated;

create policy "company_settings_select_member"
  on public.company_settings for select to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "company_settings_insert_member"
  on public.company_settings for insert to authenticated
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "company_settings_update_member"
  on public.company_settings for update to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  )
  with check (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

create policy "company_settings_delete_member"
  on public.company_settings for delete to authenticated
  using (
    company_id is not null
    and company_id in (select public.user_company_ids())
  );

-- -----------------------------------------------------------------------------
-- ai_usage_logs
-- -----------------------------------------------------------------------------
alter table public.ai_usage_logs enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ai_usage_logs'
  loop
    execute format('drop policy if exists %I on public.ai_usage_logs', pol.policyname);
  end loop;
end $$;

revoke all on table public.ai_usage_logs from anon;
grant select on table public.ai_usage_logs to authenticated;
revoke insert, update, delete on table public.ai_usage_logs from authenticated;

create policy "ai_usage_logs_select_member"
  on public.ai_usage_logs for select to authenticated
  using (public.is_member_of_company(company_id));

-- -----------------------------------------------------------------------------
-- workspaces (missing RLS in earlier migrations)
-- -----------------------------------------------------------------------------
alter table public.workspaces enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workspaces'
  loop
    execute format('drop policy if exists %I on public.workspaces', pol.policyname);
  end loop;
end $$;

revoke all on table public.workspaces from anon;
grant select, insert, update, delete on table public.workspaces to authenticated;

create policy "workspaces_select_member"
  on public.workspaces for select to authenticated
  using (company_id in (select public.user_company_ids()));

create policy "workspaces_insert_member"
  on public.workspaces for insert to authenticated
  with check (
    company_id in (select public.user_company_ids())
    and (owner_user_id is null or owner_user_id = auth.uid())
  );

create policy "workspaces_update_member"
  on public.workspaces for update to authenticated
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

create policy "workspaces_delete_member"
  on public.workspaces for delete to authenticated
  using (company_id in (select public.user_company_ids()));

-- -----------------------------------------------------------------------------
-- app_settings is global operational config; block direct tenant reads/writes.
-- -----------------------------------------------------------------------------
alter table public.app_settings enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
  loop
    execute format('drop policy if exists %I on public.app_settings', pol.policyname);
  end loop;
end $$;

revoke all on table public.app_settings from anon, authenticated;

