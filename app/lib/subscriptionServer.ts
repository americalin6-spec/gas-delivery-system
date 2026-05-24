import "server-only";

import {
  monthlyAiLimitForPlan,
  planLabelZh,
  subscriptionStatusLabelZh,
  TRIAL_PERIOD_DAYS,
} from "./subscriptionPlans";
import type { SubscriptionPlan } from "./subscriptionPlans";
import { getSupabaseServiceRole } from "./supabaseServer";

export type CompanySubscriptionRow = {
  id: number;
  plan_status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  ai_monthly_limit: number;
  ai_used_this_month: number;
  ai_usage_month: string | null;
  subscription_status: string;
  subscription_plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  paid_until: string | null;
  ai_extra_credits: number;
};

export type CompanySubscriptionView = {
  subscriptionStatus: string;
  subscriptionStatusLabel: string;
  subscriptionPlan: string;
  subscriptionPlanLabel: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paidUntil: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  hasActivePaidSubscription: boolean;
  trialExpired: boolean;
  monthlyAiLimit: number;
  aiUsedThisMonth: number;
  aiRemainingThisMonth: number;
  aiExtraCredits: number;
  billingReady: boolean;
};

const COMPANY_SUBSCRIPTION_SELECT =
  "id, plan_status, trial_started_at, trial_ends_at, ai_monthly_limit, ai_used_this_month, ai_usage_month, subscription_status, subscription_plan, stripe_customer_id, stripe_subscription_id, paid_until, ai_extra_credits";

export function buildNewCompanySubscriptionFields(now = new Date()): Record<string, unknown> {
  const trialEnds = new Date(now);
  trialEnds.setUTCDate(trialEnds.getUTCDate() + TRIAL_PERIOD_DAYS);
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  return {
    plan_status: "trial",
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEnds.toISOString(),
    ai_monthly_limit: monthlyAiLimitForPlan("trial"),
    ai_used_this_month: 0,
    ai_usage_month: month,
    subscription_status: "active",
    subscription_plan: "trial",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    paid_until: null,
    ai_extra_credits: 0,
  };
}

function parseUsageCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function hasActivePaidSubscription(row: CompanySubscriptionRow, now = new Date()): boolean {
  const plan = row.subscription_plan;
  if (plan === "trial") {
    if (row.plan_status === "paid") return true;
    return false;
  }

  const status = row.subscription_status;
  if (status !== "active" && status !== "trialing") return false;

  if (row.paid_until) {
    const until = new Date(row.paid_until);
    if (!Number.isNaN(until.getTime()) && until.getTime() < now.getTime()) {
      return false;
    }
  }

  return true;
}

export function isTrialPeriodExpired(row: CompanySubscriptionRow, now = new Date()): boolean {
  if (hasActivePaidSubscription(row, now)) return false;
  if (row.subscription_plan !== "trial" && row.plan_status !== "trial") {
    return false;
  }
  const ends = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  if (!ends || Number.isNaN(ends.getTime())) return false;
  return now.getTime() >= ends.getTime();
}

export function trialDaysRemaining(row: CompanySubscriptionRow, now = new Date()): number | null {
  if (hasActivePaidSubscription(row, now)) return null;
  const ends = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  if (!ends || Number.isNaN(ends.getTime())) return null;
  const ms = ends.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function effectiveMonthlyAiLimit(row: CompanySubscriptionRow): number {
  const extra = parseUsageCount(row.ai_extra_credits);
  let base: number;
  if (hasActivePaidSubscription(row)) {
    const fromPlan = monthlyAiLimitForPlan(row.subscription_plan);
    const fromColumn = parseUsageCount(row.ai_monthly_limit);
    base = Math.max(fromPlan, fromColumn > 0 ? fromColumn : 0) || fromPlan;
  } else if (row.ai_monthly_limit > 0) {
    base = row.ai_monthly_limit;
  } else {
    base = monthlyAiLimitForPlan("trial");
  }
  return base + extra;
}

export function currentPlanLabel(row: CompanySubscriptionRow, now = new Date()): string {
  if (hasActivePaidSubscription(row, now)) {
    return planLabelZh(row.subscription_plan);
  }
  if (isTrialPeriodExpired(row, now)) return "試用已結束";
  return planLabelZh("trial");
}

export function companyRowToSubscriptionView(
  row: CompanySubscriptionRow,
  now = new Date(),
): CompanySubscriptionView {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const used =
    row.ai_usage_month === month ? parseUsageCount(row.ai_used_this_month) : 0;
  const limit = effectiveMonthlyAiLimit(row);
  const paid = hasActivePaidSubscription(row, now);

  return {
    subscriptionStatus: row.subscription_status,
    subscriptionStatusLabel: subscriptionStatusLabelZh(row.subscription_status),
    subscriptionPlan: row.subscription_plan,
    subscriptionPlanLabel: currentPlanLabel(row, now),
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    paidUntil: row.paid_until,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    trialDaysRemaining: trialDaysRemaining(row, now),
    hasActivePaidSubscription: paid,
    trialExpired: isTrialPeriodExpired(row, now),
    monthlyAiLimit: limit,
    aiUsedThisMonth: used,
    aiRemainingThisMonth: Math.max(0, limit - used),
    aiExtraCredits: parseUsageCount(row.ai_extra_credits),
    billingReady: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
  };
}

export async function loadCompanySubscriptionRow(
  companyId: number,
): Promise<CompanySubscriptionRow | null> {
  const admin = getSupabaseServiceRole();
  const { data, error } = await admin
    .from("companies")
    .select(COMPANY_SUBSCRIPTION_SELECT)
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("[subscription] load failed:", { companyId, message: error.message });
    }
    return null;
  }

  return {
    id: Number(data.id),
    plan_status: String(data.plan_status ?? "trial"),
    trial_started_at:
      data.trial_started_at != null ? String(data.trial_started_at) : null,
    trial_ends_at: data.trial_ends_at != null ? String(data.trial_ends_at) : null,
    ai_monthly_limit: Number(data.ai_monthly_limit) || monthlyAiLimitForPlan("trial"),
    ai_used_this_month: parseUsageCount(data.ai_used_this_month),
    ai_usage_month: data.ai_usage_month != null ? String(data.ai_usage_month) : null,
    subscription_status: String(data.subscription_status ?? "active"),
    subscription_plan: String(data.subscription_plan ?? "trial"),
    stripe_customer_id:
      data.stripe_customer_id != null ? String(data.stripe_customer_id) : null,
    stripe_subscription_id:
      data.stripe_subscription_id != null ? String(data.stripe_subscription_id) : null,
    paid_until: data.paid_until != null ? String(data.paid_until) : null,
    ai_extra_credits: parseUsageCount(data.ai_extra_credits),
  };
}

export async function getCompanySubscriptionView(
  companyId: number,
): Promise<CompanySubscriptionView | null> {
  const row = await loadCompanySubscriptionRow(companyId);
  if (!row) return null;
  return companyRowToSubscriptionView(row);
}

export function normalizeCheckoutPlan(plan: string | undefined): SubscriptionPlan | null {
  const p = plan?.trim().toLowerCase();
  if (p === "starter" || p === "professional" || p === "enterprise") return p;
  return null;
}
