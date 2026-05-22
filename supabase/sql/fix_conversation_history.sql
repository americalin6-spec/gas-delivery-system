-- Schema helper for CRM pasted conversations (run before or after conversations_rls.sql).
-- Run once in Supabase SQL Editor.

-- Allow rows without a LINE user binding (homepage paste uses crm-paste:{customer_id}).
alter table public.conversations
  alter column line_user_id drop not null;

-- Required for save + detail display when using anon/publishable key:
--   Run supabase/sql/conversations_rls.sql in the same SQL Editor session.
