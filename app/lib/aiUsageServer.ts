import "server-only";

import {
  buildAiQuotaUpgradeFlowForPlan,
  type AiQuotaUpgradeFlow,
} from "./aiQuotaUpgrade";
import {
  companyRowToSubscriptionView,
  isExpiredPaidSubscription,
  loadCompanySubscriptionRow,
  type CompanySubscriptionRow,
} from "./subscriptionServer";
import {
  AI_LIMIT_EXCEEDED_MESSAGE,
  AI_TRIAL_EXPIRED_MESSAGE,
  PLAN_DEFINITIONS,
} from "./subscriptionPlans";
import {
  currentUsageMonthKey,
  isAiUsageMonthTypeMismatchError,
  isSameUsageMonth,
  legacyUsageMonthInt,
  normalizeUsageMonthKey,
  parseUsageCount,
} from "./aiUsageMonth";
import { getSupabaseServiceRole } from "./supabaseServer";
import { serverLogger } from "./serverLogger";

export {
  AI_TRIAL_EXPIRED_MESSAGE,
  AI_LIMIT_EXCEEDED_MESSAGE,
} from "./subscriptionPlans";

export const TRIAL_MONTHLY_LIMIT = PLAN_DEFINITIONS.trial.aiMonthlyLimit;
export const PAID_MONTHLY_LIMIT = PLAN_DEFINITIONS.professional.aiMonthlyLimit;
export const TRIAL_PERIOD_DAYS = 30;
export const SUBSCRIPTION_EXPIRED_MESSAGE =
  "您的方案已到期，請續訂以繼續使用進階功能。";

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

export { buildNewCompanySubscriptionFields as buildNewCompanyPlanFields } from "./subscriptionServer";
export {
  currentUsageMonthKey,
  normalizeUsageMonthKey,
  parseUsageCount,
} from "./aiUsageMonth";

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

async function updateCompanyUsageMonthCounters(
  companyId: number,
  patch: { ai_used_this_month: number; ai_usage_month: string },
): Promise<{ error: string | null }> {
  const admin = getSupabaseServiceRole();
  const { error } = await admin.from("companies").update(patch).eq("id", companyId);
  if (!error) return { error: null };

  if (!isAiUsageMonthTypeMismatchError(error.message)) {
    return { error: error.message };
  }

  const legacyMonth = legacyUsageMonthInt(patch.ai_usage_month);
  if (legacyMonth == null) {
    return { error: error.message };
  }

  const { error: retryError } = await admin
    .from("companies")
    .update({
      ai_used_this_month: patch.ai_used_this_month,
      ai_usage_month: legacyMonth,
    })
    .eq("id", companyId);

  return { error: retryError?.message ?? null };
}

