-- Social media & alternate contact columns on customers (run once in Supabase SQL editor).

alter table public.customers
  add column if not exists instagram text;

alter table public.customers
  add column if not exists facebook text;

alter table public.customers
  add column if not exists tiktok text;

alter table public.customers
  add column if not exists xiaohongshu text;

alter table public.customers
  add column if not exists youtube text;

alter table public.customers
  add column if not exists website text;

alter table public.customers
  add column if not exists alternate_contact text;

comment on column public.customers.instagram is 'Instagram handle or profile URL';
comment on column public.customers.facebook is 'Facebook page or profile URL';
comment on column public.customers.tiktok is 'TikTok handle or profile URL';
comment on column public.customers.xiaohongshu is '小紅書 profile URL or ID';
comment on column public.customers.youtube is 'YouTube channel URL or handle';
comment on column public.customers.website is 'Official website URL';
comment on column public.customers.alternate_contact is 'Alternate contact (phone, messenger, etc.)';
