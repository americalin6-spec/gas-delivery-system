-- Ensure ai_usage_month stores YYYY-MM text (not integer).
-- Fixes: invalid input syntax for type integer: "2026-05"
-- (Also applied at the top of add_ai_quota_atomic.sql — safe to run either or both.)

alter table public.companies
  add column if not exists ai_usage_month text;

do $$
declare
  col_type text;
begin
  select data_type
  into col_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'companies'
    and column_name = 'ai_usage_month';

  if col_type is not null and col_type <> 'text' then
    execute $sql$
      alter table public.companies
      alter column ai_usage_month type text
      using (
        case
          when ai_usage_month is null then null::text
          when trim(ai_usage_month::text) ~ '^\d{4}-\d{2}$' then trim(ai_usage_month::text)
          when trim(ai_usage_month::text) ~ '^\d{6}$' then
            substr(trim(ai_usage_month::text), 1, 4)
            || '-'
            || substr(trim(ai_usage_month::text), 5, 2)
          else to_char(now() at time zone 'UTC', 'YYYY-MM')
        end
      )
    $sql$;
  end if;
end $$;

comment on column public.companies.ai_usage_month is
  'UTC calendar month key (YYYY-MM) for ai_used_this_month reset';

update public.companies
set ai_usage_month = to_char(now() at time zone 'UTC', 'YYYY-MM')
where ai_usage_month is null
   or trim(ai_usage_month) = ''
   or trim(ai_usage_month) !~ '^\d{4}-\d{2}$';
