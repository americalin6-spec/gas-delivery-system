import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLang } from "./appLang";

export type CrmNotificationType =
  | "line_message"
  | "new_customer"
  | "binding_success"
  | "follow_up_reminder"
  | "urgent_customer";

export type CrmNotificationRow = {
  id: number;
  company_id: number;
  customer_id: string | null;
  type: CrmNotificationType;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export type CreateCrmNotificationInput = {
  companyId: number;
  type: CrmNotificationType;
  title: string;
  body?: string | null;
  customerId?: string | null;
  /** Skip insert if same company + type + customer already notified today (Taipei). */
  dedupePerDay?: boolean;
};

const NOTIFICATION_TYPES: CrmNotificationType[] = [
  "line_message",
  "new_customer",
  "binding_success",
  "follow_up_reminder",
  "urgent_customer",
];

export function isCrmNotificationType(value: string): value is CrmNotificationType {
  return (NOTIFICATION_TYPES as string[]).includes(value);
}

function taipeiTodayStartIso(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value ?? "1970";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}T00:00:00+08:00`;
  } catch {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}T00:00:00+08:00`;
  }
}

async function hasDuplicateToday(
  supabase: SupabaseClient,
  companyId: number,
  type: CrmNotificationType,
  customerId: string | null,
): Promise<boolean> {
  let q = supabase
    .from("crm_notifications")
    .select("id")
    .eq("company_id", companyId)
    .eq("type", type)
    .gte("created_at", taipeiTodayStartIso())
    .limit(1);

  if (customerId) {
    q = q.eq("customer_id", customerId);
  } else {
    q = q.is("customer_id", null);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[crm_notifications] dedupe check failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Insert a notification row; logs errors and never throws (safe for webhooks). */
export async function createCrmNotification(
  supabase: SupabaseClient,
  input: CreateCrmNotificationInput,
): Promise<number | null> {
  const companyId = input.companyId;
  const type = input.type;
  const customerId = input.customerId?.trim() || null;
  const title = input.title.trim();
  const body = input.body?.trim() || null;

  if (!title) return null;

  try {
    if (input.dedupePerDay && (await hasDuplicateToday(supabase, companyId, type, customerId))) {
      return null;
    }

    const { data, error } = await supabase
      .from("crm_notifications")
      .insert({
        company_id: companyId,
        customer_id: customerId,
        type,
        title,
        body,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[crm_notifications] insert failed:", error.message, { type, companyId });
      return null;
    }
    return data?.id != null ? Number(data.id) : null;
  } catch (err) {
    console.error("[crm_notifications] insert threw:", err);
    return null;
  }
}

export function buildLineMessageNotification(
  customerName: string | null | undefined,
  messagePreview: string,
  lang: AppLang,
): { title: string; body: string } {
  const name = customerName?.trim() || (lang === "zh" ? "客戶" : "Customer");
  const preview = messagePreview.trim().slice(0, 120);
  return {
    title: lang === "zh" ? `新 LINE 訊息 · ${name}` : `New LINE message · ${name}`,
    body: preview || (lang === "zh" ? "收到新訊息" : "New message received"),
  };
}

export function buildNewCustomerNotification(
  customerName: string,
  lang: AppLang,
): { title: string; body: string } {
  return {
    title: lang === "zh" ? `新客戶 · ${customerName}` : `New customer · ${customerName}`,
    body: lang === "zh" ? "已新增至客戶資料表" : "Added to CRM",
  };
}

export function buildBindingSuccessNotification(
  customerName: string,
  lang: AppLang,
): { title: string; body: string } {
  return {
    title: lang === "zh" ? `LINE 綁定成功 · ${customerName}` : `LINE bound · ${customerName}`,
    body: lang === "zh" ? "已連結官方 LINE 帳號" : "Official LINE account linked",
  };
}

export function buildFollowUpReminderNotification(
  customerName: string,
  followUpHint: string | null | undefined,
  lang: AppLang,
): { title: string; body: string } {
  const hint = followUpHint?.trim();
  return {
    title: lang === "zh" ? `追蹤提醒 · ${customerName}` : `Follow-up · ${customerName}`,
    body: hint || (lang === "zh" ? "今日待追蹤" : "Due for follow-up today"),
  };
}

export function buildUrgentCustomerNotification(
  customerName: string,
  lang: AppLang,
): { title: string; body: string } {
  return {
    title: lang === "zh" ? `緊急客戶 · ${customerName}` : `Urgent · ${customerName}`,
    body: lang === "zh" ? "重要日期在 2 日內" : "Important date within 2 days",
  };
}
