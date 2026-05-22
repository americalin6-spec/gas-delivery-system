import { COMPANY_HEADER_NAME } from "./companyContext";
import type { CrmNotificationType } from "./crmNotifications";

export async function postCrmNotification(
  companyId: number,
  payload: {
    type: CrmNotificationType;
    customer_id?: string | null;
    customer_name?: string | null;
    message_preview?: string | null;
    follow_up_hint?: string | null;
    lang?: "zh" | "en";
  },
): Promise<void> {
  if (companyId <= 0) return;
  try {
    await fetch("/api/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [COMPANY_HEADER_NAME]: String(companyId),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[crm_notifications] client post failed:", err);
  }
}
