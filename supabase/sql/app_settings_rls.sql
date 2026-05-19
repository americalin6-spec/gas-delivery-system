-- Row Level Security for public.app_settings (LINE reminder + other app keys)
-- Run this in Supabase SQL Editor if you see:
--   "new row violates row-level security policy for table app_settings"
--
-- Security notes:
-- - Keep SUPABASE_SERVICE_ROLE_KEY only on the server (Vercel env, never NEXT_PUBLIC_*).
-- - Service role JWT bypasses RLS; these policies matter when the API uses the anon key.
-- - Policies below allow anon/authenticated to manage the line_reminder row only.

alter table public.app_settings enable row level security;

-- Idempotent cleanup (ignore errors if policies did not exist)
drop policy if exists "app_settings_select_line_reminder" on public.app_settings;
drop policy if exists "app_settings_insert_line_reminder" on public.app_settings;
drop policy if exists "app_settings_update_line_reminder" on public.app_settings;

-- Read settings row(s) used by the app
create policy "app_settings_select_line_reminder"
  on public.app_settings
  for select
  to anon, authenticated
  using (key = 'line_reminder');

-- Initial insert (on conflict upsert may insert first row)
create policy "app_settings_insert_line_reminder"
  on public.app_settings
  for insert
  to anon, authenticated
  with check (key = 'line_reminder');

-- Upsert / updates
create policy "app_settings_update_line_reminder"
  on public.app_settings
  for update
  to anon, authenticated
  using (key = 'line_reminder')
  with check (key = 'line_reminder');

-- Optional: deny deletes from anon (no policy = deny by default when RLS enabled)
-- Add a DELETE policy only if you need admin tooling with service role (service role bypasses RLS).
