import { supabase } from "../../supabase";
import { withClientCompanyId } from "./clientCompany";

/**
 * Persist homepage pasted LINE text as an inbound conversation row.
 * Uses the same browser Supabase client as CRM customer upsert.
 */
export async function saveManualPasteConversation(
  customerId: string,
  messageText: string,
  companyId: number,
): Promise<boolean> {
  const id = customerId.trim();
  const text = messageText.trim();
  if (!id || !text || companyId <= 0) {
    console.warn("[CONVERSATION_SAVE_FAILED]", {
      reason: "missing customer_id, message_text, or company_id",
      customerId: id || null,
      companyId,
      textLength: text.length,
    });
    return false;
  }

  console.log("[CONVERSATION_SAVE_START]", {
    customerId: id,
    companyId,
    direction: "inbound",
    messageLength: text.length,
  });

  const payload = withClientCompanyId(
    {
      customer_id: id,
      message_text: text,
      direction: "inbound",
      line_user_id: `crm-paste:${id}`,
    },
    companyId,
  );

  try {
    const { data, error } = await supabase
      .from("conversations")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[CONVERSATION_SAVE_FAILED]", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        customerId: id,
        companyId,
      });
      return false;
    }

    console.log("[CONVERSATION_SAVE_SUCCESS]", {
      conversationId: data?.id ?? null,
      customerId: id,
      companyId,
    });
    return true;
  } catch (error) {
    console.warn("[CONVERSATION_SAVE_FAILED]", error);
    return false;
  }
}
