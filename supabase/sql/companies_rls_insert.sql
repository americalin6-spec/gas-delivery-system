-- Fix: "new row violates row-level security policy for table companies"
-- when creating a company from the CRM (browser uses anon / authenticated JWT).
--
-- Multi-tenant isolation for customer data remains on public.customers,
-- public.conversations, public.line_users via company_id + app filters —
-- this table is only the tenant directory (id + name).
--
-- Run once in Supabase SQL Editor after add_companies.sql.
-- Idempotent: safe to re-run.

alter table public.companies enable row level security;

-- INSERT: allow anon + authenticated temporarily (CRM has no Supabase Auth yet).
drop policy if exists "companies_insert_anon_authenticated" on public.companies;

create policy "companies_insert_anon_authenticated"
  on public.companies
  for insert
  to anon, authenticated
  with check (length(trim(name)) > 0);

-- Do not drop or replace any existing SELECT policies on public.companies.
