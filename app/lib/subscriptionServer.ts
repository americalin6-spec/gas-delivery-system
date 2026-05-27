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
  /** False when DB has no ai_usage_month / ai_used_this_month columns (in-memory limits only). */
  usageCountersPersisted: boolean;
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

/** Columns from add_company_subscription.sql — safe on all deployed schemas. */
const COMPANY_BASE_SELECT =
  "id, subscription_status, subscription_plan, stripe_customer_id, stripe_subscription_id, paid_until";

/** Optional AI plan columns (add_company_ai_plan.sql) — queried only when present. */
const COMPANY_AI_PLAN_SELECT =
  "plan_status, trial_started_at, trial_ends_at, ai_monthly_limit, ai_used_this_month, ai_usage_month, ai_extra_credits";

const COMPANY_SUBSCRIPTION_SELECT = `${COMPANY_BASE_SELECT}, ${COMPANY_AI_PLAN_SELECT}`;

function currentUsageMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /does not exist/i.test(message) || /column/i.test(message);
}

function defaultTrialEndsAt(now = new Date()): string {
  const ends = new Date(now);
  ends.setUTCDate(ends.getUTCDate() + TRIAL_PERIOD_DAYS);
  return ends.toISOString();
}

export function buildNewCompanySubscriptionFields(now = new Date()): Record<string, unknown> {
  const trialEnds = new Date(now);
  trialEnds.setUTCDate(trialEnds.getUTCDate() + TRIAL_PERIOD_DAYS);
  const month = currentUsageMonth(now);

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

function normalizeSubscriptionRow(
  data: Record<string, unknown>,
  options: { usageCountersPersisted: boolean; now?: Date },
): CompanySubscriptionRow {
  const now = options.now ?? new Date();
  const plan = String(data.subscription_plan ?? "trial");
  const hasAiPlanColumns = options.usageCountersPersisted;

  return {
    id: Number(data.id),
    plan_status: String(
      hasAiPlanColumns && data.plan_status != null ? data.plan_status : "trial",
    ),
    trial_started_at:
      hasAiPlanColumns && data.trial_started_at != null
        ? String(data.trial_started_at)
        : now.toISOString(),
    trial_ends_at:
      hasAiPlanColumns && data.trial_ends_at != null
        ? String(data.trial_ends_at)
        : defaultTrialEndsAt(now),
    ai_monthly_limit:
      hasAiPlanColumns && data.ai_monthly_limit != null
        ? Number(data.ai_monthly_limit) || monthlyAiLimitForPlan("trial")
        : monthlyAiLimitForPlan(plan === "trial" ? "trial" : (plan as SubscriptionPlan)),
    ai_used_this_month: hasAiPlanColumns
      ? parseUsageCount(data.ai_used_this_month)
      : 0,
    ai_usage_month:
      hasAiPlanColumns && data.ai_usage_month != null
        ? String(data.ai_usage_month)
        : currentUsageMonth(now),
    subscription_status: String(data.subscription_status ?? "active"),
    subscription_plan: plan,
    stripe_customer_id:
      data.stripe_customer_id != null ? String(data.stripe_customer_id) : null,
    stripe_subscription_id:
      data.stripe_subscription_id != null ? String(data.stripe_subscription_id) : null,
    paid_until: data.paid_until != null ? String(data.paid_until) : null,
    ai_extra_credits: hasAiPlanColumns ? parseUsageCount(data.ai_extra_credits) : 0,
    usageCountersPersisted: hasAiPlanColumns,
  };
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
  if (!row.usageCountersPersisted) {
    return false;
  }
  const ends = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  if (!ends || Number.isNaN(ends.getTime())) return false;
  return now.getTime() >= ends.getTime();
}

export function trialDaysRemaining(row: CompanySubscriptionRow, now = new Date()): number | null {
  if (hasActivePaidSubscription(row, now)) return null;
  if (!row.usageCountersPersisted) return TRIAL_PERIOD_DAYS;
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
  const month = currentUsageMonth(now);
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
  if (!Number.isFinite(companyId) || companyId <= 0) {
    return null;
  }

  const admin = getSupabaseServiceRole();

  const extended = await admin
    .from("companies")
    .select(COMPANY_SUBSCRIPTION_SELECT)
    .eq("id", companyId)
    .maybeSingle();

  if (!extended.error && extended.data) {
    return normalizeSubscriptionRow(extended.data as Record<string, unknown>, {
      usageCountersPersisted: true,
    });
  }

  if (extended.error) {
    console.warn("[subscription] extended load fallback:", {
      companyId,
      message: extended.error.message,
    });
  }

  const base = await admin
    .from("companies")
    .select(COMPANY_BASE_SELECT)
    .eq("id", companyId)
    .maybeSingle();

  if (!base.error && base.data) {
    return normalizeSubscriptionRow(base.data as Record<string, unknown>, {
      usageCountersPersisted: false,
    });
  }

  if (base.error) {
    console.warn("[subscription] base load fallback:", {
      companyId,
      message: base.error.message,
    });
  }

  const minimal = await admin
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();

  if (minimal.error) {
    console.error("[subscription] id-only load failed:", {
      companyId,
      message: minimal.error.message,
    });
    return null;
  }

  if (!minimal.data) {
    return null;
  }

  return normalizeSubscriptionRow(
    {
      id: minimal.data.id,
      subscription_status: "active",
      subscription_plan: "trial",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      paid_until: null,
    },
    { usageCountersPersisted: false },
  );
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
