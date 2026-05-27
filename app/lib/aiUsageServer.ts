import "server-only";

import {
  companyRowToSubscriptionView,
  isTrialPeriodExpired,
  loadCompanySubscriptionRow,
  type CompanySubscriptionRow,
} from "./subscriptionServer";
import {
  AI_LIMIT_EXCEEDED_MESSAGE,
  AI_TRIAL_EXPIRED_MESSAGE,
  PLAN_DEFINITIONS,
} from "./subscriptionPlans";
import { getSupabaseServiceRole } from "./supabaseServer";

export {
  AI_TRIAL_EXPIRED_MESSAGE,
  AI_LIMIT_EXCEEDED_MESSAGE,
} from "./subscriptionPlans";

export const TRIAL_MONTHLY_LIMIT = PLAN_DEFINITIONS.trial.aiMonthlyLimit;
export const PAID_MONTHLY_LIMIT = PLAN_DEFINITIONS.professional.aiMonthlyLimit;
export const TRIAL_PERIOD_DAYS = 30;

export type AiFeature =
  | "analyze"
  | "ai_summary"
  | "ai_follow_up"
  | "ai_extract";

export type CompanyPlanRow = CompanySubscriptionRow;

export type CompanyAiUsageStatus = {
  planStatus: string;
  planStatusLabel: string;
  subscriptionPlan: string;
  subscriptionPlanLabel: string;
  subscriptionStatus: string;
  subscriptionStatusLabel: string;
  trialDaysRemaining: number | null;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  trialEndsAt: string | null;
  trialExpired: boolean;
  limitReached: boolean;
  hasActivePaidSubscription: boolean;
  billingReady: boolean;
};

function currentUsageMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export { buildNewCompanySubscriptionFields as buildNewCompanyPlanFields } from "./subscriptionServer";

function parseUsageCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function companyRowToUsageStatus(
  row: CompanySubscriptionRow,
  now = new Date(),
): CompanyAiUsageStatus {
  const view = companyRowToSubscriptionView(row, now);
  return {
    planStatus: row.plan_status,
    planStatusLabel: view.subscriptionPlanLabel,
    subscriptionPlan: view.subscriptionPlan,
    subscriptionPlanLabel: view.subscriptionPlanLabel,
    subscriptionStatus: view.subscriptionStatus,
    subscriptionStatusLabel: view.subscriptionStatusLabel,
    trialDaysRemaining: view.trialDaysRemaining,
    monthlyLimit: view.monthlyAiLimit,
    usedThisMonth: view.aiUsedThisMonth,
    remainingThisMonth: view.aiRemainingThisMonth,
    trialEndsAt: row.trial_ends_at,
    trialExpired: view.trialExpired,
    limitReached: view.aiRemainingThisMonth <= 0,
    hasActivePaidSubscription: view.hasActivePaidSubscription,
    billingReady: view.billingReady,
  };
}

async function ensureMonthlyCounterCurrent(
  row: CompanySubscriptionRow,
): Promise<CompanySubscriptionRow> {
  const month = currentUsageMonth();
  if (row.ai_usage_month === month) return row;

  if (!row.usageCountersPersisted) {
    return { ...row, ai_used_this_month: 0, ai_usage_month: month };
  }

  const admin = getSupabaseServiceRole();
  const { error } = await admin
    .from("companies")
    .update({
      ai_used_this_month: 0,
      ai_usage_month: month,
    })
    .eq("id", row.id);

  if (error) {
    console.warn("[aiUsage] month reset skipped:", error.message);
    return { ...row, ai_used_this_month: 0, ai_usage_month: month };
  }

  return (await loadCompanySubscriptionRow(row.id)) ?? {
    ...row,
    ai_used_this_month: 0,
    ai_usage_month: month,
  };
}

export type AiUsageGateResult =
  | { allowed: true; company: CompanySubscriptionRow }
  | { allowed: false; error: string; status: number };

export type AiQuotaReservation =
  | {
      mode: "rpc";
      companyId: number;
      usageMonth: string;
    }
  | {
      mode: "fallback";
      companyId: number;
    };

/** Check trial + monthly limit before an OpenAI call. */
export async function assertAiUsageAllowed(
  companyId: number,
): Promise<AiUsageGateResult> {
  let row = await loadCompanySubscriptionRow(companyId);
  if (!row) {
    console.error("[aiUsage] workspace row missing for company:", { companyId });
    return { allowed: false, error: "找不到工作區", status: 404 };
  }

  row = await ensureMonthlyCounterCurrent(row);

  if (isTrialPeriodExpired(row)) {
    return {
      allowed: false,
      error: AI_TRIAL_EXPIRED_MESSAGE,
      status: 403,
    };
  }

  const view = companyRowToSubscriptionView(row);
  if (view.aiRemainingThisMonth <= 0) {
    return {
      allowed: false,
      error: AI_LIMIT_EXCEEDED_MESSAGE,
      status: 403,
    };
  }

  return { allowed: true, company: row };
}

export async function recordAiUsage(params: {
  companyId: number;
  userId?: string | null;
  feature: AiFeature;
  estimatedTokens?: number | null;
}): Promise<void> {
  const admin = getSupabaseServiceRole();
  const month = currentUsageMonth();
  const tokens =
    params.estimatedTokens != null && Number.isFinite(params.estimatedTokens)
      ? Math.max(0, Math.floor(params.estimatedTokens))
      : null;

  const { error: logError } = await admin.from("ai_usage_logs").insert({
    company_id: params.companyId,
    user_id: params.userId ?? null,
    feature: params.feature,
    estimated_tokens: tokens,
  });

  if (logError) {
    console.error("[aiUsage] log insert failed:", logError.message);
  }

  const row = await loadCompanySubscriptionRow(params.companyId);
  if (!row) return;

  if (!row.usageCountersPersisted) {
    return;
  }

  const used =
    row.ai_usage_month === month ? parseUsageCount(row.ai_used_this_month) + 1 : 1;

  const { error: updateError } = await admin
    .from("companies")
    .update({
      ai_used_this_month: used,
      ai_usage_month: month,
    })
    .eq("id", params.companyId);

  if (updateError) {
    console.warn("[aiUsage] counter update skipped:", updateError.message);
  }
}

