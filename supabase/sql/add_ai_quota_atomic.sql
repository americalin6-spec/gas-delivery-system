-- Atomic AI quota reservation/release helpers.
-- Safe to re-run.

-- Prefer text month keys (YYYY-MM). Fixes: invalid input syntax for type integer: "2026-05"
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

alter table public.companies
  add column if not exists monthly_ai_limit int;

alter table public.companies
  add column if not exists ai_usage_reset_at timestamptz;

update public.companies
set
  monthly_ai_limit = coalesce(monthly_ai_limit, nullif(ai_monthly_limit, 0)),
  ai_usage_reset_at = coalesce(ai_usage_reset_at, date_trunc('month', now()))
where monthly_ai_limit is null
   or ai_usage_reset_at is null;

comment on column public.companies.monthly_ai_limit is
  'Effective monthly AI limit. NULL/0 means use plan default; enterprise NULL/0 means unlimited.';
comment on column public.companies.ai_usage_reset_at is
  'UTC timestamp when ai_used_this_month was last reset for current month window.';

-- Lifetime AI usage for 免費體驗 (not reset monthly).
alter table public.companies
  add column if not exists trial_ai_used_total int not null default 0;

comment on column public.companies.trial_ai_used_total is
  'Lifetime AI analysis count for free trial (max 30); not reset monthly';

update public.companies
set trial_ai_used_total = greatest(
  coalesce(trial_ai_used_total, 0),
  coalesce(ai_used_this_month, 0)
)
where coalesce(subscription_plan, 'trial') = 'trial';

create or replace function public.ai_usage_month_is_integer_column()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select c.data_type in ('integer', 'bigint', 'smallint')
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'companies'
        and c.column_name = 'ai_usage_month'
    ),
    false
  );
$$;

create or replace function public.ai_usage_month_now_text()
returns text
language sql
stable
set search_path = public
as $$
  select to_char(now() at time zone 'UTC', 'YYYY-MM');
$$;

create or replace function public.ai_usage_month_now_int()
returns integer
language sql
stable
set search_path = public
as $$
  select (
    extract(year from now() at time zone 'UTC')::int * 100
    + extract(month from now() at time zone 'UTC')::int
  );
$$;

