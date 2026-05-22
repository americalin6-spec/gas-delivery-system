import { pushDueCustomerReminders, type CustomerPushResult } from "./customerLinePush";
import {
  buildFollowUpReminderNotification,
  createCrmNotification,
} from "./crmNotifications";
import { sendLinePushMessage } from "./lineMessaging";
import { formatFollowUpDateDisplay } from "./followUpReminders";
import {
  loadLineReminderSettings,
  markReminderSentToday,
  shouldRunScheduledReminder,
} from "./lineReminderSettingsServer";
import {
  filterDueFollowUpCustomers,
  formatLineReminderMessage,
  REMINDER_CHECK_SELECT,
  type DueReminderCustomer,
} from "./reminderCheck";
import { activeCustomersOnly } from "./customerSoftDelete";
import { getSupabaseServer } from "./supabaseServer";
import { DEFAULT_COMPANY_ID } from "./companyContext";
import type { ReminderCustomerRow } from "./calendarReminders";

export type ReminderCheckResult = {
  ok: boolean;
  /** Tenant the result applies to. */
  companyId: number;
  skipped?: boolean;
  reason?: string;
  dueCount: number;
  /** Rows returned from `customers` select (helps debug RLS / empty data). */
  fetchedRowCount?: number;
  /** Salesperson summary push status. */
  sent: boolean;
  lineError?: string;
  preview?: string;
  /** Per-customer LINE pushes to bound users (line_users.customer_id). */
  customerPushes?: CustomerPushResult;
};

/** Load CRM rows and compute due list (Taipei calendar + follow_up_date / next_follow_up_at). */
export async function fetchReminderCheckState(companyId: number = DEFAULT_COMPANY_ID): Promise<{
  rows: ReminderCustomerRow[];
  error: string | null;
  due: DueReminderCustomer[];
}> {
  const supabase = getSupabaseServer();
  const { data, error } = await activeCustomersOnly(
    supabase.from("customers").select(REMINDER_CHECK_SELECT).eq("company_id", companyId),
  );
  const rows = (data ?? []) as ReminderCustomerRow[];
  return {
    rows,
    error: error?.message ?? null,
    due: filterDueFollowUpCustomers(rows),
  };
}

export async function runReminderCheck(options?: {
  force?: boolean;
  lang?: "zh" | "en";
  companyId?: number;
}): Promise<ReminderCheckResult> {
  const lang = options?.lang ?? "zh";
  const companyId = options?.companyId ?? DEFAULT_COMPANY_ID;
  const settings = await loadLineReminderSettings();
  const channelAccessToken = settings.channel_access_token.trim();
  const salespersonUserId = settings.user_id.trim();
  const force = Boolean(options?.force);

  if (!channelAccessToken) {
    return {
      ok: false,
      companyId,
      reason: "missing_channel_access_token",
      dueCount: 0,
      fetchedRowCount: 0,
      sent: false,
    };
  }

  const salespersonEnabled = settings.enabled || force;
  const salespersonInWindow = force || shouldRunScheduledReminder(settings);
  const canPushSalesperson = salespersonEnabled && salespersonInWindow && salespersonUserId.length > 0;

  const { rows, error, due } = await fetchReminderCheckState(companyId);
  const fetchedRowCount = rows.length;

  if (error) {
    return {
      ok: false,
      companyId,
      reason: error,
      dueCount: 0,
      fetchedRowCount: 0,
      sent: false,
    };
  }

  const message = formatLineReminderMessage(due, lang);

  const supabase = getSupabaseServer();
  await Promise.all(
    due.map(async (c) => {
      const name = c.customer_name?.trim() || (lang === "zh" ? "客戶" : "Customer");
      const hint =
        c.follow_up_note?.trim() ||
        formatFollowUpDateDisplay(c.follow_up_date, lang);
      const copy = buildFollowUpReminderNotification(name, hint, lang);
      await createCrmNotification(supabase, {
        companyId,
        type: "follow_up_reminder",
        title: copy.title,
        body: copy.body,
        customerId: String(c.id),
        dedupePerDay: true,
      });
    }),
  );

  // Customer-side push always runs when channel access token is present and we have due rows.
  const customerPushes = await pushDueCustomerReminders(due, channelAccessToken, companyId);

  if (due.length === 0 && !force) {
    return {
      ok: true,
      companyId,
      skipped: true,
      reason: "no_due_customers",
      dueCount: 0,
      fetchedRowCount,
      sent: false,
      preview: message,
      customerPushes,
    };
  }

  if (!canPushSalesperson) {
    return {
      ok: true,
      companyId,
      skipped: true,
      reason: !settings.enabled
        ? "salesperson_disabled"
        : !salespersonUserId
          ? "missing_user_id"
          : "outside_schedule",
      dueCount: due.length,
      fetchedRowCount,
      sent: false,
      preview: message,
      customerPushes,
    };
  }

  const notify = await sendLinePushMessage(message, channelAccessToken, salespersonUserId);

  if (!notify.ok) {
    return {
      ok: false,
      companyId,
      dueCount: due.length,
      fetchedRowCount,
      sent: false,
      lineError: notify.error,
      preview: message,
      customerPushes,
    };
  }

  if (!force) {
    await markReminderSentToday();
  }

  return {
    ok: true,
    companyId,
    dueCount: due.length,
    fetchedRowCount,
    sent: true,
    preview: message,
    customerPushes,
  };
}

export async function fetchDueReminderCustomers(
  companyId: number = DEFAULT_COMPANY_ID,
): Promise<DueReminderCustomer[]> {
  const { due, error } = await fetchReminderCheckState(companyId);
  if (error) return [];
  return due;
}