async function reserveAiQuota(companyId: number): Promise<
  | { ok: true; reservation: AiQuotaReservation }
  | { ok: false; error: string; status: number }
> {
  const admin = getSupabaseServiceRole();
  const rpc = await admin.rpc("reserve_company_ai_quota", {
    p_company_id: companyId,
  });

  if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
    const row = rpc.data[0] as {
      ok?: boolean;
      error?: string | null;
      usage_month?: string | null;
    };
    if (!row.ok) {
      return {
        ok: false,
        error: row.error?.trim() || AI_LIMIT_EXCEEDED_MESSAGE,
        status: 403,
      };
    }
    const usageMonth = row.usage_month?.trim() || currentUsageMonth();
    return {
      ok: true,
      reservation: { mode: "rpc", companyId, usageMonth },
    };
  }

  if (rpc.error && /function .* does not exist/i.test(rpc.error.message)) {
    const gate = await assertAiUsageAllowed(companyId);
    if (gate.allowed === false) {
      return { ok: false, error: gate.error, status: gate.status };
    }
    return {
      ok: true,
      reservation: { mode: "fallback", companyId },
    };
  }

  if (rpc.error) {
    console.error("[aiUsage] reserve rpc failed:", rpc.error.message);
    return { ok: false, error: "AI 配額驗證失敗", status: 500 };
  }

  return { ok: false, error: "AI 配額驗證失敗", status: 500 };
}

export async function releaseAiQuotaReservation(
  reservation: AiQuotaReservation | null | undefined,
): Promise<void> {
  if (!reservation) return;
  if (reservation.mode === "fallback") return;

  const admin = getSupabaseServiceRole();
  const { error } = await admin.rpc("release_company_ai_quota", {
    p_company_id: reservation.companyId,
    p_usage_month: reservation.usageMonth,
  });
  if (error) {
    console.warn("[aiUsage] release quota failed:", error.message);
  }
}

export async function finalizeAiUsageSuccess(params: {
  reservation: AiQuotaReservation | null | undefined;
  companyId: number;
  userId?: string | null;
  feature: AiFeature;
  estimatedTokens?: number | null;
}): Promise<void> {
  if (!params.reservation) return;

  if (params.reservation.mode === "fallback") {
    await recordAiUsage({
      companyId: params.companyId,
      userId: params.userId,
      feature: params.feature,
      estimatedTokens: params.estimatedTokens,
    });
    return;
  }

  const admin = getSupabaseServiceRole();
  const tokens =
    params.estimatedTokens != null && Number.isFinite(params.estimatedTokens)
      ? Math.max(0, Math.floor(params.estimatedTokens))
      : null;
  const { error } = await admin.from("ai_usage_logs").insert({
    company_id: params.companyId,
    user_id: params.userId ?? null,
    feature: params.feature,
    estimated_tokens: tokens,
  });
  if (error) {
    console.warn("[aiUsage] usage log insert failed:", error.message);
  }
}

export function extractEstimatedTokens(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const usage = (data as { usage?: { total_tokens?: unknown } }).usage;
  const total = usage?.total_tokens;
  const n = Number(total);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export type OpenAiChatResult = {
  content: string | null;
  raw: unknown;
  estimatedTokens: number | null;
  reservation: AiQuotaReservation | null;
};

export type OpenAiChatParams = {
  companyId: number;
  userId?: string | null;
  feature: AiFeature;
  chargeQuota?: boolean;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
};

export async function openAiChatCompletion(
  params: OpenAiChatParams,
): Promise<
  | { ok: true; result: OpenAiChatResult }
  | { ok: false; error: string; status: number }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY is not configured", status: 503 };
  }

  let reservation: AiQuotaReservation | null = null;
  if (params.chargeQuota !== false) {
    const reserved = await reserveAiQuota(params.companyId);
    if (reserved.ok === false) {
      return { ok: false, error: reserved.error, status: reserved.status };
    }
    reservation = reserved.reservation;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model ?? "gpt-4.1-mini",
        messages: params.messages,
        temperature: params.temperature ?? 0.3,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      await releaseAiQuotaReservation(reservation);
      const message =
        typeof data === "object" &&
        data &&
        "error" in data &&
        typeof (data as { error?: { message?: string } }).error?.message === "string"
          ? (data as { error: { message: string } }).error.message
          : `OpenAI HTTP ${response.status}`;
      return { ok: false, error: message, status: 502 };
    }

    const content = (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]
      ?.message?.content;
    const estimatedTokens = extractEstimatedTokens(data);

    return {
      ok: true,
      result: {
        content: content ?? null,
        raw: data,
        estimatedTokens,
        reservation,
      },
    };
  } catch (err) {
    await releaseAiQuotaReservation(reservation);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "OpenAI 呼叫失敗",
      status: 502,
    };
  }
}

export async function getCompanyAiUsageStatus(
  companyId: number,
): Promise<CompanyAiUsageStatus | null> {
  let row = await loadCompanySubscriptionRow(companyId);
  if (!row) return null;
  row = await ensureMonthlyCounterCurrent(row);
  return companyRowToUsageStatus(row);
}
