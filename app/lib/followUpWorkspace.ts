import { formatLocalYmd, isHighDealProbability, normalizeFollowUpDateValue, parseLocalYmd } from "./followUpReminders";
import { isReminderCompleted } from "./calendarReminders";

export type WorkspaceCustomerRow = {
  id: string | number;
  customer_name?: string | null;
  phone?: string | null;
  line_id?: string | null;
  customer_need?: string | null;
  success_rate?: string | null;
  deal_probability?: string | null;
  reminder_status?: string | null;
  status?: string | null;
  last_contacted_at?: string | null;
  last_contact_at?: string | null;
  next_follow_up_at?: string | null;
  follow_up_date?: string | null;
  follow_up_note?: string | null;
  note?: string | null;
  next_step?: string | null;
  follow_up?: string | null;
  created_at?: string | null;
};

export const WORKSPACE_CUSTOMER_SELECT =
  "id, customer_name, phone, line_id, customer_need, success_rate, reminder_status, status, last_contacted_at, last_contact_at, next_follow_up_at, follow_up_date, follow_up_note, note, next_step, follow_up, created_at";

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

export function isPipelineClosed(row: WorkspaceCustomerRow): boolean {
  const st = String(row.status ?? "")
    .trim()
    .toLowerCase();
  return st === "won" || st === "lost";
}

export function isDueTodayWorkspace(row: WorkspaceCustomerRow): boolean {
  const at = getEffectiveNextFollowUpAt(row);
  if (!at) return false;
  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());
  return at >= todayStart && at <= todayEnd;
}

export function isOverdueWorkspace(row: WorkspaceCustomerRow): boolean {
  if (isReminderCompleted(row.reminder_status)) return false;
  if (isPipelineClosed(row)) return false;
  const at = getEffectiveNextFollowUpAt(row);
  if (!at) return false;
  return at < startOfLocalDay(new Date());
}

export function isWorkspaceHighDeal(row: WorkspaceCustomerRow): boolean {
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

export function isRecentCustomerWorkspace(row: WorkspaceCustomerRow): boolean {
  const created = parseTimestamp(row.created_at);
  if (!created) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  cutoff.setHours(0, 0, 0, 0);
  return created >= cutoff;
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

export function filterDueToday(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return rows.filter(isDueTodayWorkspace);
}

export function filterOverdue(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return rows.filter(isOverdueWorkspace);
}

export function filterHighDeal(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return rows.filter(isWorkspaceHighDeal);
}

export function filterRecent(rows: WorkspaceCustomerRow[]): WorkspaceCustomerRow[] {
  return [...rows]
    .filter(isRecentCustomerWorkspace)
    .sort((a, b) => {
      const ad = parseTimestamp(a.created_at)?.getTime() ?? 0;
      const bd = parseTimestamp(b.created_at)?.getTime() ?? 0;
      return bd - ad;
    });
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

export function followUpStatusLabel(row: WorkspaceCustomerRow, lang: "zh" | "en"): string {
  if (isReminderCompleted(row.reminder_status)) return lang === "zh" ? "已完成" : "Completed";
  if (isOverdueWorkspace(row)) return lang === "zh" ? "逾期" : "Overdue";
  if (isDueTodayWorkspace(row)) return lang === "zh" ? "今日待追蹤" : "Due today";
  const at = getEffectiveNextFollowUpAt(row);
  if (!at) return lang === "zh" ? "未排程" : "Not scheduled";
  return lang === "zh" ? "已排程" : "Scheduled";
}
