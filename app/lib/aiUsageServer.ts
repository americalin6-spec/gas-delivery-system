import "server-only";

import { getSupabaseServiceRole } from "./supabaseServer";

export const TRIAL_MONTHLY_LIMIT = 90;
export const PAID_MONTHLY_LIMIT = 1000;
export const TRIAL_PERIOD_DAYS = 30;

export const AI_TRIAL_EXPIRED_MESSAGE =
  "免費試用已結束，請升級方案後繼續使用";

export const AI_LIMIT_EXCEEDED_MESSAGE =
  "本月 AI 使用次數已達上限，請升級方案或下個月再使用";

export type AiFeature =
  | "analyze"
  | "ai_summary"
  | "ai_follow_up"
  | "ai_extract";

export type CompanyPlanRow = {
  id: number;
  plan_status: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  ai_monthly_limit: number;
  ai_used_this_month: number;
  ai_usage_month: string | null;
};

export type CompanyAiUsageStatus = {
  planStatus: string;
  planStatusLabel: string;
  trialDaysRemaining: number | null;
  monthlyLimit: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  trialEndsAt: string | null;
  trialExpired: boolean;
  limitReached: boolean;
};

function currentUsageMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function buildNewCompanyPlanFields(now = new Date()): Record<string, unknown> {
  const trialEnds = new Date(now);
  trialEnds.setUTCDate(trialEnds.getUTCDate() + TRIAL_PERIOD_DAYS);
  return {
    plan_status: "trial",
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEnds.toISOString(),
    ai_monthly_limit: TRIAL_MONTHLY_LIMIT,
    ai_used_this_month: 0,
    ai_usage_month: currentUsageMonth(now),
  };
}

function parseLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseUsageCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function effectiveMonthlyLimit(row: CompanyPlanRow): number {
  if (row.plan_status === "paid") {
    return parseLimit(row.ai_monthly_limit, PAID_MONTHLY_LIMIT);
  }
  return parseLimit(row.ai_monthly_limit, TRIAL_MONTHLY_LIMIT);
}

function isTrialExpired(row: CompanyPlanRow, now = new Date()): boolean {
  if (row.plan_status === "paid") return false;
  if (row.plan_status === "expired") return true;
  const ends = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  if (!ends || Number.isNaN(ends.getTime())) return false;
  return now.getTime() >= ends.getTime();
}

function trialDaysRemaining(row: CompanyPlanRow, now = new Date()): number | null {
  if (row.plan_status === "paid") return null;
  const ends = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  if (!ends || Number.isNaN(ends.getTime())) return null;
  const ms = ends.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function planStatusLabel(row: CompanyPlanRow, now = new Date()): string {
  if (row.plan_status === "paid") return "付費方案";
  if (isTrialExpired(row, now)) return "試用已結束";
  return "免費試用中";
}

export function companyRowToUsageStatus(row: CompanyPlanRow, now = new Date()): CompanyAiUsageStatus {
  const month = currentUsageMonth(now);
  const used =
    row.ai_usage_month === month ? parseUsageCount(row.ai_used_this_month) : 0;
  const limit = effectiveMonthlyLimit(row);
  const remaining = Math.max(0, limit - used);
  const trialExpired = isTrialExpired(row, now);

  return {
    planStatus: row.plan_status,
    planStatusLabel: planStatusLabel(row, now),
    trialDaysRemaining: trialDaysRemaining(row, now),
    monthlyLimit: limit,
    usedThisMonth: used,
    remainingThisMonth: remaining,
    trialEndsAt: row.trial_ends_at,
    trialExpired,
    limitReached: used >= limit,
  };
}

async function loadCompanyPlan(companyId: number): Promise<CompanyPlanRow | null> {
  const admin = getSupabaseServiceRole();
  const { data, error } = await admin
    .from("companies")
    .select(
      "id, plan_status, trial_started_at, trial_ends_at, ai_monthly_limit, ai_used_this_month, ai_usage_month",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    console.error("[aiUsage] load company failed:", { companyId, message: error.message });
    return null;
  }
  if (!data) return null;

  return {
    id: Number(data.id),
    plan_status: String(data.plan_status ?? "trial"),
    trial_started_at: data.trial_started_at != null ? String(data.trial_started_at) : null,
    trial_ends_at: data.trial_ends_at != null ? String(data.trial_ends_at) : null,
    ai_monthly_limit: parseLimit(data.ai_monthly_limit, TRIAL_MONTHLY_LIMIT),
    ai_used_this_month: parseUsageCount(data.ai_used_this_month),
    ai_usage_month: data.ai_usage_month != null ? String(data.ai_usage_month) : null,
  };
}

async function ensureMonthlyCounterCurrent(
  row: CompanyPlanRow,
): Promise<CompanyPlanRow> {
  const month = currentUsageMonth();
  if (row.ai_usage_month === month) return row;

  const admin = getSupabaseServiceRole();
  const { data, error } = await admin
    .from("companies")
    .update({
      ai_used_this_month: 0,
      ai_usage_month: month,
    })
    .eq("id", row.id)
    .select(
      "id, plan_status, trial_started_at, trial_ends_at, ai_monthly_limit, ai_used_this_month, ai_usage_month",
    )
    .maybeSingle();

  if (error || !data) {
    console.error("[aiUsage] month reset failed:", error?.message);
    return { ...row, ai_used_this_month: 0, ai_usage_month: month };
  }

  return {
    id: Number(data.id),
    plan_status: String(data.plan_status ?? "trial"),
    trial_started_at: data.trial_started_at != null ? String(data.trial_started_at) : null,
    trial_ends_at: data.trial_ends_at != null ? String(data.trial_ends_at) : null,
    ai_monthly_limit: parseLimit(data.ai_monthly_limit, TRIAL_MONTHLY_LIMIT),
    ai_used_this_month: 0,
    ai_usage_month: month,
  };
}

export type AiUsageGateResult =
  | { allowed: true; company: CompanyPlanRow }
  | { allowed: false; error: string; status: number };

/** Check trial + monthly limit before an OpenAI call. */
export async function assertAiUsageAllowed(
  companyId: number,
): Promise<AiUsageGateResult> {
  let row = await loadCompanyPlan(companyId);
  if (!row) {
    return { allowed: false, error: "找不到工作區", status: 404 };
  }

  row = await ensureMonthlyCounterCurrent(row);

  if (isTrialExpired(row)) {
    return {
      allowed: false,
      error: AI_TRIAL_EXPIRED_MESSAGE,
      status: 403,
    };
  }

  const limit = effectiveMonthlyLimit(row);
  const used = parseUsageCount(row.ai_used_this_month);
  if (used >= limit) {
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

  const row = await loadCompanyPlan(params.companyId);
  if (!row) return;

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
    console.error("[aiUsage] counter update failed:", updateError.message);
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
};

export type OpenAiChatParams = {
  companyId: number;
  userId?: string | null;
  feature: AiFeature;
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

  const gate = await assertAiUsageAllowed(params.companyId);
  if (gate.allowed === false) {
    return { ok: false, error: gate.error, status: gate.status };
  }

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

  await recordAiUsage({
    companyId: params.companyId,
    userId: params.userId,
    feature: params.feature,
    estimatedTokens,
  });

  return {
    ok: true,
    result: {
      content: content ?? null,
      raw: data,
      estimatedTokens,
    },
  };
}

export async function getCompanyAiUsageStatus(
  companyId: number,
): Promise<CompanyAiUsageStatus | null> {
  let row = await loadCompanyPlan(companyId);
  if (!row) return null;
  row = await ensureMonthlyCounterCurrent(row);
  return companyRowToUsageStatus(row);
}
