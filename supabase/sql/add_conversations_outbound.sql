-- Allow outbound CRM conversations even when no LINE binding exists for the customer.
-- Run once in Supabase SQL editor.

alter table public.conversations
  alter column line_user_id drop not null;

comment on column public.conversations.line_user_id is
  'LINE user that sent or received the message. NULL allowed for outbound CRM messages with no binding.';
