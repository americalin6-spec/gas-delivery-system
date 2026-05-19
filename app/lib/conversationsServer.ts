import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversationDirection = "inbound" | "outbound";

type LineUserCustomerRow = {
  customer_id: string | null;
};

type LineUserIdRow = {
  line_user_id: string | null;
};

/** Look up the CRM customer bound to a LINE user (via line_users.customer_id). */
export async function findCustomerIdForLineUser(
  supabase: SupabaseClient,
  lineUserId: string,
): Promise<string | null> {
  if (!lineUserId.trim()) return null;

  const { data, error } = await supabase
    .from("line_users")
    .select("customer_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (error) {
    console.error("line_users lookup failed:", error.message);
    return null;
  }

  const row = data as LineUserCustomerRow | null;
  return row?.customer_id?.toString().trim() || null;
}

/** Look up the LINE user bound to a CRM customer (via line_users.customer_id). */
export async function findLineUserIdForCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<string | null> {
  if (!customerId.trim()) return null;

  const { data, error } = await supabase
    .from("line_users")
    .select("line_user_id")
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
 * Persist a LINE message to `conversations`. Customer_id is auto-resolved from
 * `line_users` when not provided. Errors are logged, never thrown — the LINE
 * webhook must always reply 200.
 */
export async function logLineConversation(
  supabase: SupabaseClient,
  args: {
    lineUserId: string;
    messageText: string;
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
    customerId = await findCustomerIdForLineUser(supabase, lineUserId);
  }

  const direction = args.direction ?? "inbound";
  const payload = {
    line_user_id: lineUserId,
    customer_id: customerId,
    message_text: messageText,
    direction,
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
      message_length: messageText.length,
    });
  } catch (err) {
    console.error("[conversations] insert threw:", err);
  }
}
