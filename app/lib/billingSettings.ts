/**
 * Billing settings & plan catalog (client + server safe — no payment secrets).
 * Taiwan market: ECPay primary (architecture). International: Stripe (existing).
 */

import {
  PAID_PLANS,
  PLAN_DEFINITIONS,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "./subscriptionPlans";

export type BillingProvider = "ecpay" | "stripe";

/** ECPay payment channels (architecture — API not wired yet). */
export type EcpayPaymentMethod =
  | "credit_recurring"
  | "credit_once"
  | "atm"
  | "cvs";

export type RecurringPaidPlan = Extract<
  SubscriptionPlan,
  "starter" | "professional" | "enterprise"
>;

export type RecurringPlanDefinition = {
  plan: RecurringPaidPlan;
  nameZh: string;
  priceTwd: number;
  priceLabelZh: string;
  periodLabelZh: string;
  aiMonthlyLimit: number;
  /** Future ECPay PeriodAmount (定期定額每期金額). */
  ecpayPeriodAmount: number;
  /** Future ECPay ExecTimes (0 = until cancel). */
  ecpayExecTimes: number;
  highlight?: boolean;
};

/** Company subscription fields persisted in `companies` table. */
export type CompanySubscriptionFields = {
  subscription_status: SubscriptionStatus;
  subscription_plan: SubscriptionPlan;
  paid_until: string | null;
};

export const DEFAULT_COMPANY_SUBSCRIPTION: CompanySubscriptionFields = {
  subscription_status: "active",
  subscription_plan: "trial",
  paid_until: null,
};

export const RECURRING_PLAN_DEFINITIONS: Record<RecurringPaidPlan, RecurringPlanDefinition> = {
  starter: {
    plan: "starter",
    nameZh: PLAN_DEFINITIONS.starter.nameZh,
    priceTwd: 990,
    priceLabelZh: PLAN_DEFINITIONS.starter.priceZh,
    periodLabelZh: "每月自動扣款",
    aiMonthlyLimit: PLAN_DEFINITIONS.starter.aiMonthlyLimit,
    ecpayPeriodAmount: 990,
    ecpayExecTimes: 0,
  },
  professional: {
    plan: "professional",
    nameZh: PLAN_DEFINITIONS.professional.nameZh,
    priceTwd: 2990,
    priceLabelZh: PLAN_DEFINITIONS.professional.priceZh,
    periodLabelZh: "每月自動扣款",
    aiMonthlyLimit: PLAN_DEFINITIONS.professional.aiMonthlyLimit,
    ecpayPeriodAmount: 2990,
    ecpayExecTimes: 0,
    highlight: true,
  },
  enterprise: {
    plan: "enterprise",
    nameZh: PLAN_DEFINITIONS.enterprise.nameZh,
    priceTwd: 0,
    priceLabelZh: PLAN_DEFINITIONS.enterprise.priceZh,
    periodLabelZh: "客製合約（需人工開通）",
    aiMonthlyLimit: PLAN_DEFINITIONS.enterprise.aiMonthlyLimit,
    ecpayPeriodAmount: 0,
    ecpayExecTimes: 0,
  },
};

export const ECPAY_PAYMENT_METHOD_LABELS: Record<EcpayPaymentMethod, string> = {
  credit_recurring: "信用卡定期定額（每月自動扣款）",
  credit_once: "信用卡單次付款",
  atm: "ATM 轉帳",
  cvs: "超商代碼繳費",
};

export type ProviderPublicStatus = {
  id: BillingProvider;
  labelZh: string;
  enabled: boolean;
  configured: boolean;
  noteZh: string;
};

export type BillingSettingsSnapshot = {
  primaryProvider: BillingProvider;
  regionDefault: "TW";
  subscriptionFields: (keyof CompanySubscriptionFields)[];
  recurringPlans: RecurringPlanDefinition[];
  ecpayPaymentMethods: { id: EcpayPaymentMethod; labelZh: string }[];
  providers: ProviderPublicStatus[];
  callbacks: {
    payment: string;
    period: string;
  };
  architectureOnly: boolean;
};

/** Public billing settings for UI / GET /api/billing (no secrets). */
export function getBillingSettingsSnapshot(options?: {
  stripeConfigured?: boolean;
  ecpayConfigured?: boolean;
}): BillingSettingsSnapshot {
  const stripeConfigured = options?.stripeConfigured ?? false;
  const ecpayConfigured = options?.ecpayConfigured ?? false;

  return {
    primaryProvider: "ecpay",
    regionDefault: "TW",
    subscriptionFields: ["subscription_status", "subscription_plan", "paid_until"],
    recurringPlans: PAID_PLANS.map((p) => RECURRING_PLAN_DEFINITIONS[p]),
    ecpayPaymentMethods: (
      Object.entries(ECPAY_PAYMENT_METHOD_LABELS) as [EcpayPaymentMethod, string][]
    ).map(([id, labelZh]) => ({ id, labelZh })),
    providers: [
      {
        id: "ecpay",
        labelZh: "綠界 ECPay（台灣）",
        enabled: true,
        configured: ecpayConfigured,
        noteZh: ecpayConfigured
          ? "環境變數已設定，API 串接開發中"
          : "尚未設定 ECPAY_MERCHANT_ID / HashKey / HashIV",
      },
      {
        id: "stripe",
        labelZh: "Stripe（國際）",
        enabled: true,
        configured: stripeConfigured,
        noteZh: stripeConfigured
          ? "已設定，供海外信用卡訂閱使用"
          : "尚未設定 STRIPE_SECRET_KEY",
      },
    ],
    callbacks: {
      payment: "/api/ecpay/callback",
      period: "/api/ecpay/period-callback",
    },
    architectureOnly: !ecpayConfigured,
  };
}

export function isRecurringPaidPlan(plan: string): plan is RecurringPaidPlan {
  return plan === "starter" || plan === "professional" || plan === "enterprise";
}