create or replace function public.ai_usage_month_text_to_int(p_month text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_month is null or trim(p_month) = '' then null
    when trim(p_month) ~ '^\d{4}-\d{2}$' then
      split_part(trim(p_month), '-', 1)::int * 100
      + split_part(trim(p_month), '-', 2)::int
    when trim(p_month) ~ '^\d{6}$' then trim(p_month)::int
    else null
  end;
$$;

create or replace function public.ai_usage_month_matches_stored(
  p_stored text,
  p_expected_text text,
  p_use_int boolean
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when p_use_int then
      coalesce(nullif(trim(p_stored), '')::int, -1)
        = public.ai_usage_month_text_to_int(p_expected_text)
    else
      trim(coalesce(p_stored, '')) = trim(coalesce(p_expected_text, ''))
  end;
$$;

create or replace function public.reserve_company_ai_quota(p_company_id bigint)
returns table (
  ok boolean,
  error text,
  usage_month text,
  monthly_limit int,
  used_this_month int,
  remaining_this_month int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c companies%rowtype;
  month_now text := public.ai_usage_month_now_text();
  month_int integer := public.ai_usage_month_now_int();
  month_is_int boolean := public.ai_usage_month_is_integer_column();
  reset_at timestamptz := date_trunc('month', now() at time zone 'UTC');
  base_limit int := 0;
  extra_credits int := 0;
  effective_limit int := 0;
  used int := 0;
  unlimited boolean := false;
  active_paid boolean := false;
  expired_paid boolean := false;
  needs_reset boolean := false;
begin
  select * into c
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    return query select false, '找不到工作區', month_now, 0, 0, 0;
    return;
  end if;

  active_paid := (
    c.subscription_plan <> 'trial'
    and c.subscription_status in ('active', 'trialing')
    and (
      c.paid_until is null
      or c.paid_until >= now()
    )
  );
  expired_paid := (c.subscription_plan <> 'trial' and not active_paid);

  extra_credits := greatest(coalesce(c.ai_extra_credits, 0), 0);

  -- Free trial: lifetime 30 analyses (trial_ai_used_total), no monthly reset.
  if not active_paid then
    base_limit := 30;
    effective_limit := base_limit + extra_credits;
    used := greatest(coalesce(c.trial_ai_used_total, 0), 0);

    if used >= effective_limit then
      return query
        select false,
               case
                 when expired_paid then '您的方案已到期，請續訂以繼續使用進階功能。'
                 else '免費體驗 AI 分析次數已用完（共 30 次），請升級方案後繼續使用。'
               end,
               month_now,
               effective_limit,
               used,
               0;
      return;
    end if;

    used := used + 1;

    update public.companies
    set trial_ai_used_total = used
    where id = p_company_id;

    return query
      select true,
             null::text,
             month_now,
             effective_limit,
             used,
             greatest(effective_limit - used, 0);
    return;
  end if;

  -- Paid plans: monthly quota (ai_used_this_month + month reset).
  if month_is_int then
    needs_reset :=
      c.ai_usage_reset_at is null
      or c.ai_usage_month is null
      or coalesce(nullif(trim(c.ai_usage_month::text), '')::int, -1) <> month_int
      or date_trunc('month', c.ai_usage_reset_at at time zone 'UTC') <> reset_at;
  else
    needs_reset :=
      c.ai_usage_reset_at is null
      or c.ai_usage_month is null
      or trim(c.ai_usage_month::text) <> month_now
      or trim(c.ai_usage_month::text) !~ '^\d{4}-\d{2}$'
      or date_trunc('month', c.ai_usage_reset_at at time zone 'UTC') <> reset_at;
  end if;

  if needs_reset then
    c.ai_used_this_month := 0;
    c.ai_usage_reset_at := reset_at;
    if month_is_int then
      update public.companies
      set
        ai_used_this_month = 0,
        ai_usage_month = month_int,
        ai_usage_reset_at = reset_at
      where id = p_company_id;
    else
      update public.companies
      set
        ai_used_this_month = 0,
        ai_usage_month = month_now,
        ai_usage_reset_at = reset_at
      where id = p_company_id;
    end if;
  end if;

  base_limit := coalesce(nullif(c.monthly_ai_limit, 0), nullif(c.ai_monthly_limit, 0), 0);
  if base_limit <= 0 then
    case c.subscription_plan
      when 'starter' then base_limit := 300;
      when 'professional' then base_limit := 2000;
      when 'enterprise' then base_limit := 0;
      else base_limit := 30;
    end case;
  end if;

  if c.subscription_plan = 'enterprise' and coalesce(c.monthly_ai_limit, 0) <= 0 and coalesce(c.ai_monthly_limit, 0) <= 0 then
    unlimited := true;
  end if;

  effective_limit := base_limit + extra_credits;
  used := greatest(coalesce(c.ai_used_this_month, 0), 0);

  if not unlimited and used >= effective_limit then
    if month_is_int then
      update public.companies
      set
        ai_used_this_month = used,
        ai_usage_month = month_int,
        ai_usage_reset_at = c.ai_usage_reset_at
      where id = p_company_id;
    else
      update public.companies
      set
        ai_used_this_month = used,
        ai_usage_month = month_now,
        ai_usage_reset_at = c.ai_usage_reset_at
      where id = p_company_id;
    end if;

    return query
      select false,
             case
               when expired_paid then '您的方案已到期，請續訂以繼續使用進階功能。'
               else '本月 AI 分析次數已用完，請升級方案或等待下個月重置。'
             end,
             month_now,
             effective_limit,
             used,
             0;
    return;
  end if;

  used := used + 1;

  if month_is_int then
    update public.companies
    set
      ai_used_this_month = used,
      ai_usage_month = month_int,
      ai_usage_reset_at = c.ai_usage_reset_at
    where id = p_company_id;
  else
    update public.companies
    set
      ai_used_this_month = used,
      ai_usage_month = month_now,
      ai_usage_reset_at = c.ai_usage_reset_at
    where id = p_company_id;
  end if;

  return query
    select true,
           null::text,
           month_now,
           case when unlimited then 2147483647 else effective_limit end,
           used,
           case when unlimited then 2147483647 else greatest(effective_limit - used, 0) end;
end;
$$;

revoke all on function public.reserve_company_ai_quota(bigint) from public;
grant execute on function public.reserve_company_ai_quota(bigint) to authenticated;

create or replace function public.release_company_ai_quota(
  p_company_id bigint,
  p_usage_month text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c companies%rowtype;
  month_is_int boolean := public.ai_usage_month_is_integer_column();
  month_int integer := public.ai_usage_month_text_to_int(p_usage_month);
begin
  select * into c
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    return false;
  end if;

  if not (
    c.subscription_plan <> 'trial'
    and c.subscription_status in ('active', 'trialing')
    and (c.paid_until is null or c.paid_until >= now())
  ) then
    update public.companies
    set trial_ai_used_total = greatest(coalesce(c.trial_ai_used_total, 0) - 1, 0)
    where id = p_company_id;
    return true;
  end if;

  if month_is_int then
    if month_int is not null
       and coalesce(nullif(trim(c.ai_usage_month::text), '')::int, -1) = month_int then
      update public.companies
      set ai_used_this_month = greatest(coalesce(c.ai_used_this_month, 0) - 1, 0)
      where id = p_company_id;
    end if;
  elsif public.ai_usage_month_matches_stored(c.ai_usage_month::text, p_usage_month, false) then
    update public.companies
    set ai_used_this_month = greatest(coalesce(c.ai_used_this_month, 0) - 1, 0)
    where id = p_company_id;
  end if;

  return true;
end;
$$;

revoke all on function public.release_company_ai_quota(bigint, text) from public;
grant execute on function public.release_company_ai_quota(bigint, text) to authenticated;
