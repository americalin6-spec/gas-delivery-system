-- Row Level Security for public.conversations (CRM conversation history)
-- Run once in Supabase Dashboard → SQL Editor.
--
-- Fixes: "new row violates row-level security policy for table conversations"
-- App uses the publishable/anon key (no Supabase Auth login). Policies must allow
-- roles: anon, authenticated. Tenant filtering stays in app (company_id header).

-- 0. Drop every existing policy on this table (removes dashboard / old restrictive rules)
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'conversations'
  loop
    execute format('drop policy if exists %I on public.conversations', pol.policyname);
  end loop;
end $$;

-- 1. RLS on (do not disable globally)
alter table public.conversations enable row level security;

-- 2. Table privileges for API + browser client
grant usage on schema public to anon, authenticated;
grant select, insert, delete on table public.conversations to anon, authenticated;

-- 3. SELECT — customer detail 對話記錄, GET /api/conversations
create policy "conversations_select_crm"
  on public.conversations
  as permissive
  for select
  to anon, authenticated
  using (true);

-- 4. INSERT — homepage paste save, POST /api/conversations
create policy "conversations_insert_crm"
  on public.conversations
  as permissive
  for insert
  to anon, authenticated
  with check (true);

comment on policy "conversations_select_crm" on public.conversations is
  'CRM: read conversation history (company_id filtered in application).';
-- 5. DELETE — 清空全部對話, single-message delete
create policy "conversations_delete_crm"
  on public.conversations
  as permissive
  for delete
  to anon, authenticated
  using (true);

comment on policy "conversations_insert_crm" on public.conversations is
  'CRM: insert pasted LINE text and outbound CRM messages.';
comment on policy "conversations_delete_crm" on public.conversations is
  'CRM: clear all / delete conversation rows (company_id filtered in application).';
