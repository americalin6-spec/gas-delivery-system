/** Subscription catalog — safe for client and server (no secrets). */

export type SubscriptionPlan = "trial" | "starter" | "professional" | "enterprise";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "inactive"
  | "trialing";

export type CheckoutIntent = "subscription" | "ai_credits";

export type PlanDefinition = {
  id: SubscriptionPlan;
  nameZh: string;
  priceZh: string;
  periodZh: string;
  aiMonthlyLimit: number;
  highlight?: boolean;
  features: string[];
  ctaZh: string;
};

export const TRIAL_PERIOD_DAYS = 30;

export const AI_TRIAL_EXPIRED_MESSAGE =
  "免費試用已結束，請升級方案後繼續使用";

/** Lifetime cap for 免費體驗 — not reset monthly. */
export const TRIAL_LIFETIME_AI_LIMIT = 30;

export const AI_TRIAL_QUOTA_EXCEEDED_MESSAGE =
  "免費體驗 AI 分析次數已用完（共 30 次），請升級方案後繼續使用。";

export const AI_LIMIT_EXCEEDED_MESSAGE =
  "本月 AI 分析次數已用完，請升級方案或等待下個月重置。";

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  trial: {
    id: "trial",
    nameZh: "免費體驗",
    priceZh: "NT$0",
    periodZh: "",
    aiMonthlyLimit: TRIAL_LIFETIME_AI_LIMIT,
    ctaZh: "免費開始",
    features: [
      "共 30 次 AI 分析（免費體驗期間）",
      "客戶對話同步",
      "CRM 客戶管理",
      "AI 客戶摘要",
      "基本跟進功能",
    ],
  },
  starter: {
    id: "starter",
    nameZh: "個人方案",
    priceZh: "NT$199",
    periodZh: "月",
    aiMonthlyLimit: 300,
    ctaZh: "立即升級",
    features: [
      "每月 300 次 AI 分析",
      "AI 客戶分析",
      "AI 跟進建議",
      "高成交提醒",
      "CRM 客戶管理",
      "客戶對話同步",
    ],
  },
  professional: {
    id: "professional",
    nameZh: "專業方案",
    priceZh: "NT$399",
    periodZh: "月",
    aiMonthlyLimit: 2000,
    highlight: true,
    ctaZh: "立即升級",
    features: [
      "每月 2000 次 AI 分析",
      "AI 回覆建議",
      "客戶成交機率分析",
      "AI 跟進建議",
      "Dashboard 儀表板",
      "團隊功能",
      "優先 AI 處理",
    ],
  },
  enterprise: {
    id: "enterprise",
    nameZh: "企業方案",
    priceZh: "專人報價",
    periodZh: "",
    aiMonthlyLimit: 5000,
    ctaZh: "聯絡我們",
    features: [
      "多人權限",
      "客製 AI",
      "API 串接",
      "專屬部署",
      "專屬客服",
    ],
  },
};

export const PAID_PLANS: SubscriptionPlan[] = ["starter", "professional", "enterprise"];

export function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return value in PLAN_DEFINITIONS;
}

export function planLabelZh(plan: string): string {
  if (isSubscriptionPlan(plan)) return PLAN_DEFINITIONS[plan].nameZh;
  return "未知方案";
}

export function monthlyAiLimitForPlan(plan: string): number {
  if (plan === "trial") return TRIAL_LIFETIME_AI_LIMIT;
  if (isSubscriptionPlan(plan)) return PLAN_DEFINITIONS[plan].aiMonthlyLimit;
  return TRIAL_LIFETIME_AI_LIMIT;
}

/** Free-trial lifetime cap (same numeric value as display limit for trial). */
export function trialLifetimeAiLimit(): number {
  return TRIAL_LIFETIME_AI_LIMIT;
}

export function subscriptionStatusLabelZh(status: string): string {
  switch (status) {
    case "active":
      return "使用中";
    case "trialing":
      return "試用中";
    case "past_due":
      return "待付款";
    case "canceled":
      return "已取消";
    case "inactive":
      return "未啟用";
    default:
      return status;
  }
}

/** AI credit packs (one-time Stripe payment). */
export const AI_CREDIT_PACKS = [
  { id: "credits_100", nameZh: "AI 點數 100 次", priceZh: "NT$ 299", credits: 100 },
  { id: "credits_500", nameZh: "AI 點數 500 次", priceZh: "NT$ 1,290", credits: 500 },
] as const;

export type AiCreditPackId = (typeof AI_CREDIT_PACKS)[number]["id"];

export function getCreditPackById(packId: string) {
  return AI_CREDIT_PACKS.find((p) => p.id === packId) ?? null;
}
