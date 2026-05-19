-- App-wide settings (LINE Messaging API reminder token, toggles, etc.)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

comment on table public.app_settings is 'Key-value app settings (e.g. line_reminder)';

insert into public.app_settings (key, value)
values (
  'line_reminder',
  '{"enabled": false, "channel_access_token": "", "user_id": "", "notify_hour": 9, "last_sent_date": null}'::jsonb
)
on conflict (key) do nothing;

-- Migrate older LINE Notify setting shape to LINE Messaging API shape.
update public.app_settings
set
  value =
    jsonb_set(
      jsonb_set(
        value - 'notify_token',
        '{channel_access_token}',
        coalesce(value -> 'channel_access_token', value -> 'notify_token', '""'::jsonb),
        true
      ),
      '{user_id}',
      coalesce(value -> 'user_id', '""'::jsonb),
      true
    ),
  updated_at = now()
where key = 'line_reminder'
  and value ? 'notify_token';
