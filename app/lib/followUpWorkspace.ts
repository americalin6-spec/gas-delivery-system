import { formatLocalYmd, isHighDealProbability, normalizeFollowUpDateValue, parseLocalYmd } from "./followUpReminders";
import { isReminderCompleted } from "./calendarReminders";
import {
  getRawCustomerStatus,
  isCustomerStatusExcludedFromTracking,
  normalizeCustomerStatus,
  type CustomerStatus,
} from "./customerStatus";
import { urgentActionLabel } from "./customerUrgency";

export type WorkspaceCustomerRow = {
  id: string | number;
  customer_name?: string | null;
  phone?: string | null;
  line_id?: string | null;
  customer_need?: string | null;
  success_rate?: string | null;
  deal_probability?: string | null;
  reminder_status?: string | null;
  customer_status?: string | null;
  status?: string | null;
  important_date?: string | null;
  urgent?: boolean | null;
  priority?: string | null;
  last_contacted_at?: string | null;
  last_contact_at?: string | null;
  next_follow_up_at?: string | null;
  follow_up_date?: string | null;
  follow_up_note?: string | null;
  note?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Customers created or updated within this window appear under「最近新增客戶」. */
export const RECENT_CUSTOMER_WINDOW_DAYS = 7;

export const WORKSPACE_CUSTOMER_SELECT =
  "id, customer_name, phone, line_id, customer_need, success_rate, reminder_status, customer_status, status, important_date, urgent, priority, last_contacted_at, last_contact_at, next_follow_up_at, follow_up_date, follow_up_note, note, next_step, follow_up, created_at, updated_at";

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Prefer next_follow_up_at; fall back to follow_up_date at 09:00 local. */
export function getEffectiveNextFollowUpAt(row: WorkspaceCustomerRow): Date | null {
  const ts = parseTimestamp(row.next_follow_up_at);
  if (ts) return ts;

  const ymd = normalizeFollowUpDateValue(row.follow_up_date);
  if (!ymd) return null;
  const base = parseLocalYmd(ymd);
  if (!base) return null;
  base.setHours(9, 0, 0, 0);
  return base;
}

export function getLastContactAt(row: WorkspaceCustomerRow): Date | null {
  return parseTimestamp(row.last_contacted_at) ?? parseTimestamp(row.last_contact_at);
}

export function isWorkspaceTrackingEligible(row: WorkspaceCustomerRow): boolean {
  return !isCustomerStatusExcludedFromTracking(getRawCustomerStatus(row));
}

export function isDueTodayWorkspace(row: WorkspaceCustomerRow): boolean {
  if (!isWorkspaceTrackingEligible(row)) return false;
  const at = getEffectiveNextFollowUpAt(row);
  if (!at) return false;
  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());
  return at >= todayStart && at <= todayEnd;
}

export function isOverdueWorkspace(row: WorkspaceCustomerRow): boolean {
  if (!isWorkspaceTrackingEligible(row)) return false;
  if (isReminderCompleted(row.reminder_status)) return false;
  const at = getEffectiveNextFollowUpAt(row);
  if (!at) return false;
  return at < startOfLocalDay(new Date());
}

export function isWorkspaceHighDeal(row: WorkspaceCustomerRow): boolean {
  if (!isWorkspaceTrackingEligible(row)) return false;
  const rates = [row.success_rate, row.deal_probability];
  for (const rate of rates) {
    if (rate == null) continue;
    if (isHighDealProbability(rate)) return true;
    const t = String(rate).trim();
    const pct = /^(\d+(?:\.\d+)?)\s*%?$/.exec(t.replace(/,/g, ""));
    if (pct && Number(pct[1]) >= 70) return true;
    const n = Number.parseFloat(t);
    if (!Number.isNaN(n) && n >= 70 && n <= 100) return true;
  }
  return false;
}

/** Newest-first sort key; independent of high-deal or other workspace categories. */
export function getCustomerRecencyTimestamp(row: WorkspaceCustomerRow): Date | null {
  const created = parseTimestamp(row.created_at);
  const updated = parseTimestamp(row.updated_at);
  if (created && updated) return created.getTime() >= updated.getTime() ? created : updated;
  return created ?? updated;
}

export function isRecentCustomerWorkspace(row: WorkspaceCustomerRow): boolean {
  if (!isWorkspaceTrackingEligible(row)) return false;
  const at = getCustomerRecencyTimestamp(row);
  if (!at) return false;
  const today = startOfLocalDay(new Date());
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - RECENT_CUSTOMER_WINDOW_DAYS);
  return startOfLocalDay(at) >= cutoff;
}

function compareByRecencyDesc(a: WorkspaceCustomerRow, b: WorkspaceCustomerRow): number {
  const ad = getCustomerRecencyTimestamp(a)?.getTime() ?? 0;
  const bd = getCustomerRecencyTimestamp(b)?.getTime() ?? 0;
  return bd - ad;
}

export function dedupeByCustomerId(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  const seen = new Set<string>();
  const result: WorkspaceCustomerRow[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(row);
  }
  return result;
}

export function filterTrackingEligible(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return rows.filter(isWorkspaceTrackingEligible);
}

export function filterDueToday(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return rows.filter(isDueTodayWorkspace);
}

export function filterOverdue(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return rows.filter(isOverdueWorkspace);
}

export function filterHighDeal(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return [...rows].filter(isWorkspaceHighDeal).sort(compareByRecencyDesc);
}

/** Recently created/updated customers; high-deal rows are not excluded. */
export function filterRecent(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return [...rows].filter(isRecentCustomerWorkspace).sort(compareByRecencyDesc);
}

export function buildNextFollowUpPatch(nextAt: Date): Record<string, string> {
  return {
    next_follow_up_at: nextAt.toISOString(),
    follow_up_date: formatLocalYmd(nextAt),
  };
}

export function postponePresetDate(preset: "1h" | "tomorrow" | "3d" | "next_week"): Date {
  const d = new Date();
  switch (preset) {
    case "1h":
      d.setHours(d.getHours() + 1);
      return d;
    case "tomorrow": {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case "3d": {
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case "next_week": {
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    default:
      return d;
  }
}

export function formatWorkspaceDateTime(value: unknown, lang: "zh" | "en"): string {
  const d = parseTimestamp(value);
  if (!d) return "—";
  try {
    return d.toLocaleString(lang === "zh" ? "zh-TW" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

/** Follow-up timing label (distinct from sales `customer_status`「已排程」). */
export function followUpStatusLabel(row: WorkspaceCustomerRow, lang: "zh" | "en"): string {
  const urgent = urgentActionLabel(row.important_date, lang);
  if (urgent) return urgent;
  if (isReminderCompleted(row.reminder_status)) return lang === "zh" ? "追蹤已完成" : "Follow-up done";
  if (isOverdueWorkspace(row)) return lang === "zh" ? "逾期" : "Overdue";
  if (isDueTodayWorkspace(row)) return lang === "zh" ? "今日待追蹤" : "Due today";
  const at = getEffectiveNextFollowUpAt(row);
  if (!at) return lang === "zh" ? "未排程追蹤" : "Not scheduled";
  return lang === "zh" ? "已排程追蹤" : "Scheduled";
}

export function getWorkspaceCustomerStatus(row: WorkspaceCustomerRow): CustomerStatus {
  return normalizeCustomerStatus(getRawCustomerStatus(row));
}
