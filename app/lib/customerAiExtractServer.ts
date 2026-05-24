import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeConversationEngagement,
  buildCustomerAiContextBlock,
  formatConversationRows,
  type ConversationRow,
} from "./customerAiContext";
import {
  AI_EXTRACT_COLUMN_LABELS_ZH,
  CUSTOMER_SOCIAL_FIELD_KEYS,
  baselineExtractFromConversation,
  buildCustomerAiExtractPrompt,
  mapAiExtractJsonToFields,
  mergeExtractedFields,
  mergeFieldMaps,
  pickSocialFieldsFromExtract,
  type AiExtractCustomerColumn,
  type CustomerAiExtractFields,
  type CustomerSocialFieldKey,
  type ExtractFieldDecision,
} from "./customerAiExtract";
import { fetchCustomerByIdForActiveCompany } from "./customersTenant";
import { parseAiJsonObject } from "./parseAiJson";

const CONVERSATIONS_SELECT =
  "id, customer_id, message_text, direction, created_at";

export type CustomerAiExtractOutcome = {
  ok: boolean;
  updatedColumns: AiExtractCustomerColumn[];
  extractedAt: string | null;
  extractedSocial?: Partial<Record<CustomerSocialFieldKey, string>>;
  savedFields?: string[];
  skippedFields?: { column: string; reason: string; existingValue?: string }[];
  error?: string;
};

function logExtractDecisions(
  trigger: string,
  customerId: string,
  extractedSocial: Partial<Record<CustomerSocialFieldKey, string>>,
  decisions: ExtractFieldDecision[],
): void {
  const saved = decisions.filter((d) => d.action === "save");
  const skipped = decisions.filter((d) => d.action === "skip");

  console.log("[ai-extract] extracted social fields:", {
    trigger,
    customerId,
    social: extractedSocial,
  });

  console.log("[ai-extract] saved fields:", {
    trigger,
    customerId,
    fields: saved.map((d) => ({
      column: d.column,
      label: AI_EXTRACT_COLUMN_LABELS_ZH[d.column],
      value: d.value,
      overwriteReason: d.reason,
      confidence: d.confidence,
      previousValue: d.previousValue ?? null,
    })),
  });

  console.log("[ai-extract] skipped fields:", {
    trigger,
    customerId,
    fields: skipped.map((d) => ({
      column: d.column,
      label: AI_EXTRACT_COLUMN_LABELS_ZH[d.column],
      reason: d.reason,
      value: d.action === "skip" ? d.value ?? null : null,
      confidence: d.action === "skip" ? d.confidence ?? null : null,
      existingValue: d.action === "skip" ? d.existingValue ?? null : null,
    })),
  });
}

function columnMentionedInError(message: string, column: string): boolean {
  const m = message.toLowerCase();
  const c = column.toLowerCase();
  return m.includes(c) || m.includes(`'${c}'`) || m.includes(`"${c}"`);
}

/** Persist patch — retries per-column when batch update fails (e.g. missing social columns). */
async function persistCustomerExtractPatch(
  supabase: SupabaseClient,
  companyId: number,
  customerId: string,
  patch: Record<string, string>,
  extractedAt: string,
): Promise<{ savedColumns: AiExtractCustomerColumn[]; errors: string[] }> {
  const saved = new Set<AiExtractCustomerColumn>();
  const errors: string[] = [];

  if (Object.keys(patch).length === 0) {
    return { savedColumns: [], errors };
  }

  const batchPayload: Record<string, unknown> = {
    ...patch,
    ai_extracted_at: extractedAt,
    updated_at: extractedAt,
  };

  const { error: batchError } = await supabase
    .from("customers")
    .update(batchPayload)
    .eq("company_id", companyId)
    .eq("id", customerId);

  if (!batchError) {
    return { savedColumns: Object.keys(patch) as AiExtractCustomerColumn[], errors };
  }

  console.warn("[ai-extract] batch update failed, retrying per column:", batchError.message);

  const withoutAiTs: Record<string, unknown> = { ...patch, updated_at: extractedAt };
  const { error: batchNoAiTs } = await supabase
    .from("customers")
    .update(withoutAiTs)
    .eq("company_id", companyId)
    .eq("id", customerId);

  if (!batchNoAiTs) {
    return { savedColumns: Object.keys(patch) as AiExtractCustomerColumn[], errors };
  }

  console.warn("[ai-extract] batch without ai_extracted_at failed:", batchNoAiTs.message);

  const columns = Object.keys(patch) as AiExtractCustomerColumn[];
  for (const column of columns) {
    const singlePayload: Record<string, unknown> = {
      [column]: patch[column],
      updated_at: extractedAt,
    };

    const { error } = await supabase
      .from("customers")
      .update(singlePayload)
      .eq("company_id", companyId)
      .eq("id", customerId);

    if (error) {
      if (columnMentionedInError(error.message, column)) {
        errors.push(`${column}: ${error.message}`);
        console.error("[ai-extract] column save failed (check DB migration):", {
          column,
          message: error.message,
        });
      } else {
        errors.push(`${column}: ${error.message}`);
        console.error("[ai-extract] column save failed:", { column, message: error.message });
      }
      continue;
    }

    saved.add(column);
    console.log("[ai-extract] column saved:", { column, value: patch[column] });
  }

  if (saved.size > 0) {
    await supabase
      .from("customers")
      .update({ ai_extracted_at: extractedAt, updated_at: extractedAt })
      .eq("company_id", companyId)
      .eq("id", customerId);
  }

  return { savedColumns: [...saved], errors };
}