async function ensureMonthlyCounterCurrent(
  row: CompanySubscriptionRow,
): Promise<CompanySubscriptionRow> {
  const month = currentUsageMonthKey();
  if (isSameUsageMonth(row.ai_usage_month, month)) return row;

  if (!row.usageCountersPersisted) {
    return { ...row, ai_used_this_month: 0, ai_usage_month: month };
  }

  const { error } = await updateCompanyUsageMonthCounters(row.id, {
    ai_used_this_month: 0,
    ai_usage_month: month,
  });

  if (error) {
    console.warn("[aiUsage] month reset skipped:", error);
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
  | {
      allowed: false;
      error: string;
      status: number;
      quotaExhausted?: boolean;
      upgradeFlow?: AiQuotaUpgradeFlow;
    };

export type AiQuotaDeniedPayload = {
  error: string;
  quotaExhausted: true;
  upgradeFlow: AiQuotaUpgradeFlow;
};

export async function buildAiQuotaDeniedPayload(
  companyId: number,
): Promise<AiQuotaDeniedPayload> {
  let row = await loadCompanySubscriptionRow(companyId);
  if (row) {
    row = await ensureMonthlyCounterCurrent(row);
  }
  const view = row ? companyRowToSubscriptionView(row) : null;
  const upgradeFlow = buildAiQuotaUpgradeFlowForPlan(
    view?.subscriptionPlan ?? "trial",
    view?.hasActivePaidSubscription ?? false,
    view?.monthlyAiLimit,
  );
  return {
    error: upgradeFlow.title,
    quotaExhausted: true,
    upgradeFlow,
  };
}

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

/** Check monthly quota before an OpenAI call (server-side only). */
export async function assertAiUsageAllowed(
  companyId: number,
): Promise<AiUsageGateResult> {
  let row = await loadCompanySubscriptionRow(companyId);
  if (!row) {
    console.error("[aiUsage] workspace row missing for company:", { companyId });
    return { allowed: false, error: "找不到工作區", status: 404 };
  }

  row = await ensureMonthlyCounterCurrent(row);

  const view = companyRowToSubscriptionView(row);
  if (view.aiRemainingThisMonth <= 0) {
    const denied = await buildAiQuotaDeniedPayload(companyId);
    serverLogger.warn({
      eventType: "ai.quota_denied",
      status: "warn",
      companyId,
      message: denied.error,
      meta: {
        feature: "gate",
        subscriptionPlan: view.subscriptionPlan,
        expiredPaid: isExpiredPaidSubscription(row),
      },
    });
    return {
      allowed: false,
      error: denied.error,
      status: 403,
      quotaExhausted: true,
      upgradeFlow: denied.upgradeFlow,
    };
  }

  return { allowed: true, company: row };
}

async function insertAiUsageLog(params: {
  companyId: number;
  userId?: string | null;
  feature: AiFeature;
  estimatedTokens?: number | null;
}): Promise<void> {
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
    console.error("[aiUsage] log insert failed:", error.message);
  }
}

async function readDirectCompanyUsageCounter(
  companyId: number,
): Promise<{ used: number; month: string | null } | null> {
  const admin = getSupabaseServiceRole();
  const { data, error } = await admin
    .from("companies")
    .select("ai_used_this_month, ai_usage_month")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    used: parseUsageCount(
      (data as { ai_used_this_month?: unknown }).ai_used_this_month,
    ),
    month: normalizeUsageMonthKey(
      (data as { ai_usage_month?: unknown }).ai_usage_month,
    ),
  };
}

/** Increment companies.ai_used_this_month once (fallback when RPC reserve did not persist). */
async function incrementCompanyAiUsageCounter(params: {
  companyId: number;
  userId?: string | null;
  feature: AiFeature;
}): Promise<{ ok: boolean; used: number }> {
  const month = currentUsageMonthKey();
  const direct = await readDirectCompanyUsageCounter(params.companyId);

  if (!direct) {
    serverLogger.warn({
      eventType: "api.error",
      status: "warn",
      companyId: params.companyId,
      userId: params.userId ?? null,
      message: "usage_counter_read_failed",
      meta: { feature: params.feature, step: "counter_read" },
    });
    return { ok: false, used: 0 };
  }

  const used = isSameUsageMonth(direct.month, month) ? direct.used + 1 : 1;
  const { error: updateError } = await updateCompanyUsageMonthCounters(params.companyId, {
    ai_used_this_month: used,
    ai_usage_month: month,
  });

  if (updateError) {
    serverLogger.warn({
      eventType: "api.error",
      status: "warn",
      companyId: params.companyId,
      userId: params.userId ?? null,
      message: updateError,
      meta: { feature: params.feature, step: "counter_update" },
    });
    return { ok: false, used: direct.used };
  }

  serverLogger.info({
    eventType: "ai.quota_deducted",
    status: "ok",
    companyId: params.companyId,
    userId: params.userId ?? null,
    message: "usage_recorded",
    meta: { feature: params.feature, used },
  });
  return { ok: true, used };
}

export async function recordAiUsage(params: {
  companyId: number;
  userId?: string | null;
  feature: AiFeature;
  estimatedTokens?: number | null;
}): Promise<void> {
  await insertAiUsageLog(params);
  await incrementCompanyAiUsageCounter(params);
}

