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
  sent: boolean;
  lineError?: string;
  preview?: string;
};

export async function runReminderCheck(options?: {
  force?: boolean;
  lang?: "zh" | "en";
}): Promise<ReminderCheckResult> {
  const lang = options?.lang ?? "zh";
  const settings = await loadLineReminderSettings();

  if (!settings.enabled && !options?.force) {
    return { ok: true, skipped: true, reason: "disabled", dueCount: 0, sent: false };
  }

  if (!settings.channel_access_token.trim()) {
    return { ok: false, reason: "missing_channel_access_token", dueCount: 0, sent: false };
  }

  if (!settings.user_id.trim()) {
    return { ok: false, reason: "missing_user_id", dueCount: 0, sent: false };
  }

  if (!options?.force && !shouldRunScheduledReminder(settings)) {
    return {
      ok: true,
      skipped: true,
      reason: "outside_schedule",
      dueCount: 0,
      sent: false,
    };
  }

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("customers").select(REMINDER_CHECK_SELECT);

  if (error) {
    return { ok: false, reason: error.message, dueCount: 0, sent: false };
  }

  const due = filterDueFollowUpCustomers((data ?? []) as ReminderCustomerRow[]);
  const message = formatLineReminderMessage(due, lang);

  if (due.length === 0 && !options?.force) {
    return { ok: true, skipped: true, reason: "no_due_customers", dueCount: 0, sent: false, preview: message };
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
    sent: true,
    preview: message,
  };
}

export async function fetchDueReminderCustomers(): Promise<DueReminderCustomer[]> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("customers").select(REMINDER_CHECK_SELECT);
  if (error) return [];
  return filterDueFollowUpCustomers((data ?? []) as ReminderCustomerRow[]);
}
