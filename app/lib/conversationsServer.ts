import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationDirection = "inbound" | "outbound";

type LineUserCustomerRow = {
  customer_id: string | null;
};

type LineUserIdRow = {
  line_user_id: string | null;
};

type LineUserCompanyRow = {
  company_id: number | string | null;
};

/** Resolve the company a LINE user is bound to. Falls back to null when unknown. */
export async function findCompanyIdForLineUser(
  supabase: SupabaseClient,
  lineUserId: string,
): Promise<number | null> {
  if (!lineUserId.trim()) return null;
  const { data, error } = await supabase
    .from("line_users")
    .select("company_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.error("line_users company lookup failed:", error.message);
    return null;
  }
  const raw = (data as LineUserCompanyRow | null)?.company_id;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/** Look up the CRM customer bound to a LINE user (within the active company). */
export async function findCustomerIdForLineUser(
  supabase: SupabaseClient,
  lineUserId: string,
  companyId: number,
): Promise<string | null> {
  if (!lineUserId.trim()) return null;

  const { data, error } = await supabase
    .from("line_users")
    .select("customer_id")
    .eq("company_id", companyId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.error("line_users lookup failed:", error.message);
    return null;
  }

  const row = data as LineUserCustomerRow | null;
  return row?.customer_id?.toString().trim() || null;
}

/** Look up the LINE user bound to a CRM customer (within the active company). */
export async function findLineUserIdForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  companyId: number,
): Promise<string | null> {
  if (!customerId.trim()) return null;

  const { data, error } = await supabase
    .from("line_users")
    .select("line_user_id")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    console.error("line_users reverse lookup failed:", error.message);
    return null;
  }

  const row = data as LineUserIdRow | null;
  return row?.line_user_id?.toString().trim() || null;
}

/**
 * Persist a LINE message to `conversations` within the active company.
 * customer_id is auto-resolved from `line_users` when not provided. Errors
 * are logged, never thrown — the LINE webhook must always reply 200.
 */
export async function logLineConversation(
  supabase: SupabaseClient,
  args: {
    lineUserId: string;
    messageText: string;
    companyId: number;
    direction?: ConversationDirection;
    customerId?: string | null;
  },
): Promise<void> {
  const lineUserId = args.lineUserId.trim();
  const messageText = args.messageText;
  if (!lineUserId || !messageText) {
    console.log("[conversations] skipped insert (missing line_user_id or text):", {
      hasLineUserId: Boolean(lineUserId),
      hasMessageText: Boolean(messageText),
    });
    return;
  }

  let customerId = args.customerId ?? null;
  if (customerId === null) {
    customerId = await findCustomerIdForLineUser(supabase, lineUserId, args.companyId);
  }

  const direction = args.direction ?? "inbound";
  const payload = {
    line_user_id: lineUserId,
    customer_id: customerId,
    message_text: messageText,
    direction,
    company_id: args.companyId,
  };

  try {
    const { data, error } = await supabase
      .from("conversations")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[conversations] insert error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        payload,
      });
      return;
    }

    console.log("[conversations] inserted:", {
      id: data?.id ?? null,
      line_user_id: lineUserId,
      customer_id: customerId,
      direction,
      company_id: args.companyId,
      message_length: messageText.length,
    });
  } catch (err) {
    console.error("[conversations] insert threw:", err);
  }
}
