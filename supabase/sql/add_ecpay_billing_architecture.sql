-- ECPay billing architecture placeholders (optional IDs for future callbacks).
-- Core subscription fields: subscription_status, subscription_plan, paid_until
-- (see add_company_subscription.sql).

alter table public.companies
  add column if not exists ecpay_merchant_trade_no text;

alter table public.companies
  add column if not exists ecpay_period_trade_no text;

comment on column public.companies.ecpay_merchant_trade_no is
  'ECPay MerchantTradeNo for one-time / initial order (future)';

comment on column public.companies.ecpay_period_trade_no is
  'ECPay recurring period trade reference (future)';

create index if not exists companies_ecpay_merchant_trade_no_idx
  on public.companies (ecpay_merchant_trade_no)
  where ecpay_merchant_trade_no is not null;
