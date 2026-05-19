import {
  formatLocalYmd,
  isHighDealProbability,
  normalizeFollowUpDateValue,
  parseLocalYmd,
} from "./followUpReminders";
import type { AppLang } from "./appLang";

/** DB column names (snake_case) — maps to followUpDate / urgency / reminderStatus in product copy */
export type ReminderCustomerRow = {
  id: string | number;
  customer_name?: string | null;
  company_name?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
  estimated_amount?: string | null;
  success_rate?: string | null;
  follow_up_date?: string | null;
  next_follow_up_at?: string | null;
  urgency?: string | null;
  reminder_status?: string | null;
  last_contacted_at?: string | null;
  line_id?: string | null;
};

export type FollowUpUrgency =
  | "completed"
  | "overdue_today"
  | "within_3"
  | "within_7"
  | "later"
  | "none";

export type UrgencyVisual = {
  urgency: FollowUpUrgency;
  diffDays: number | null;
  border: string;
  bg: string;
  badgeBg: string;
  badgeColor: string;
  labelZh: string;
  labelEn: string;
};

export const CALENDAR_CUSTOMER_SELECT =
  "id, customer_name, company_name, next_step, follow_up, estimated_amount, success_rate, follow_up_date, urgency, reminder_status, last_contacted_at, line_id";

export function isReminderCompleted(status?: string | null): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase() === "completed";
}

export function diffDaysFromToday(ymd: string): number | null {
  const target = parseLocalYmd(ymd);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Compute urgency from follow-up date + reminder status (UI colors). */
export function resolveFollowUpUrgency(
  followUpDate?: unknown,
  reminderStatus?: string | null,
): FollowUpUrgency {
  if (isReminderCompleted(reminderStatus)) return "completed";

  const ymd = normalizeFollowUpDateValue(followUpDate);
  if (!ymd) return "none";

  const diff = diffDaysFromToday(ymd);
  if (diff === null) return "none";
  if (diff < 0 || diff === 0) return "overdue_today";
  if (diff <= 3) return "within_3";
  if (diff <= 7) return "within_7";
  return "later";
}

export function urgencyVisual(urgency: FollowUpUrgency): UrgencyVisual {
  const map: Record<FollowUpUrgency, Omit<UrgencyVisual, "urgency" | "diffDays">> = {
    completed: {
      border: "rgba(148,163,184,0.55)",
      bg: "rgba(51,65,85,0.45)",
      badgeBg: "rgba(100,116,139,0.35)",
      badgeColor: "#cbd5e1",
      labelZh: "已完成",
      labelEn: "Completed",
    },
    overdue_today: {
      border: "rgba(239,68,68,0.75)",
      bg: "rgba(127,29,29,0.28)",
      badgeBg: "rgba(239,68,68,0.25)",
      badgeColor: "#fecaca",
      labelZh: "逾期／今日",
      labelEn: "Overdue / today",
    },
    within_3: {
      border: "rgba(249,115,22,0.75)",
      bg: "rgba(124,45,18,0.28)",
      badgeBg: "rgba(249,115,22,0.22)",
      badgeColor: "#fed7aa",
      labelZh: "3 天內",
      labelEn: "Within 3 days",
    },
    within_7: {
      border: "rgba(234,179,8,0.75)",
      bg: "rgba(113,63,18,0.28)",
      badgeBg: "rgba(234,179,8,0.22)",
      badgeColor: "#fef08a",
      labelZh: "7 天內",
      labelEn: "Within 7 days",
    },
    later: {
      border: "rgba(34,197,94,0.65)",
      bg: "rgba(20,83,45,0.22)",
      badgeBg: "rgba(34,197,94,0.2)",
      badgeColor: "#bbf7d0",
      labelZh: "7 天以上",
      labelEn: "7+ days",
    },
    none: {
      border: "rgba(148,163,184,0.35)",
      bg: "rgba(15,23,42,0.5)",
      badgeBg: "rgba(100,116,139,0.2)",
      badgeColor: "#94a3b8",
      labelZh: "未排程",
      labelEn: "Not scheduled",
    },
  };
  const base = map[urgency];
  return { urgency, diffDays: null, ...base };
}

export function urgencyLabel(visual: UrgencyVisual, lang: AppLang): string {
  return lang === "zh" ? visual.labelZh : visual.labelEn;
}

export function getCustomerUrgencyVisual(row: ReminderCustomerRow): UrgencyVisual {
  const u = resolveFollowUpUrgency(row.follow_up_date, row.reminder_status);
  const ymd = normalizeFollowUpDateValue(row.follow_up_date);
  const diff = ymd ? diffDaysFromToday(ymd) : null;
  return { ...urgencyVisual(u), diffDays: diff };
}

export function hasScheduledFollowUp(row: ReminderCustomerRow): boolean {
  return Boolean(normalizeFollowUpDateValue(row.follow_up_date));
}

export function sortByFollowUpDate(rows: ReminderCustomerRow[]): ReminderCustomerRow[] {
  return [...rows].sort((a, b) => {
    const ad = normalizeFollowUpDateValue(a.follow_up_date) ?? "9999-99-99";
    const bd = normalizeFollowUpDateValue(b.follow_up_date) ?? "9999-99-99";
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a.id).localeCompare(String(b.id));
  });
}

export function filterCalendarCustomers(rows: ReminderCustomerRow[]): ReminderCustomerRow[] {
  return sortByFollowUpDate(rows.filter(hasScheduledFollowUp));
}

export type NotificationBucket = "due_today" | "overdue" | "high_deal" | "no_contact_3d";

export type NotificationItem = {
  bucket: NotificationBucket;
  customer: ReminderCustomerRow;
  urgency: UrgencyVisual;
};

function daysSinceContact(lastContact?: string | null): number | null {
  if (!lastContact?.trim()) return null;
  const d = new Date(lastContact);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}

export function buildNotificationItems(rows: ReminderCustomerRow[]): NotificationItem[] {
  const todayYmd = formatLocalYmd(new Date());
  const items: NotificationItem[] = [];
  const seen = new Set<string>();

  const push = (bucket: NotificationBucket, row: ReminderCustomerRow) => {
    const key = `${bucket}:${row.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      bucket,
      customer: row,
      urgency: getCustomerUrgencyVisual(row),
    });
  };

  for (const row of rows) {
    if (isReminderCompleted(row.reminder_status)) continue;
    const ymd = normalizeFollowUpDateValue(row.follow_up_date);
    if (ymd === todayYmd) push("due_today", row);
    if (ymd) {
      const diff = diffDaysFromToday(ymd);
      if (diff !== null && diff < 0) push("overdue", row);
    }
  }

  for (const row of rows) {
    if (isHighDealProbability(row.success_rate)) push("high_deal", row);
  }

  for (const row of rows) {
    if (isReminderCompleted(row.reminder_status)) continue;
    const since = daysSinceContact(row.last_contacted_at);
    if (since === null || since >= 3) push("no_contact_3d", row);
  }

  return items;
}

/** Optional: sync computed urgency string for DB column (when column exists). */
export function urgencyToDbValue(urgency: FollowUpUrgency): string | null {
  if (urgency === "none") return null;
  return urgency;
}
