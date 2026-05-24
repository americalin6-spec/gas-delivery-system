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
};

export const TRIAL_PERIOD_DAYS = 30;

export const AI_TRIAL_EXPIRED_MESSAGE =
  "免費試用已結束，請升級方案後繼續使用";

export const AI_LIMIT_EXCEEDED_MESSAGE =
  "本月 AI 使用次數已達上限，請升級方案或下個月再使用";

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  trial: {
    id: "trial",
    nameZh: "免費試用",
    priceZh: "NT$ 0",
    periodZh: "30 天",
    aiMonthlyLimit: 90,
    features: [
      "30 天完整 CRM 試用",
      "每月 90 次 AI 分析",
      "LINE 對話匯入與客戶管理",
      "試用結束可升級付費方案",
    ],
  },
  starter: {
    id: "starter",
    nameZh: "Starter",
    priceZh: "NT$ 990",
    periodZh: "每月",
    aiMonthlyLimit: 300,
    features: [
      "每月 300 次 AI 分析",
      "CRM 客戶與跟進管理",
      "LINE 整合與提醒",
      "適合個人業務與小團隊",
    ],
  },
  professional: {
    id: "professional",
    nameZh: "Professional",
    priceZh: "NT$ 2,990",
    periodZh: "每月",
    aiMonthlyLimit: 1000,
    highlight: true,
    features: [
      "每月 1,000 次 AI 分析",
      "進階客戶洞察與跟進建議",
      "優先功能更新",
      "適合成長中的銷售團隊",
    ],
  },
  enterprise: {
    id: "enterprise",
    nameZh: "Enterprise",
    priceZh: "洽詢報價",
    periodZh: "客製合約",
    aiMonthlyLimit: 5000,
    features: [
      "每月 5,000+ 次 AI 分析（可客製）",
      "專屬 onboarding 與支援",
      "多工作區與進階權限（規劃中）",
      "適合企業與大型團隊",
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
  if (isSubscriptionPlan(plan)) return PLAN_DEFINITIONS[plan].aiMonthlyLimit;
  return PLAN_DEFINITIONS.trial.aiMonthlyLimit;
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
