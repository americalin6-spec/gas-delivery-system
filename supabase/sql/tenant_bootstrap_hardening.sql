-- Prevent duplicate owned companies per auth user.
-- Run once in Supabase SQL Editor.

create unique index if not exists companies_owner_user_id_unique
  on public.companies (owner_user_id)
  where owner_user_id is not null;

-- Ensure at most one owner-membership per user/company pair (already expected).
create unique index if not exists company_members_company_user_unique
  on public.company_members (company_id, user_id);
