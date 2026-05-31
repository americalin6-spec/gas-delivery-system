import { PLAN_DEFINITIONS, type SubscriptionPlan } from "./subscriptionPlans";

export type QuotaUpgradePlanTier = "trial" | "starter" | "professional" | "enterprise";

export type AiQuotaUpgradeCtaKind = "pricing" | "contact";

export type AiQuotaUpgradeFlow = {
  title: string;
  lines: string[];
  ctaLabel: string;
  ctaKind: AiQuotaUpgradeCtaKind;
};

function isSubscriptionPlanSafe(plan: string): plan is SubscriptionPlan {
  return plan in PLAN_DEFINITIONS;
}

export function resolveQuotaUpgradePlanTier(
  subscriptionPlan: string,
  hasActivePaidSubscription: boolean,
): QuotaUpgradePlanTier {
  if (!hasActivePaidSubscription || subscriptionPlan === "trial") {
    return "trial";
  }
  if (subscriptionPlan === "starter") return "starter";
  if (subscriptionPlan === "professional") return "professional";
  if (subscriptionPlan === "enterprise") return "enterprise";
  return "trial";
}

export function buildAiQuotaUpgradeFlow(
  tier: QuotaUpgradePlanTier,
  monthlyLimit = PLAN_DEFINITIONS.trial.aiMonthlyLimit,
): AiQuotaUpgradeFlow {
  switch (tier) {
    case "trial":
      return {
        title: "免費體驗已用完",
        lines: [
          `您已完成 ${PLAN_DEFINITIONS.trial.aiMonthlyLimit} 次 AI 客戶分析。`,
          "立即升級即可繼續使用。",
        ],
        ctaLabel: "立即升級",
        ctaKind: "pricing",
      };
    case "starter":
      return {
        title: "本月 AI 分析額度已用完",
        lines: ["升級至專業方案即可獲得更多額度。"],
        ctaLabel: "升級方案",
        ctaKind: "pricing",
      };
    case "professional":
      return {
        title: "本月 AI 分析額度已達上限",
        lines: ["請升級企業方案。"],
        ctaLabel: "聯絡我們",
        ctaKind: "contact",
      };
    case "enterprise":
      return {
        title: "本月 AI 分析額度已達上限",
        lines: ["請聯絡我們以擴充企業方案額度。"],
        ctaLabel: "聯絡我們",
        ctaKind: "contact",
      };
    default: {
      const exhaustive: never = tier;
      return buildAiQuotaUpgradeFlow(exhaustive, monthlyLimit);
    }
  }
}

export function buildAiQuotaUpgradeFlowForPlan(
  subscriptionPlan: string,
  hasActivePaidSubscription: boolean,
  monthlyLimit?: number,
): AiQuotaUpgradeFlow {
  const tier = resolveQuotaUpgradePlanTier(subscriptionPlan, hasActivePaidSubscription);
  const limit =
    monthlyLimit ??
    (isSubscriptionPlanSafe(subscriptionPlan)
      ? PLAN_DEFINITIONS[subscriptionPlan].aiMonthlyLimit
      : PLAN_DEFINITIONS.trial.aiMonthlyLimit);
  return buildAiQuotaUpgradeFlow(tier, limit);
}

export function parseAiQuotaUpgradeFromBody(
  body: unknown,
): AiQuotaUpgradeFlow | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.quotaExhausted && record.upgradeFlow) {
    return record.upgradeFlow as AiQuotaUpgradeFlow;
  }
  return null;
}

export function formatAiQuotaDeniedApiBody(params: {
  error: string;
  quotaExhausted?: boolean;
  upgradeFlow?: AiQuotaUpgradeFlow;
}): Record<string, unknown> {
  if (params.quotaExhausted && params.upgradeFlow) {
    return {
      error: params.error,
      quotaExhausted: true,
      upgradeFlow: params.upgradeFlow,
    };
  }
  return { error: params.error };
}
