import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerAiSummary } from "./customerAiSummary";
import type { CustomerAiFollowUp } from "./customerAiFollowUp";
import {
  sanitizeCustomerFacingLineReply,
  sanitizeCustomerFacingText,
} from "./customerFacingText";

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return /does not exist/i.test(message) || /column/i.test(message);
}

function clean(value: unknown): string | null {
  const t = String(value ?? "").trim();
  if (!t || t === "--") return null;
  return t;
}

async function persistAiPatch(
  supabase: SupabaseClient,
  companyId: number,
  customerId: string,
  patch: Record<string, string | null>,
): Promise<{ savedColumns: string[]; error: string | null }> {
  const entries = Object.entries(patch).filter(([, v]) => v != null);
  if (entries.length === 0) {
    return { savedColumns: [], error: null };
  }

  const payload = Object.fromEntries(entries);
  const { error } = await supabase
    .from("customers")
    .update(payload)
    .eq("company_id", companyId)
    .eq("id", customerId);

  if (!error) {
    return { savedColumns: Object.keys(payload), error: null };
  }

  if (!isMissingColumnError(error.message)) {
    return { savedColumns: [], error: error.message };
  }

  const savedColumns: string[] = [];
  const errors: string[] = [];
  for (const [column, value] of entries) {
    const { error: singleError } = await supabase
      .from("customers")
      .update({ [column]: value })
      .eq("company_id", companyId)
      .eq("id", customerId);

    if (singleError) {
      errors.push(`${column}: ${singleError.message}`);
      continue;
    }
    savedColumns.push(column);
  }

  return { savedColumns, error: errors.length ? errors.join("; ") : null };
}

export async function persistCustomerAiSummaryFields(
  supabase: SupabaseClient,
  companyId: number,
  customerId: string,
  summary: CustomerAiSummary,
): Promise<{ savedColumns: string[]; error: string | null }> {
  const patch: Record<string, string | null> = {
    ai_summary: clean(
      [
        `需求：${summary.customerNeeds}`,
        `痛點：${summary.painPoints}`,
        `成交機率：${summary.dealProbability}`,
        `情緒：${summary.customerEmotion}`,
        `下一步：${summary.suggestedNextStep}`,
        `風險：${summary.riskAlert}`,
      ].join("\n"),
    ),
    ai_customer_needs: clean(summary.customerNeeds),
    ai_pain_points: clean(summary.painPoints),
    ai_emotion: clean(summary.customerEmotion),
    ai_next_step: clean(summary.suggestedNextStep),
    ai_risk_alert: clean(summary.riskAlert),
    ai_probability: clean(summary.dealProbability),
  };
  return persistAiPatch(supabase, companyId, customerId, patch);
}

export function buildCustomerAiPatchFromAnalyzePayload(
  payload: Record<string, unknown>,
): Record<string, string | null> {
  const need = clean(
    payload.ai_customer_needs ??
      payload.aiCustomerNeeds ??
      payload.customerNeeds ??
      payload.customerNeed,
  );
  const mood = clean(payload.customerMood ?? payload.customerEmotion);
  const next = clean(payload.nextStep);
  const prob = clean(payload.dealProbability);
  const summaryLine = clean(payload.summary);
  const aiSummary = clean(
    [
      need ? `需求：${need}` : null,
      mood ? `情緒：${mood}` : null,
      next ? `下一步：${next}` : null,
      summaryLine ? `摘要：${summaryLine}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return {
    ai_summary: aiSummary,
    ai_customer_needs: need,
    ai_emotion: mood,
    ai_next_step: next,
    ai_probability: prob,
  };
}

export async function persistCustomerAiFromAnalyzePayload(
  supabase: SupabaseClient,
  companyId: number,
  customerId: string,
  payload: Record<string, unknown>,
): Promise<{ savedColumns: string[]; error: string | null }> {
  return persistAiPatch(
    supabase,
    companyId,
    customerId,
    buildCustomerAiPatchFromAnalyzePayload(payload),
  );
}

export async function persistCustomerAiFollowUpFields(
  supabase: SupabaseClient,
  companyId: number,
  customerId: string,
  followUp: CustomerAiFollowUp,
): Promise<{ savedColumns: string[]; error: string | null }> {
  const lineReply = sanitizeCustomerFacingLineReply(followUp.suggestedMessage);
  const patch: Record<string, string | null> = {
    ai_follow_up: clean(lineReply),
    ai_professional_reply: clean(lineReply),
    ai_next_step: clean(sanitizeCustomerFacingText(followUp.suggestedAction)),
    ai_summary: clean(
      sanitizeCustomerFacingText(
        [
          `跟進時間：${followUp.suggestedFollowUpTime}`,
          `建議行動：${followUp.suggestedAction}`,
          `成交策略：${followUp.closingStrategy}`,
        ].join("\n"),
      ),
    ),
  };
  return persistAiPatch(supabase, companyId, customerId, patch);
}

