import { sendLinePushMessage } from "./lineMessaging";
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
import { getSupabaseServer } from "./supabaseServer";
import type { ReminderCustomerRow } from "./calendarReminders";

export type ReminderCheckResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  dueCount: number;
  /** Rows returned from `customers` select (helps debug RLS / empty data). */
  fetchedRowCount?: number;
  sent: boolean;
  lineError?: string;
  preview?: string;
};

/** Load CRM rows and compute due list (Taipei calendar + follow_up_date / next_follow_up_at). */
export async function fetchReminderCheckState(): Promise<{
  rows: ReminderCustomerRow[];
  error: string | null;
  due: DueReminderCustomer[];
}> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("customers").select(REMINDER_CHECK_SELECT);
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
}): Promise<ReminderCheckResult> {
  const lang = options?.lang ?? "zh";
  const settings = await loadLineReminderSettings();

  if (!settings.enabled && !options?.force) {
    return { ok: true, skipped: true, reason: "disabled", dueCount: 0, fetchedRowCount: 0, sent: false };
  }

  if (!settings.channel_access_token.trim()) {
    return { ok: false, reason: "missing_channel_access_token", dueCount: 0, fetchedRowCount: 0, sent: false };
  }

  if (!settings.user_id.trim()) {
    return { ok: false, reason: "missing_user_id", dueCount: 0, fetchedRowCount: 0, sent: false };
  }

  if (!options?.force && !shouldRunScheduledReminder(settings)) {
    return {
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      dueCount: 0,
      fetchedRowCount: 0,
      sent: false,
    };
  }

  const { rows, error, due } = await fetchReminderCheckState();
  const fetchedRowCount = rows.length;

  if (error) {
    return { ok: false, reason: error, dueCount: 0, fetchedRowCount: 0, sent: false };
  }

  const message = formatLineReminderMessage(due, lang);

  if (due.length === 0 && !options?.force) {
    return {
      ok: true,
      skipped: true,
      reason: "no_due_customers",
      dueCount: 0,
      fetchedRowCount,
      sent: false,
      preview: message,
    };
  }

  const notify = await sendLinePushMessage(
    message,
    settings.channel_access_token,
    settings.user_id,
  );

  if (!notify.ok) {
    return {
      ok: false,
      dueCount: due.length,
      fetchedRowCount,
      sent: false,
      lineError: notify.error,
      preview: message,
    };
  }

  if (!options?.force) {
    await markReminderSentToday();
  }

  return {
    ok: true,
    dueCount: due.length,
    fetchedRowCount,
    sent: true,
    preview: message,
  };
}

export async function fetchDueReminderCustomers(): Promise<DueReminderCustomer[]> {
  const { due, error } = await fetchReminderCheckState();
  if (error) return [];
  return due;
}
