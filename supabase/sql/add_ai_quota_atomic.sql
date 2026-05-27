-- Atomic AI quota reservation/release helpers.
-- Safe to re-run.

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
  month_now text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  reset_at timestamptz := date_trunc('month', now() at time zone 'UTC');
  base_limit int := 0;
  extra_credits int := 0;
  effective_limit int := 0;
  used int := 0;
  unlimited boolean := false;
  active_paid boolean := false;
  expired_paid boolean := false;
begin
  select * into c
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    return query select false, '找不到工作區', month_now, 0, 0, 0;
    return;
  end if;

  if c.ai_usage_reset_at is null
     or c.ai_usage_month is null
     or c.ai_usage_month <> month_now
     or date_trunc('month', c.ai_usage_reset_at at time zone 'UTC') <> reset_at
  then
    c.ai_used_this_month := 0;
    c.ai_usage_month := month_now;
    c.ai_usage_reset_at := reset_at;
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

  if active_paid then
    base_limit := coalesce(nullif(c.monthly_ai_limit, 0), nullif(c.ai_monthly_limit, 0), 0);
    if base_limit <= 0 then
      case c.subscription_plan
        when 'starter' then base_limit := 300;
        when 'professional' then base_limit := 2000;
        when 'enterprise' then base_limit := 0;
        else base_limit := 30;
      end case;
    end if;
  else
    -- Expired/non-paid subscriptions always degrade to 免費體驗 quota.
    base_limit := 30;
  end if;

  extra_credits := greatest(coalesce(c.ai_extra_credits, 0), 0);
  if active_paid and c.subscription_plan = 'enterprise' and coalesce(c.monthly_ai_limit, 0) <= 0 and coalesce(c.ai_monthly_limit, 0) <= 0 then
    unlimited := true;
  end if;

  effective_limit := base_limit + extra_credits;
  used := greatest(coalesce(c.ai_used_this_month, 0), 0);

  if not unlimited and used >= effective_limit then
    update public.companies
    set ai_used_this_month = used,
        ai_usage_month = c.ai_usage_month,
        ai_usage_reset_at = c.ai_usage_reset_at
    where id = p_company_id;

    return query
      select false,
             case
               when expired_paid then '您的方案已到期，請續訂以繼續使用進階功能。'
               else '本月 AI 分析次數已用完，請升級方案或等待下個月重置。'
             end,
             c.ai_usage_month,
             effective_limit,
             used,
             0;
    return;
  end if;

  used := used + 1;

  update public.companies
  set ai_used_this_month = used,
      ai_usage_month = c.ai_usage_month,
      ai_usage_reset_at = c.ai_usage_reset_at
  where id = p_company_id;

  return query
    select true,
           null::text,
           c.ai_usage_month,
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
begin
  select * into c
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    return false;
  end if;

  if c.ai_usage_month = p_usage_month then
    update public.companies
    set ai_used_this_month = greatest(coalesce(c.ai_used_this_month, 0) - 1, 0)
    where id = p_company_id;
  end if;

  return true;
end;
$$;

revoke all on function public.release_company_ai_quota(bigint, text) from public;
grant execute on function public.release_company_ai_quota(bigint, text) to authenticated;

