-- =============================================================================
-- public.companies — RLS fix (INSERT) for CRM /settings company creation
-- =============================================================================
-- Symptom: "new row violates row-level security policy for table companies"
-- Cause:   RLS enabled but no permissive INSERT policy (or a stricter policy
--          rejects the row). Browser uses Supabase anon (or authenticated).
--
-- This migration:
--   1. Inspects pg_policies and drops ONLY policies where cmd = 'INSERT'
--      (does not drop SELECT / UPDATE / DELETE-only policies).
--   2. Drops the known app policy name if present (idempotent).
--   3. Creates one permissive INSERT policy for anon + authenticated.
--   4. Grants SELECT + INSERT on the table (RLS still enforces row access).
--
-- Tenant isolation for CRM data is unchanged: customers / conversations /
-- line_users remain scoped by company_id + application logic — not this DDL.
--
-- Paste the entire file into Supabase SQL Editor and run once (safe to re-run).
-- =============================================================================

alter table public.companies enable row level security;

-- Privileges: RLS must still pass; without INSERT grant you get permission denied
-- (different error). Including grants avoids misconfiguration on new projects.
grant usage on schema public to anon, authenticated;
grant select, insert on table public.companies to anon, authenticated;

-- Optional: allow nextval on identity/serial for companies.id (best-effort)
do $$
declare
  seq_fqn text;
begin
  seq_fqn := pg_get_serial_sequence('public.companies', 'id');
  if seq_fqn is not null then
    execute format('grant usage, select on sequence %s to anon, authenticated', seq_fqn);
  end if;
exception
  when others then
    null;
end $$;

-- Remove every INSERT-only policy so a single clean policy wins (no OR of stale rules).
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.companies', r.policyname);
  end loop;
end $$;

drop policy if exists "companies_insert_anon_authenticated" on public.companies;

create policy "companies_insert_anon_authenticated"
  on public.companies
  as permissive
  for insert
  to anon, authenticated
  with check (coalesce(trim(both from name), '') <> '');

comment on policy "companies_insert_anon_authenticated" on public.companies is
  'Temporary: allow CRM (anon JWT) to create tenant rows. Tighten when auth ships.';