async function loadConversationText(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
  override?: string,
): Promise<string> {
  const trimmed = override?.trim() ?? "";
  if (trimmed) return trimmed;

  const { data: rows, error } = await supabase
    .from("conversations")
    .select(CONVERSATIONS_SELECT)
    .eq("customer_id", customerId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ai-extract] conversations error:", error.message);
    return "";
  }

  return formatConversationRows((rows ?? []) as ConversationRow[]);
}

async function extractWithOpenAi(
  conversationText: string,
  customer: Record<string, unknown>,
): Promise<CustomerAiExtractFields> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !conversationText.trim()) return {};

  const engagement = analyzeConversationEngagement([]);
  const context = buildCustomerAiContextBlock(customer, conversationText, engagement);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: buildCustomerAiExtractPrompt(context || conversationText),
        },
      ],
      temperature: 0.2,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return mapAiExtractJsonToFields(parseAiJsonObject(content));
}

/**
 * Extract CRM fields from conversation and merge into `customers` (non-destructive).
 */
export async function runCustomerAiFieldExtraction(
  supabase: SupabaseClient,
  companyId: number,
  customerId: string,
  options?: { conversationText?: string; trigger?: string },
): Promise<CustomerAiExtractOutcome> {
  const trigger = options?.trigger ?? "unknown";

  try {
    const { customer, error: fetchError } = await fetchCustomerByIdForActiveCompany<
      Record<string, unknown>
    >(supabase, customerId, companyId);

    if (fetchError) {
      return { ok: false, updatedColumns: [], extractedAt: null, error: fetchError.message };
    }
    if (!customer) {
      return {
        ok: false,
        updatedColumns: [],
        extractedAt: null,
        error: "無法存取此資料",
      };
    }

    const conversationText = await loadConversationText(
      supabase,
      customerId,
      companyId,
      options?.conversationText,
    );

    if (!conversationText.trim()) {
      return {
        ok: true,
        updatedColumns: [],
        extractedAt: (customer.ai_extracted_at as string | null) ?? null,
        extractedSocial: pickSocialFieldsFromExtract({}),
      };
    }

    const baseline = baselineExtractFromConversation(conversationText);
    let mergedFields = baseline;

    try {
      const aiFields = await extractWithOpenAi(conversationText, customer);
      mergedFields = mergeFieldMaps(baseline, aiFields);
    } catch (aiErr) {
      console.error("[ai-extract] OpenAI failed, using regex baseline:", aiErr);
    }

    const extractedSocial = pickSocialFieldsFromExtract(mergedFields);
    const { patch, updatedColumns, decisions } = mergeExtractedFields(customer, mergedFields);

    logExtractDecisions(trigger, customerId, extractedSocial, decisions);

    const skippedFields = decisions
      .filter((d): d is ExtractFieldDecision & { action: "skip" } => d.action === "skip")
      .map((d) => ({
        column: d.column,
        reason: d.reason,
        existingValue: d.existingValue,
      }));

    if (updatedColumns.length === 0) {
      return {
        ok: true,
        updatedColumns: [],
        extractedAt: (customer.ai_extracted_at as string | null) ?? null,
        extractedSocial,
        savedFields: [],
        skippedFields,
      };
    }

    const socialPatch: Record<string, string> = {};
    const otherPatch: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (CUSTOMER_SOCIAL_FIELD_KEYS.includes(key as CustomerSocialFieldKey)) {
        socialPatch[key] = value;
      } else {
        otherPatch[key] = value;
      }
    }

    console.log("[ai-extract] patch to save:", {
      trigger,
      customerId,
      socialPatch,
      otherPatch,
    });

    const extractedAt = new Date().toISOString();
    const { savedColumns, errors } = await persistCustomerExtractPatch(
      supabase,
      companyId,
      customerId,
      patch,
      extractedAt,
    );

    const savedSocial = savedColumns.filter((c) =>
      CUSTOMER_SOCIAL_FIELD_KEYS.includes(c as CustomerSocialFieldKey),
    );

    console.log("[ai-extract] persist result:", {
      trigger,
      customerId,
      savedColumns,
      savedSocial,
      errors,
    });

    if (savedColumns.length === 0 && errors.length > 0) {
      return {
        ok: false,
        updatedColumns: [],
        extractedAt: null,
        extractedSocial,
        savedFields: [],
        skippedFields,
        error: errors.join("; "),
      };
    }

    return {
      ok: true,
      updatedColumns: savedColumns,
      extractedAt: savedColumns.length > 0 ? extractedAt : null,
      extractedSocial,
      savedFields: savedColumns,
      skippedFields,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  } catch (err) {
    console.error("[ai-extract]", err);
    return {
      ok: false,
      updatedColumns: [],
      extractedAt: null,
      error: err instanceof Error ? err.message : "擷取失敗",
    };
  }
}