async function reserveAiQuota(companyId: number): Promise<
  | { ok: true; reservation: AiQuotaReservation }
  | {
      ok: false;
      error: string;
      status: number;
      quotaExhausted?: boolean;
      upgradeFlow?: AiQuotaUpgradeFlow;
    }
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
      const denied = await buildAiQuotaDeniedPayload(companyId);
      serverLogger.warn({
        eventType: "ai.quota_denied",
        status: "warn",
        companyId,
        message: denied.error,
        meta: { mode: "rpc", rpcError: row.error ?? null },
      });
      return {
        ok: false,
        error: denied.error,
        status: 403,
        quotaExhausted: true,
        upgradeFlow: denied.upgradeFlow,
      };
    }
    const usageMonth =
      normalizeUsageMonthKey(row.usage_month) ?? currentUsageMonthKey();
    return {
      ok: true,
      reservation: { mode: "rpc", companyId, usageMonth },
    };
  }

  const useQuotaFallback =
    rpc.error &&
    (/function .* does not exist/i.test(rpc.error.message) ||
      isAiUsageMonthTypeMismatchError(rpc.error.message));

  if (useQuotaFallback) {
    if (isAiUsageMonthTypeMismatchError(rpc.error?.message)) {
      serverLogger.warn({
        eventType: "api.error",
        status: "warn",
        companyId,
        message: rpc.error.message,
        meta: { step: "reserve_rpc_month_type", fallback: true },
      });
    }
    const gate = await assertAiUsageAllowed(companyId);
    if (gate.allowed === false) {
      return {
        ok: false,
        error: gate.error,
        status: gate.status,
        quotaExhausted: gate.quotaExhausted,
        upgradeFlow: gate.upgradeFlow,
      };
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
  const usageMonth =
    normalizeUsageMonthKey(reservation.usageMonth) ?? currentUsageMonthKey();
  const { error } = await admin.rpc("release_company_ai_quota", {
    p_company_id: reservation.companyId,
    p_usage_month: usageMonth,
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

  await insertAiUsageLog(params);

  if (params.reservation.mode === "fallback") {
    await incrementCompanyAiUsageCounter(params);
    return;
  }

  const month = currentUsageMonthKey();
  const direct = await readDirectCompanyUsageCounter(params.companyId);
  const rpcPersisted =
    direct != null &&
    isSameUsageMonth(direct.month, month) &&
    direct.used > 0;

  if (rpcPersisted) {
    serverLogger.info({
      eventType: "ai.quota_deducted",
      status: "ok",
      companyId: params.companyId,
      userId: params.userId ?? null,
      message: "quota_finalized",
      meta: { feature: params.feature, mode: "rpc", used: direct.used },
    });
    return;
  }

  serverLogger.warn({
    eventType: "api.error",
    status: "warn",
    companyId: params.companyId,
    userId: params.userId ?? null,
    message: "rpc_reserve_counter_missing",
    meta: { feature: params.feature, step: "finalize_repair_increment" },
  });
  await incrementCompanyAiUsageCounter(params);
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
  | {
      ok: false;
      error: string;
      status: number;
      quotaExhausted?: boolean;
      upgradeFlow?: AiQuotaUpgradeFlow;
    }
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY is not configured", status: 503 };
  }

  let reservation: AiQuotaReservation | null = null;
  if (params.chargeQuota !== false) {
    const reserved = await reserveAiQuota(params.companyId);
    if (reserved.ok === false) {
      return {
        ok: false,
        error: reserved.error,
        status: reserved.status,
        quotaExhausted: reserved.quotaExhausted,
        upgradeFlow: reserved.upgradeFlow,
      };
    }
    reservation = reserved.reservation;
  }

  serverLogger.info({
    eventType: "ai.analysis_request",
    status: "ok",
    companyId: params.companyId,
    userId: params.userId ?? null,
    message: "openai_request_start",
    meta: {
      feature: params.feature,
      chargeQuota: params.chargeQuota !== false,
    },
  });

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
          ? (data as { error: { message: string } }).error?.message
          : `OpenAI HTTP ${response.status}`;
      serverLogger.error({
        eventType: "api.error",
        status: "error",
        companyId: params.companyId,
        userId: params.userId ?? null,
        message,
        meta: { feature: params.feature, httpStatus: response.status },
      });
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
    const message = err instanceof Error ? err.message : "OpenAI 呼叫失敗";
    serverLogger.error(
      {
        eventType: "exception",
        status: "error",
        companyId: params.companyId,
        userId: params.userId ?? null,
        message,
        meta: { feature: params.feature },
      },
      err,
    );
    return {
      ok: false,
      error: message,
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
